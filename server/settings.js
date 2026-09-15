import crypto from 'node:crypto';
import { asJson, one, query } from './db.js';

const SETTING_KEY = 'site';
const modeValue = value => ['test', 'prod', 'sandbox'].includes(value) ? value : 'test';
const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const safeUrl = value => { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; } };
const cents = value => { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; };
const configSecret = () => {
  const source = process.env.AUTH_SECRET || process.env.ADMIN_TOKEN;
  if (source) return crypto.createHash('sha256').update(source).digest();
  if ((process.env.DATA_MODE || 'demo') === 'demo') return crypto.createHash('sha256').update('trend-top-demo-settings').digest();
  throw new Error('AUTH_SECRET or ADMIN_TOKEN is required to protect billing settings');
};
const encrypt = object => {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', configSecret(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(object), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
};
const decrypt = value => {
  if (!value) return {};
  try {
    const [iv, tag, body] = String(value).split('.').map(part => Buffer.from(part, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', configSecret(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'));
  } catch { return {}; }
};

export function defaultSettings() {
  const mode = modeValue(process.env.CREEM_MODE);
  return {
    public: {
      billing: {
        enabled: false,
        mode,
        currency: (process.env.CREEM_CURRENCY || 'USD').toUpperCase(),
        weeklyPrice: cents(process.env.CREEM_PRICE_PRO_WEEKLY),
        monthlyPrice: cents(process.env.CREEM_PRICE_PRO_MONTHLY),
        weeklyProductId: process.env.CREEM_PRODUCT_PRO_WEEKLY || '',
        monthlyProductId: process.env.CREEM_PRODUCT_PRO_MONTHLY || '',
        apiBaseUrl: cleanUrl(process.env.CREEM_API_BASE_URL || (mode === 'prod' ? 'https://api.creem.io' : 'https://test-api.creem.io')),
        graceDays: Math.max(0, Math.min(30, Number(process.env.BILLING_GRACE_DAYS || 3)))
      },
      contact: { email: process.env.CONTACT_EMAIL || '' },
      social: { x: safeUrl(process.env.SOCIAL_X_URL), facebook: safeUrl(process.env.SOCIAL_FACEBOOK_URL), telegram: safeUrl(process.env.SOCIAL_TELEGRAM_URL) }
    },
    secret: { creemApiKey: process.env.CREEM_API_KEY || '', creemWebhookSecret: process.env.CREEM_WEBHOOK_SECRET || '' }
  };
}

export async function getSettings() {
  const defaults = defaultSettings();
  const row = await one('SELECT public_data, secret_data FROM app_settings WHERE key=$1', [SETTING_KEY]);
  if (!row) return defaults;
  const stored = asJson(row.public_data, {});
  return {
    public: {
      billing: { ...defaults.public.billing, ...(stored.billing || {}) },
      contact: { ...defaults.public.contact, ...(stored.contact || {}) },
      social: { ...defaults.public.social, ...(stored.social || {}) }
    },
    secret: { ...defaults.secret, ...decrypt(row.secret_data) }
  };
}

export async function saveSettings(input) {
  const current = await getSettings();
  const billing = input?.billing || {}, contact = input?.contact || {}, social = input?.social || {}, secrets = input?.secrets || {};
  const mode = modeValue(billing.mode ?? current.public.billing.mode);
  const publicData = {
    billing: {
      enabled: Boolean(billing.enabled), mode,
      currency: String(billing.currency || current.public.billing.currency || 'USD').trim().toUpperCase().slice(0, 3),
      weeklyPrice: cents(billing.weeklyPrice), monthlyPrice: cents(billing.monthlyPrice),
      weeklyProductId: String(billing.weeklyProductId || '').trim().slice(0, 160), monthlyProductId: String(billing.monthlyProductId || '').trim().slice(0, 160),
      apiBaseUrl: cleanUrl(billing.apiBaseUrl || (mode === 'prod' ? 'https://api.creem.io' : 'https://test-api.creem.io')),
      graceDays: Math.max(0, Math.min(30, Number(billing.graceDays ?? 3)))
    },
    contact: { email: String(contact.email || '').trim().slice(0, 254) },
    social: { x: safeUrl(social.x), facebook: safeUrl(social.facebook), telegram: safeUrl(social.telegram) }
  };
  const secret = {
    creemApiKey: secrets.creemApiKey === undefined ? current.secret.creemApiKey : String(secrets.creemApiKey || '').trim(),
    creemWebhookSecret: secrets.creemWebhookSecret === undefined ? current.secret.creemWebhookSecret : String(secrets.creemWebhookSecret || '').trim()
  };
  const now = new Date().toISOString();
  await query(`INSERT INTO app_settings (key,public_data,secret_data,updated_at) VALUES ($1,$2::jsonb,$3,$4)
    ON CONFLICT (key) DO UPDATE SET public_data=EXCLUDED.public_data,secret_data=EXCLUDED.secret_data,updated_at=EXCLUDED.updated_at`, [SETTING_KEY, JSON.stringify(publicData), encrypt(secret), now]);
  return { public: publicData, configured: Boolean(secret.creemApiKey && secret.creemWebhookSecret), secretFlags: { creemApiKey: Boolean(secret.creemApiKey), creemWebhookSecret: Boolean(secret.creemWebhookSecret) } };
}

export async function publicSettings() {
  const settings = await getSettings();
  const billing = settings.public.billing;
  return {
    billing: { enabled: billing.enabled, mode: billing.mode, currency: billing.currency, weeklyPrice: billing.weeklyPrice, monthlyPrice: billing.monthlyPrice },
    contact: settings.public.contact, social: settings.public.social
  };
}

