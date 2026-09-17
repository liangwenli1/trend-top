import { transaction, query } from './db.js';
import { authUser, isAdminEmail } from './auth.js';
import { getSettings, saveSettings } from './settings.js';
import { TYPES } from './catalog.js';
import { performanceSummary } from './performance.js';
import { googleCallbackUrl } from './google-auth.js';
import { publicResponseCache } from './catalog-cache.js';
import { getCoverageReport } from './catalog-coverage.js';
import { operationsSummary } from './operations.js';
import { sourcePolicies, saveSourcePolicy, removeSourceData, reviewResource } from './source-policy.js';
import { saveProductRelationship, removeProductRelationship } from './product-families.js';
import { many, one } from './db.js';

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
  app.get('/api/admin/operations',requireAdmin,async(_req,res)=>res.json(await operationsSummary()));
  app.get('/api/admin/source-policies',requireAdmin,async(_req,res)=>res.json({items:await sourcePolicies()}));
  app.put('/api/admin/source-policies/:id',requireAdmin,async(req,res)=>{try{await saveSourcePolicy(req.params.id,req.body || {},req.user.email);res.json({ok:true})}catch(error){res.status(error.status || 500).json({error:error.message})}});
  app.post('/api/admin/source-policies/:id/remove',requireAdmin,async(req,res)=>{try{res.json(await removeSourceData(req.params.id,req.user.email,req.body?.evidence))}catch(error){res.status(error.status || 500).json({error:error.message})}});
  app.get('/api/admin/traces',requireAdmin,async(req,res)=>{
    const identity=String(req.query.identity || '').trim().toLowerCase().slice(0,200);
    const rows=await many('SELECT * FROM collection_traces WHERE identity=$1 ORDER BY id DESC LIMIT 100',[identity]);res.json({items:rows});
  });
  app.post('/api/admin/resource-review/:type/:id',requireAdmin,async(req,res)=>{try{res.json(await reviewResource(req.params.type,req.params.id,req.body || {},req.user.email))}catch(error){res.status(error.status || 500).json({error:error.message})}});
  app.get('/api/admin/product-relationships',requireAdmin,async(_req,res)=>res.json({items:await many('SELECT * FROM product_relationships ORDER BY repository')}));
  app.post('/api/admin/product-relationships',requireAdmin,async(req,res)=>{try{await saveProductRelationship(req.body || {},req.user.email);res.json({ok:true})}catch(error){res.status(error.status || 500).json({error:error.message})}});
  app.delete('/api/admin/product-relationships',requireAdmin,async(req,res)=>{try{await removeProductRelationship(req.body?.repository,req.body?.evidence,req.user.email);res.json({ok:true})}catch(error){res.status(error.status || 500).json({error:error.message})}});
  app.get('/api/admin/quality',requireAdmin,async(_req,res)=>res.json({reviews:await many('SELECT * FROM catalog_reviews ORDER BY id DESC LIMIT 100'),
    valueOverview:{feedbackRespondents:await one('SELECT COUNT(DISTINCT user_id)::int AS n FROM user_feedback'),savedAlerts:await many('SELECT rule,notify,COUNT(*)::int AS n FROM saved_searches GROUP BY rule,notify'),productionSubscriptions:await many("SELECT status,COUNT(*)::int AS n FROM billing_subscriptions WHERE mode='prod' GROUP BY status")},
    deliveryReviews:await many('SELECT * FROM delivery_reviews ORDER BY id DESC LIMIT 100'),
    feedback:await many('SELECT rating,COUNT(*)::int AS n FROM user_feedback GROUP BY rating'),
    uncertain:await many("SELECT id,subscription_id,local_date,status,attempts,last_error FROM deliveries WHERE status='uncertain' ORDER BY id DESC LIMIT 50")}));
  app.post('/api/admin/deliveries/:id/resolve',requireAdmin,async(req,res)=>{
    if(!['retry','accepted','skip'].includes(req.body?.action)||!String(req.body?.evidence || '').trim())return res.status(400).json({error:'Action and provider review evidence are required'});
    const status={retry:'failed',accepted:'sent',skip:'skipped'}[req.body.action];
    const result=await transaction(async()=>{
    const result=await query(`UPDATE deliveries SET status=$1,last_error=$2,attempts=CASE WHEN $1='failed' THEN 0 ELSE attempts END,
      sent_at=CASE WHEN $1='sent' THEN NOW() ELSE sent_at END,accepted_at=CASE WHEN $1='sent' THEN NOW() ELSE accepted_at END,
      snapshot=CASE WHEN $1='sent' THEN mail_payload->'snapshot' ELSE snapshot END WHERE id=$3 AND status='uncertain' RETURNING id`,[status,`Reviewed by ${req.user.email}: ${String(req.body.evidence).slice(0,500)}`,Number(req.params.id)]);
    if(result.rows.length)await query('INSERT INTO delivery_reviews (delivery_id,action,evidence,reviewed_by) VALUES ($1,$2,$3,$4)',[Number(req.params.id),req.body.action,String(req.body.evidence).slice(0,2000),req.user.email]);
    return result;});
    if(!result.rows.length)return res.status(404).json({error:'Uncertain delivery not found'});res.json({ok:true,status});
  });
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
      query('SELECT id,subscription_id,local_date,status,attempts,last_error,sent_at,accepted_at,claimed_at FROM deliveries ORDER BY id DESC LIMIT 30').then(r => r.rows),
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
