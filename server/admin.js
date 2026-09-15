import crypto from 'node:crypto';
import { one, query } from './db.js';
import { getSettings, saveSettings } from './settings.js';

const COOKIE = 'trend_top_admin';
const loginAttempts = new Map();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const cookieValue = req => String(req.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
const secureCookie = req => String(process.env.PUBLIC_URL || '').startsWith('https://') || req.secure;
const cookie = (req, value, age) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookie(req) ? '; Secure' : ''}`;
const same = (left, right) => {
  const a = Buffer.from(digest(left)), b = Buffer.from(digest(right));
  return crypto.timingSafeEqual(a, b);
};

export async function requireAdmin(req, res, next) {
  const token = cookieValue(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({ error: 'Admin sign in required' });
  const session = await one('SELECT token_hash FROM admin_sessions WHERE token_hash=$1 AND expires_at>$2', [digest(token), new Date().toISOString()]);
  if (!session) return res.status(401).json({ error: 'Admin sign in required' });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.get('origin');
    const expected = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).origin : `${req.protocol}://${req.get('host')}`;
    const localDemo = (process.env.DATA_MODE || 'demo') === 'demo' && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin || '');
    if (origin && origin !== expected && origin !== `${req.protocol}://${req.get('host')}` && !localDemo) return res.status(403).json({ error: 'Invalid request origin' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON request required' });
  }
  next();
}

export function registerAdminRoutes(app) {
  app.post('/api/admin/auth/login', async (req, res) => {
    const key = req.ip || 'local', nowMs = Date.now(), recent = (loginAttempts.get(key) || []).filter(at => nowMs - at < 15 * 60000);
    if (recent.length >= 8) return res.status(429).json({ error: 'Too many administrator sign-in attempts' });
    recent.push(nowMs); loginAttempts.set(key, recent);
    const expected = process.env.ADMIN_TOKEN || '';
    if (!expected || !same(String(req.body?.token || ''), expected)) return res.status(401).json({ error: 'Invalid administrator token' });
    const token = crypto.randomBytes(32).toString('hex'), now = new Date(), expires = new Date(now.getTime() + 12 * 3600000);
    await query('DELETE FROM admin_sessions WHERE expires_at<$1', [now.toISOString()]);
    await query('INSERT INTO admin_sessions (token_hash,expires_at,created_at) VALUES ($1,$2,$3)', [digest(token), expires.toISOString(), now.toISOString()]);
    loginAttempts.delete(key);
    res.set('Set-Cookie', cookie(req, token, 12 * 3600)).json({ ok: true });
  });
  app.get('/api/admin/auth/me', requireAdmin, (_req, res) => res.json({ admin: true }));
  app.post('/api/admin/auth/logout', requireAdmin, async (req, res) => {
    await query('DELETE FROM admin_sessions WHERE token_hash=$1', [digest(cookieValue(req))]);
    res.set('Set-Cookie', cookie(req, '', 0)).json({ ok: true });
  });
  app.get('/api/admin/settings', requireAdmin, async (_req, res) => {
    const settings = await getSettings();
    res.json({ settings: settings.public, configured: Boolean(settings.secret.creemApiKey && settings.secret.creemWebhookSecret), secretFlags: { creemApiKey: Boolean(settings.secret.creemApiKey), creemWebhookSecret: Boolean(settings.secret.creemWebhookSecret) } });
  });
  app.put('/api/admin/settings', requireAdmin, async (req, res) => res.json(await saveSettings(req.body)));
}
