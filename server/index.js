import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asDay, asIso, asJson, asNumber, dbKind, many, one, query, ready, rebuildDerivedMetrics } from './db.js';
import { getRankings, getChart, getFilters, getStarSeries, boards, aiEvidence } from './rankings.js';
import {
  isType, getTypeSummary, getCatalogFilters, getCatalogRankings,
  getCatalogChart, getCatalogItem, getSimilar, getCategories, getCategory, getCompare, searchCatalog
} from './catalog.js';
import { mailReady, sendVerification } from './mail.js';
import { collect, digest, encryptManageToken, decryptManageToken, token, hash } from './jobs.js';
import { registerAuthRoutes } from './auth.js';
import { registerGoogleAuthRoutes } from './google-auth.js';
import { registerSubscriptionRoutes } from './subscriptions.js';
import { auditCopiedAssets } from './asset-classification.js';
import { proAccess } from './pro-access.js';
import { registerBillingRoutes } from './billing.js';
import { registerWatchRoutes } from './watches.js';
import { registerRefundRoutes } from './refunds.js';
import { normalizeTopics as canonicalTopics } from '../shared/topics.js';
import { registerCreemWebhookRoute } from './creem-webhook.js';
import { registerAdminRoutes, requireAdmin } from './admin.js';
import { publicSettings } from './settings.js';
import { enqueueTask } from './task-queue.js';
import { renderGainChart } from './png-chart.js';
import { lastCompleteDay } from './db.js';
import { parseChartEnd } from './digest-chart-date.js';
import { publicResponseCache } from './catalog-cache.js';
import { performanceMiddleware } from './performance.js';
import { catalogRevision } from './operations.js';
import { registerSavedSearchRoutes } from './saved-searches.js';
import { registerDigestImageRoutes } from './digest-snapshots.js';
import { getHomeDiscovery } from './homepage.js';
import { renderPublicDigestPreview } from './digest-preview.js';
import { USE_CASES } from '../shared/taxonomy.js';

const app = express();
app.disable('x-powered-by');
// Behind nginx/docker every request arrives from one gateway IP; trust those hops so rate limits and cookies use the real client.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
registerCreemWebhookRoute(app);
app.use(express.json({ limit: '20kb' }));
app.use(performanceMiddleware);
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(catalogRevision);
const publicCatalogCache = publicResponseCache.middleware;
const demo = (process.env.DATA_MODE || 'demo') === 'demo';
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validZone = z => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
const normalizeTopics = (value, fallback = '') => {
  const values = Array.isArray(value) ? value : [value ?? fallback];
  return [...new Set(values.flatMap(item => String(item ?? '').split(',')).map(item => item.trim()).filter(Boolean))].slice(0, 20).map(item => item.slice(0, 50));
};
const storedTopics = sub => {
  const parsed = asJson(sub?.topics, null);
  return canonicalTopics(Array.isArray(parsed) ? normalizeTopics(parsed) : normalizeTopics(undefined, sub?.topic || ''));
};
const storedLanguages = sub => {
  const parsed = asJson(sub?.languages, null);
  return Array.isArray(parsed) && parsed.length ? normalizeTopics(parsed) : normalizeTopics(undefined, sub?.language || '');
};
const fail = (res, status, message) => res.status(status).json({ error: message });
const bursts = new Map();
function rate(req, res, next) {
  const key = req.ip || 'local', now = Date.now(), value = bursts.get(key) || [];
  const recent = value.filter(t => now - t < 3600000);
  if (recent.length >= 12) return fail(res, 429, 'Too many requests. Try again later.');
  recent.push(now); bursts.set(key, recent); next();
}

async function manageSub(raw) {
  if (typeof raw !== 'string' || !raw.includes('.')) return null;
  const id = raw.split('.')[0];
  const sub = await one('SELECT * FROM subscriptions WHERE id = $1', [id]);
  if (!sub) return null;
  try {
    const stored = decryptManageToken(sub.manage_hash);
    return stored.length === raw.length && crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(raw)) ? sub : null;
  } catch {
    return null;
  }
}

app.get('/api/health', async (_req, res) => {
  await ready;
  res.json({ ok: true, mode: demo ? 'demo' : 'live', db: dbKind() });
});
app.get('/api/boards', publicCatalogCache, (_req, res) => res.json({ boards, mode: demo ? 'demo' : 'live' }));
registerAuthRoutes(app);
registerGoogleAuthRoutes(app);
registerSubscriptionRoutes(app);
registerBillingRoutes(app, { publicCache: publicCatalogCache });
registerWatchRoutes(app);
registerSavedSearchRoutes(app);
registerDigestImageRoutes(app);
registerRefundRoutes(app);
registerAdminRoutes(app);
app.get('/api/site-settings', publicCatalogCache, async (_req, res) => res.json(await publicSettings()));
app.get('/api/filters', publicCatalogCache, async (_req, res) => res.json(await getFilters()));
app.get('/api/rankings', publicCatalogCache, async (req, res) => res.json({ ...await getRankings(req.query), mailReady: demo || mailReady() }));
app.get('/api/chart', publicCatalogCache, async (req, res) => res.json(await getChart(req.query)));
app.get('/api/types', publicCatalogCache, async (_req, res) => res.json(await getTypeSummary()));
app.get('/api/home', publicCatalogCache, async (req, res) => {
  const type = req.query.type || '', useCase = req.query.useCase || '';
  if (typeof type !== 'string' || (type && !isType(type))) return fail(res, 400, 'Unknown type');
  if (typeof useCase !== 'string' || (useCase && !Object.hasOwn(USE_CASES, useCase))) return fail(res, 400, 'Unknown use case');
  res.json(await getHomeDiscovery({ type, useCase }));
});
app.get('/api/home/digest-preview', publicCatalogCache, async (req, res) => {
  const locale = req.query.locale === 'zh' ? 'zh' : 'en';
  const discovery = await getHomeDiscovery();
  res.json({ html: renderPublicDigestPreview(discovery, locale), sample: true, source: discovery.source });
});
app.get('/api/search', publicCatalogCache, async (req, res) => res.json(await searchCatalog(req.query.q, req.query.type)));
app.get('/api/:type/filters', publicCatalogCache, async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  res.json(await getCatalogFilters(req.params.type));
});
app.get('/api/:type/trending', publicCatalogCache, async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  res.json({ ...await getCatalogRankings(req.params.type, { ...req.query, period: req.query.period || 'day', board: req.query.board || 'hot' }), mailReady: demo || mailReady() });
});
app.get('/api/:type/rankings', publicCatalogCache, async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  res.json({ ...await getCatalogRankings(req.params.type, req.query), mailReady: demo || mailReady() });
});
app.get('/api/:type/charts', publicCatalogCache, async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  res.json(await getCatalogChart(req.params.type, req.query));
});
app.get('/api/:type/categories/:slug', publicCatalogCache, async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  res.json(await getCategory(req.params.type, req.params.slug, req.query));
});
app.get('/api/:type/categories', publicCatalogCache, async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  res.json(await getCategories(req.params.type));
});
app.get('/api/:type/compare', publicCatalogCache, async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  res.json(await getCompare(req.params.type, req.query.ids));
});
app.get('/api/:type/items/:id/similar', publicCatalogCache, async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  res.json(await getSimilar(req.params.type, req.params.id, req.query));
});
app.get('/api/:type/items/:id', publicCatalogCache, async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  const item = await getCatalogItem(req.params.type, req.params.id);
  if (!item) return fail(res, 404, 'Not found');
  res.json(item);
});
// Hosted PNG for the email digest: cumulative new Stars over the last N complete days.
app.get('/api/digest-chart/:type/:id.png', async (req, res) => {
  if (!isType(req.params.type)) return fail(res, 404, 'Unknown type');
  const days = Math.max(7, Math.min(90, Math.trunc(Number(req.query.days)) || 30));
  let requestedEnd;
  try { requestedEnd = parseChartEnd(req.query.end); }
  catch { return fail(res, 400, 'Invalid chart end date'); }
  let counts = [];
  if (req.params.type === 'github-repo') {
    const repo = await one('SELECT id, created_at FROM repos WHERE id = $1 OR full_name = $2', [Number(req.params.id) || -1, req.params.id]);
    if (!repo) return fail(res, 404, 'Not found');
    if (demo) {
      const last = await one("SELECT MAX(day) AS t FROM daily_metrics WHERE repo_id=$1 AND source='demo'", [repo.id]);
      if (!last?.t) return fail(res, 404, 'Insufficient history');
      const end = requestedEnd || new Date(`${asDay(last.t)}T00:00:00Z`);
      const start = new Date(end.getTime() - (days - 1) * 86400000);
      const rows = await many("SELECT day, star_created FROM daily_metrics WHERE repo_id=$1 AND source='demo' AND day BETWEEN $2::date AND $3::date", [repo.id, asDay(start), asDay(end)]);
      const byDay = new Map(rows.map(row => [asDay(row.day), row.star_created == null ? null : asNumber(row.star_created)]));
      counts = Array.from({length:days}, (_, i) => byDay.get(asDay(new Date(start.getTime() + i * 86400000))) ?? null);
    } else {
      const latest = await one("SELECT MAX(sampled_at) AS t FROM snapshots WHERE source = 'github'");
      const endpoint = latest?.t ? new Date(latest.t) : new Date();
      const series = await getStarSeries(repo.id, requestedEnd || lastCompleteDay(endpoint), days, repo.created_at);
      counts = series.points.map(point => point.count);
    }
  } else {
    const row = await one('SELECT MAX(d.day) AS t FROM asset_daily d JOIN assets a ON a.id=d.asset_id WHERE d.asset_id=$1 AND a.type=$2 AND d.star_created IS NOT NULL', [req.params.id, req.params.type]);
    if (!row?.t) return fail(res, 404, 'Not found');
    const end = requestedEnd || new Date(`${asDay(row.t)}T00:00:00Z`), start = new Date(end.getTime() - (days - 1) * 86400000);
    const rows = await many('SELECT day, star_created FROM asset_daily WHERE asset_id = $1 AND day BETWEEN $2::date AND $3::date', [req.params.id, asDay(start), asDay(end)]);
    const byDay = new Map(rows.map(r => [asDay(r.day), r.star_created == null ? null : asNumber(r.star_created)]));
    counts = Array.from({ length: days }, (_, i) => byDay.get(new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10)) ?? null);
  }
  const png = renderGainChart(counts, { width: 1088, height: 326 });
  if (!png) return fail(res, 404, 'Insufficient history');
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400').type('image/png').send(png);
});
app.get('/api/repos/:id', publicCatalogCache, async (req, res) => {
  const repo = await one(
    'SELECT * FROM repos WHERE id = $1 OR full_name = $2',
    [Number(req.params.id) || -1, req.params.id]
  );
  if (!repo) return fail(res, 404, 'Repository not found');
  const snapshots = (await many(
    'SELECT sampled_at, stars, forks FROM snapshots WHERE repo_id = $1 ORDER BY sampled_at DESC LIMIT 31',
    [repo.id]
  )).reverse();
  res.json({
    ...repo,
    id: asNumber(repo.id),
    stars: asNumber(repo.stars),
    forks: asNumber(repo.forks),
    created_at: asIso(repo.created_at),
    pushed_at: asIso(repo.pushed_at),
    updated_at: asIso(repo.updated_at),
    topics: canonicalTopics(asJson(repo.topics, [])).slice(0, 5),
    aiEvidence: aiEvidence(repo),
    snapshots: snapshots.map(s => ({ sampled_at: asIso(s.sampled_at), stars: asNumber(s.stars), forks: asNumber(s.forks) })),
    url: `https://github.com/${repo.full_name}`,
    mode: demo ? 'demo' : 'live'
  });
});
app.post('/api/ai-report', rate, async (req, res) => {
  const id = Number(req.body.repoId), reason = String(req.body.reason || 'misclassified').slice(0, 300);
  if (!(await one('SELECT id FROM repos WHERE id = $1', [id]))) return fail(res, 404, 'Repository not found');
  await query('INSERT INTO classification_reports (repo_id, reason, created_at) VALUES ($1, $2, $3)', [id, reason, new Date().toISOString()]);
  res.json({ ok: true });
});
app.post('/api/subscriptions', rate, async (req, res) => {
  const b = req.body || {}, email = String(b.email || '').trim().toLowerCase(), locale = b.locale === 'en' ? 'en' : 'zh';
  const selected = Array.isArray(b.boards) ? [...new Set(b.boards.filter(x => boards[x]))] : [];
  const topics = canonicalTopics(normalizeTopics(b.topics, b.topic));
  const languages = normalizeTopics(b.languages, b.language);
  const hour = Number(b.sendHour), zone = String(b.timezone || '');
  if (!emailRe.test(email) || email.length > 254) return fail(res, 400, 'Invalid email address');
  if (!selected.length) return fail(res, 400, 'Select at least one board');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !validZone(zone)) return fail(res, 400, 'Invalid time or timezone');
  const id = crypto.randomUUID(), verify = token(), manage = `${id}.${token()}`;
  if (await one('SELECT id FROM subscriptions WHERE email = $1', [email])) {
    return fail(res, 409, 'This email already has a subscription. Use your management link.');
  }
  const sub = {
    id, email, locale, boards: JSON.stringify(selected),
    language: languages[0] || '',
    languages: JSON.stringify(languages),
    topic: topics[0] || '',
    topics: JSON.stringify(topics),
    send_hour: hour, timezone: zone, status: 'pending'
  };
  await query(
    `INSERT INTO subscriptions (
       id, email, locale, boards, language, languages, topic, topics, send_hour, timezone, status, verify_hash, manage_hash, created_at
     ) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12,$13,$14)`,
    [id, email, locale, sub.boards, sub.language, sub.languages, sub.topic, sub.topics, hour, zone, 'pending', hash(verify), encryptManageToken(manage), new Date().toISOString()]
  );
  try {
    await sendVerification(sub, `${id}.${verify}`);
    res.status(201).json({ ok: true, message: 'Verification email sent' });
  } catch {
    await query('DELETE FROM subscriptions WHERE id = $1', [id]);
    fail(res, 503, 'Mail delivery failed. Check email provider configuration.');
  }
});
app.post('/api/verify', async (req, res) => {
  const value = String(req.body.token || ''), [id, secret] = value.split('.');
  const sub = await one('SELECT * FROM subscriptions WHERE id = $1', [id]);
  if (!sub || !secret || sub.verify_hash !== hash(secret)) return fail(res, 400, 'Invalid verification link');
  await query("UPDATE subscriptions SET status = 'active', verify_hash = NULL, verified_at = $1 WHERE id = $2", [new Date().toISOString(), id]);
  res.json({ ok: true, locale: sub.locale });
});
app.get('/api/manage', async (req, res) => {
  const sub = await manageSub(req.query.token);
  if (!sub) return fail(res, 403, 'Invalid management link');
  res.json({
    email: sub.email,
    locale: sub.locale,
    boards: asJson(sub.boards, []),
    language: storedLanguages(sub)[0] || sub.language || '',
    languages: storedLanguages(sub),
    topic: sub.topic || storedTopics(sub)[0] || '',
    topics: storedTopics(sub),
    sendHour: asNumber(sub.send_hour),
    timezone: sub.timezone,
    status: sub.status
  });
});
app.patch('/api/manage', async (req, res) => {
  const sub = await manageSub(req.body.token);
  if (!sub) return fail(res, 403, 'Invalid management link');
  const b = req.body;
  const selected = Array.isArray(b.boards) ? [...new Set(b.boards.filter(x => boards[x]))] : asJson(sub.boards, []);
  const hour = b.sendHour === undefined ? asNumber(sub.send_hour) : Number(b.sendHour);
  const zone = b.timezone === undefined ? sub.timezone : String(b.timezone);
  const topics = b.topics === undefined && b.topic === undefined
    ? storedTopics(sub)
    : canonicalTopics(normalizeTopics(b.topics, b.topic));
  const languages = b.languages === undefined && b.language === undefined
    ? storedLanguages(sub)
    : normalizeTopics(b.languages, b.language);
  if (!selected.length || !Number.isInteger(hour) || hour < 0 || hour > 23 || !validZone(zone)) return fail(res, 400, 'Invalid settings');
  const status = ['active', 'paused', 'cancelled'].includes(b.status) ? b.status : sub.status;
  if (status === 'active' && !(await proAccess(sub.user_id)).active) return fail(res, 403, 'Pro is required for email delivery');
  if (sub.status === 'cancelled' && status !== 'cancelled') return fail(res, 409, 'Cancelled subscription cannot be resumed');
  await query(
    `UPDATE subscriptions SET locale = $1, boards = $2::jsonb, language = $3, languages = $4::jsonb, topic = $5, topics = $6::jsonb, send_hour = $7, timezone = $8, status = $9 WHERE id = $10`,
    [
      b.locale === 'en' ? 'en' : b.locale === 'zh' ? 'zh' : sub.locale,
      JSON.stringify(selected),
      languages[0] || '',
      JSON.stringify(languages),
      topics[0] || '',
      JSON.stringify(topics),
      hour, zone, status, sub.id
    ]
  );
  res.json({ ok: true, status });
});
app.post('/api/unsubscribe', async (req, res) => {
  const sub = await manageSub(req.body.token);
  if (!sub) return fail(res, 403, 'Invalid unsubscribe link');
  await query("UPDATE subscriptions SET status = 'cancelled' WHERE id = $1", [sub.id]);
  res.json({ ok: true });
});
app.post('/api/one-click', async (req, res) => {
  const sub = await manageSub(req.query.token);
  if (!sub) return fail(res, 403, 'Invalid unsubscribe link');
  await query("UPDATE subscriptions SET status = 'cancelled' WHERE id = $1", [sub.id]);
  res.type('text/plain').send('Unsubscribed');
});
if (demo) {
  app.get('/api/demo-outbox', async (_req, res) => res.json(await many('SELECT * FROM outbox ORDER BY id DESC LIMIT 30')));
}
app.post('/api/admin/collect', requireAdmin, async (req, res) => {
  try { res.status(202).json({queued:true,request:await enqueueTask('collect',req.user.email)}); } catch(e){fail(res,503,e.message)}
});
app.post('/api/admin/digest', requireAdmin, async (req, res) => {
  try { res.status(202).json({queued:true,request:await enqueueTask('digest',req.user.email)}); } catch(e){fail(res,503,e.message)}
});
app.post('/api/admin/backfill',requireAdmin,async(req,res)=>{try{res.status(202).json({queued:true,request:await enqueueTask('backfill',req.user.email)})}catch(e){fail(res,503,e.message)}});

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
app.use(express.static(dist));
app.get('/{*path}', (req, res) => {
  const htmlPath = path.join(dist, 'index.html');
  if (!fs.existsSync(htmlPath)) return fail(res, 503, 'Frontend build missing. Run npm run build or use npm run dev.');
  const locale = req.path.startsWith('/zh') ? 'zh' : 'en';
  const title = locale === 'zh' ? 'Trend Top · 开源项目发现' : 'Trend Top · Open-source discovery';
  const description = locale === 'zh' ? '用透明的数据口径，发现增长、热度与值得追踪的开源项目。' : 'Discover open-source momentum, classics and newcomers through transparent signals.';
  const root = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const suffix = req.path.replace(/^\/(zh|en)/, '');
  let html = fs.readFileSync(htmlPath, 'utf8')
    .replace('<html>', `<html lang="${locale}">`)
    .replace('<title>Trend Top</title>', `<title>${title}</title><meta name="description" content="${description}"/><link rel="alternate" hreflang="zh" href="${root}/zh${suffix}"/><link rel="alternate" hreflang="en" href="${root}/en${suffix}"/><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Trend Top', url: root, inLanguage: ['zh-CN', 'en'] })}</script>`);
  res.type('html').send(html);
});

const port = Number(process.env.PORT || 3001);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ready
    .then(async adapter => {
      console.log('Catalog classification audit', await auditCopiedAssets());
      app.listen(port, '0.0.0.0', () => {
        console.log(`Trend Top API at http://localhost:${port} (${demo ? 'DEMO' : 'LIVE'}, ${adapter.kind})`);
      });
    })
    .catch(e => { console.error(e); process.exit(1); });
}
export { app };
