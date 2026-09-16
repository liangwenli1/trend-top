import crypto from 'node:crypto';
import { asJson, one, query } from './db.js';

const SETTING_KEY = 'site';
const modeValue = value => ['test', 'prod', 'sandbox'].includes(value) ? value : 'test';
const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const safeUrl = value => { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; } };
const amount = value => { const number = Number(String(value ?? '').trim()); return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0; };
const currencyCode = (value, fallback) => { const code = String(value || '').trim().toUpperCase(); return /^[A-Z]{3}$/.test(code) ? code : fallback; };
const LOCALES = ['en', 'zh'];
const DEFAULT_CURRENCY = { en: 'USD', zh: 'CNY' };
// Prices are display values in major units (9.99), one set per site language. Creem charges the product's own price.
const normalizePrices = (input, fallback) => Object.fromEntries(LOCALES.map(locale => {
  const source = input?.[locale] || {}, base = fallback?.[locale] || {};
  return [locale, {
    currency: currencyCode(source.currency ?? base.currency, DEFAULT_CURRENCY[locale]),
    monthly: amount(source.monthly ?? base.monthly),
    yearly: amount(source.yearly ?? base.yearly)
  }];
}));
// Settings saved before per-locale prices stored one currency plus integer cents.
const legacyPrices = billing => billing && !billing.prices && (billing.weeklyPrice || billing.monthlyPrice)
  ? { en: { currency: currencyCode(billing.currency, 'USD'), monthly: amount(Number(billing.monthlyPrice || 0) / 100), yearly: 0 } }
  : null;
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
      authentication: { googleEnabled: false, googleClientId: '' },
      billing: {
        enabled: false,
        mode,
        prices: normalizePrices({
          en: { currency: process.env.CREEM_CURRENCY, monthly: process.env.CREEM_PRICE_PRO_MONTHLY, yearly: process.env.CREEM_PRICE_PRO_YEARLY },
          zh: { currency: process.env.CREEM_CURRENCY_ZH, monthly: process.env.CREEM_PRICE_PRO_MONTHLY_ZH, yearly: process.env.CREEM_PRICE_PRO_YEARLY_ZH }
        }),
        monthlyProductId: process.env.CREEM_PRODUCT_PRO_MONTHLY || '',
        yearlyProductId: process.env.CREEM_PRODUCT_PRO_YEARLY || '',
        apiBaseUrl: cleanUrl(process.env.CREEM_API_BASE_URL || (mode === 'prod' ? 'https://api.creem.io' : 'https://test-api.creem.io')),
        graceDays: Math.max(0, Math.min(30, Number(process.env.BILLING_GRACE_DAYS || 3)))
      },
      collection: {
        websiteEnrichment: true,
        firecrawlApiUrl: cleanUrl(process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev')
      },
      contact: { email: process.env.CONTACT_EMAIL || '' },
      social: { x: safeUrl(process.env.SOCIAL_X_URL), facebook: safeUrl(process.env.SOCIAL_FACEBOOK_URL), telegram: safeUrl(process.env.SOCIAL_TELEGRAM_URL) }
    },
    secret: { creemApiKey: process.env.CREEM_API_KEY || '', creemWebhookSecret: process.env.CREEM_WEBHOOK_SECRET || '', firecrawlApiKey: process.env.FIRECRAWL_API_KEY || '', googleClientSecret: '' }
  };
}

export async function getSettings() {
  const defaults = defaultSettings();
  const row = await one('SELECT public_data, secret_data FROM app_settings WHERE key=$1', [SETTING_KEY]);
  if (!row) return defaults;
  const stored = asJson(row.public_data, {});
  // Older settings stored one currency with integer cents and a weekly product; both are dropped here.
  const { currency: _c, weeklyPrice: _w, monthlyPrice: _m, weeklyProductId: _wp, ...storedBilling } = stored.billing || {};
  const storedSecret = decrypt(row.secret_data);
  const secret = { ...defaults.secret };
  for (const [key, value] of Object.entries(storedSecret)) {
    if (String(value || '').trim()) secret[key] = value;
  }
  return {
    public: {
      authentication: { ...defaults.public.authentication, ...(stored.authentication || {}) },
      billing: { ...defaults.public.billing, ...storedBilling, prices: normalizePrices(stored.billing?.prices || legacyPrices(stored.billing), defaults.public.billing.prices) },
      collection: { ...defaults.public.collection, ...(stored.collection || {}) },
      contact: { ...defaults.public.contact, ...(stored.contact || {}) },
      social: { ...defaults.public.social, ...(stored.social || {}) }
    },
    secret
  };
}

export async function saveSettings(input) {
  const current = await getSettings();
  const billing = input?.billing || {}, collection = input?.collection || {}, contact = input?.contact || {}, social = input?.social || {}, secrets = input?.secrets || {};
  const mode = modeValue(billing.mode ?? current.public.billing.mode);
  const publicData = {
    authentication: {
      googleEnabled: input?.authentication?.googleEnabled === undefined ? current.public.authentication.googleEnabled : Boolean(input.authentication.googleEnabled),
      googleClientId: String(input?.authentication?.googleClientId ?? current.public.authentication.googleClientId).trim().slice(0, 250)
    },
    billing: {
      enabled: Boolean(billing.enabled), mode,
      prices: normalizePrices(billing.prices, current.public.billing.prices),
      monthlyProductId: String(billing.monthlyProductId || '').trim().slice(0, 160), yearlyProductId: String(billing.yearlyProductId || '').trim().slice(0, 160),
      apiBaseUrl: cleanUrl(billing.apiBaseUrl || (mode === 'prod' ? 'https://api.creem.io' : 'https://test-api.creem.io')),
      graceDays: Math.max(0, Math.min(30, Number(billing.graceDays ?? 3)))
    },
    collection: {
      websiteEnrichment: collection.websiteEnrichment === undefined ? current.public.collection.websiteEnrichment : Boolean(collection.websiteEnrichment),
      firecrawlApiUrl: cleanUrl(collection.firecrawlApiUrl || current.public.collection.firecrawlApiUrl || 'https://api.firecrawl.dev')
    },
    contact: { email: String(contact.email || '').trim().slice(0, 254) },
    social: { x: safeUrl(social.x), facebook: safeUrl(social.facebook), telegram: safeUrl(social.telegram) }
  };
  const secret = {
    googleClientSecret: secrets.googleClientSecret === undefined ? current.secret.googleClientSecret : String(secrets.googleClientSecret || '').trim(),
    creemApiKey: secrets.creemApiKey === undefined ? current.secret.creemApiKey : String(secrets.creemApiKey || '').trim(),
    creemWebhookSecret: secrets.creemWebhookSecret === undefined ? current.secret.creemWebhookSecret : String(secrets.creemWebhookSecret || '').trim(),
    firecrawlApiKey: secrets.firecrawlApiKey === undefined ? current.secret.firecrawlApiKey : String(secrets.firecrawlApiKey || '').trim()
  };
  const now = new Date().toISOString();
  await query(`INSERT INTO app_settings (key,public_data,secret_data,updated_at) VALUES ($1,$2::jsonb,$3,$4)
    ON CONFLICT (key) DO UPDATE SET public_data=EXCLUDED.public_data,secret_data=EXCLUDED.secret_data,updated_at=EXCLUDED.updated_at`, [SETTING_KEY, JSON.stringify(publicData), encrypt(secret), now]);
  return { public: publicData, configured: Boolean(secret.creemApiKey && secret.creemWebhookSecret), secretFlags: { creemApiKey: Boolean(secret.creemApiKey), creemWebhookSecret: Boolean(secret.creemWebhookSecret), firecrawlApiKey: Boolean(secret.firecrawlApiKey), googleClientSecret: Boolean(secret.googleClientSecret) } };
}

export async function publicSettings() {
  const settings = await getSettings();
  const billing = settings.public.billing;
  return {
    billing: { enabled: billing.enabled, mode: billing.mode, prices: billing.prices },
    contact: settings.public.contact, social: settings.public.social
  };
}

