import crypto from 'node:crypto';
import { asJson, asNumber, one, query } from './db.js';
import { TYPES, getCatalogFilters } from './catalog.js';
import { boards as repoBoards } from './rankings.js';
import { encryptManageToken, token } from './jobs.js';
import { proAccess, requirePro } from './pro-access.js';
import { requireUser } from './auth.js';
import { normalizeTopics } from '../shared/topics.js';

const commonBoards = ['hot', 'rising', 'new', 'stars'];
const repoOnlyBoards = ['ai', 'topics', 'forks'];
const validZone = zone => { try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; } };
const unique = values => [...new Set(values)];
const selectedTypes = values => Array.isArray(values) ? unique(values.filter(value => TYPES.includes(value))) : [];
const selectedValues = values => Array.isArray(values)
  ? unique(values.map(value => String(value || '').trim()).filter(Boolean)).slice(0, 20).map(value => value.slice(0, 50))
  : [];
const toResponse = sub => sub ? {
  email: sub.email,
  types: asJson(sub.types, ['github-repo']),
  boards: asJson(sub.boards, []),
  languages: asJson(sub.languages, []),
  topics: normalizeTopics(asJson(sub.topics, [])),
  sendHour: asNumber(sub.send_hour),
  timezone: sub.timezone,
  locale: sub.locale,
  status: sub.status
} : null;

export function registerSubscriptionRoutes(app) {
  app.get('/api/subscription-filters', async (req, res) => {
    const types = selectedTypes(String(req.query.types || '').split(','));
    const filters = await Promise.all((types.length ? types : TYPES).map(type => getCatalogFilters(type)));
    res.json({
      languages: unique(filters.flatMap(filter => filter.languages || [])).sort(),
      topics: unique(filters.flatMap(filter => filter.topics || [])).sort()
    });
  });

  app.get('/api/subscription', requireUser, async (req, res) => {
    const sub = await one('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
    res.json({ subscription: toResponse(sub), access: await proAccess(req.user.id) });
  });

  app.put('/api/subscription', requireUser, requirePro, async (req, res) => {
    const body = req.body || {};
    const types = selectedTypes(body.types);
    const allowedBoards = new Set([...commonBoards, ...(types.includes('github-repo') ? repoOnlyBoards : [])]);
    const boards = Array.isArray(body.boards) ? unique(body.boards.filter(value => allowedBoards.has(value))) : [];
    const languages = selectedValues(body.languages);
    const topics = normalizeTopics(selectedValues(body.topics));
    const sendHour = Number(body.sendHour), timezone = String(body.timezone || '');
    const locale = body.locale === 'en' ? 'en' : 'zh';
    if (!types.length || !boards.length || !Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23 || !validZone(timezone)) {
      return res.status(400).json({ error: 'Choose a content type, board, and valid delivery time' });
    }
    const existing = await one('SELECT * FROM subscriptions WHERE email = $1', [req.user.email]);
    if (existing && existing.user_id !== req.user.id) return res.status(409).json({ error: 'Subscription belongs to another account' });
    if (existing) {
      await query(
        `UPDATE subscriptions SET types=$1::jsonb, boards=$2::jsonb, language=$3, languages=$4::jsonb,
         topic=$5, topics=$6::jsonb, send_hour=$7, timezone=$8, locale=$9,
         verified_at=COALESCE(verified_at,$10) WHERE id=$11 AND user_id=$12`,
        [JSON.stringify(types), JSON.stringify(boards), languages[0] || '', JSON.stringify(languages), topics[0] || '', JSON.stringify(topics), sendHour, timezone, locale, new Date().toISOString(), existing.id, req.user.id]
      );
    } else {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO subscriptions
         (id,email,user_id,locale,types,boards,language,languages,topic,topics,send_hour,timezone,status,manage_hash,created_at,verified_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9,$10::jsonb,$11,$12,'active',$13,$14,$14)`,
        [id, req.user.email, req.user.id, locale, JSON.stringify(types), JSON.stringify(boards), languages[0] || '', JSON.stringify(languages), topics[0] || '', JSON.stringify(topics), sendHour, timezone, encryptManageToken(`${id}.${token()}`), new Date().toISOString()]
      );
    }
    const saved = await one('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true, subscription: toResponse(saved) });
  });

  app.patch('/api/subscription/status', requireUser, async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['active', 'paused', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid subscription status' });
    if (status === 'active' && !(await proAccess(req.user.id)).active) return res.status(403).json({ error: 'Pro is required for email delivery', code: 'PRO_REQUIRED' });
    const updated = await query('UPDATE subscriptions SET status = $1 WHERE user_id = $2 RETURNING id', [status, req.user.id]);
    if (!updated.rows.length) return res.status(404).json({ error: 'No subscription found' });
    res.json({ ok: true, status });
  });
}
