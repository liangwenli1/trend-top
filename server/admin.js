import { query } from './db.js';
import { authUser, isAdminEmail } from './auth.js';
import { getSettings, saveSettings } from './settings.js';
import { TYPES } from './catalog.js';
import { performanceSummary } from './performance.js';
import { googleCallbackUrl } from './google-auth.js';
import { publicResponseCache } from './catalog-cache.js';
import { getCoverageReport } from './catalog-coverage.js';

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
  app.get('/api/admin/catalog-coverage', requireAdmin, async (_req, res) => res.json(await getCoverageReport()));
  app.get('/api/admin/auth/me', async (req, res) => {
    const user = await authUser(req);
    res.json({ admin: Boolean(user && isAdminEmail(user.email)), signedIn: Boolean(user), email: user?.email || null });
  });
  app.get('/api/admin/settings', requireAdmin, async (req, res) => {
    const settings = await getSettings();
    res.json({ settings: settings.public, googleCallbackUrl: googleCallbackUrl(req), configured: Boolean(settings.secret.creemApiKey && settings.secret.creemWebhookSecret), secretFlags: { creemApiKey: Boolean(settings.secret.creemApiKey), creemWebhookSecret: Boolean(settings.secret.creemWebhookSecret), firecrawlApiKey: Boolean(settings.secret.firecrawlApiKey), googleClientSecret: Boolean(settings.secret.googleClientSecret) } });
  });
  app.put('/api/admin/settings', requireAdmin, async (req, res) => res.json(await saveSettings(req.body)));
  app.get('/api/admin', requireAdmin, async (_req, res) => {
    const [runs, queryStats, sources, candidates, deliveries, reports] = await Promise.all([
      query('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 30').then(r => r.rows),
      query('SELECT * FROM sync_query_stats ORDER BY id DESC LIMIT 100').then(r => r.rows),
      query('SELECT * FROM website_sources ORDER BY name').then(r => r.rows),
      query('SELECT * FROM catalog_candidates ORDER BY id DESC LIMIT 100').then(r => r.rows),
      query('SELECT * FROM deliveries ORDER BY id DESC LIMIT 30').then(r => r.rows),
      query('SELECT * FROM classification_reports ORDER BY id DESC LIMIT 30').then(r => r.rows)
    ]);
    res.json({ runs, queryStats, sources, candidates, deliveries, reports, performance: performanceSummary(), publicCache: publicResponseCache.summary() });
  });
  app.post('/api/admin/candidates', requireAdmin, async (req, res) => {
    const type = String(req.body?.type || 'website');
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'Invalid catalog type' });
    let url;
    try { url = new URL(String(req.body?.url || '')); } catch { return res.status(400).json({ error: 'A valid URL is required' }); }
    if (!['http:', 'https:'].includes(url.protocol)) return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are accepted' });
    const notes = String(req.body?.notes || '').trim().slice(0, 500);
    const result = await query(
      `INSERT INTO catalog_candidates (url,type,status,submitted_by,notes,created_at)
       VALUES ($1,$2,'pending',$3,$4,$5)
       ON CONFLICT (url,type) DO UPDATE SET status='pending',submitted_by=EXCLUDED.submitted_by,notes=EXCLUDED.notes,created_at=EXCLUDED.created_at,reviewed_at=NULL
       RETURNING *`,
      [url.href, type, req.user.email, notes, new Date().toISOString()]
    );
    res.status(201).json({ candidate: result.rows[0] });
  });
  app.patch('/api/admin/candidates/:id', requireAdmin, async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid candidate status' });
    const result = await query('UPDATE catalog_candidates SET status=$1,reviewed_at=$2 WHERE id=$3 RETURNING *', [status, new Date().toISOString(), Number(req.params.id)]);
    if (!result.rows.length) return res.status(404).json({ error: 'Candidate not found' });
    res.json({ candidate: result.rows[0] });
  });
}
