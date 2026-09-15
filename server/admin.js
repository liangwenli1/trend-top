import { query } from './db.js';
import { authUser, isAdminEmail } from './auth.js';
import { getSettings, saveSettings } from './settings.js';

// Administrators are ordinary accounts whose email is listed in ADMIN_EMAILS
// (config.json admin.emails). There is no separate token sign-in.
export async function requireAdmin(req, res, next) {
  const user = await authUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in with an administrator account' });
  if (!isAdminEmail(user.email)) return res.status(403).json({ error: 'This account is not an administrator' });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.get('origin');
    const expected = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).origin : `${req.protocol}://${req.get('host')}`;
    const localDemo = (process.env.DATA_MODE || 'demo') === 'demo' && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin || '');
    if (origin && origin !== expected && origin !== `${req.protocol}://${req.get('host')}` && !localDemo) return res.status(403).json({ error: 'Invalid request origin' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON request required' });
  }
  req.user = user;
  next();
}

export function registerAdminRoutes(app) {
  app.get('/api/admin/auth/me', async (req, res) => {
    const user = await authUser(req);
    res.json({ admin: Boolean(user && isAdminEmail(user.email)), signedIn: Boolean(user), email: user?.email || null });
  });
  app.get('/api/admin/settings', requireAdmin, async (_req, res) => {
    const settings = await getSettings();
    res.json({ settings: settings.public, configured: Boolean(settings.secret.creemApiKey && settings.secret.creemWebhookSecret), secretFlags: { creemApiKey: Boolean(settings.secret.creemApiKey), creemWebhookSecret: Boolean(settings.secret.creemWebhookSecret) } });
  });
  app.put('/api/admin/settings', requireAdmin, async (req, res) => res.json(await saveSettings(req.body)));
  app.get('/api/admin', requireAdmin, async (_req, res) => {
    res.json({
      runs: await query('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 30').then(r => r.rows),
      deliveries: await query('SELECT * FROM deliveries ORDER BY id DESC LIMIT 30').then(r => r.rows),
      reports: await query('SELECT * FROM classification_reports ORDER BY id DESC LIMIT 30').then(r => r.rows)
    });
  });
}
