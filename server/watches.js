import { asJson, asNumber, many, one, query } from './db.js';
import { TYPES, getCatalogRankings, isType } from './catalog.js';
import { requireUser } from './auth.js';
import { requirePro } from './pro-access.js';
import { sourcePolicies, visibleSignals } from './source-policy.js';

const MAX_WATCHES = 100;
const canonicalId = (type, item) => String(type === 'github-repo' ? item.id : (item.slug || item.id));

async function loadItem(type, id) {
  if (!isType(type) || !id) return null;
  const key = decodeURIComponent(String(id));
  // Watch controls need identity and counters, not detail history or related-project queries.
  const row = type === 'github-repo'
    ? await one('SELECT * FROM repos WHERE id=$1 OR full_name=$2', [Number(key) || -1, key])
    : await one('SELECT * FROM assets WHERE type=$1 AND (id=$2 OR slug=$2)', [type, key]);
  if (!row) return null;
  await sourcePolicies();
  const signals = visibleSignals(asJson(row.ranking_signals, {}));
  return { ...row, id: type === 'github-repo' ? asNumber(row.id) : row.id,
    usage: asNumber(signals.installs ?? signals.usage ?? signals.downloads), gain: null };
}

const sameItem = (row, item) => String(row.id) === String(item.id)
  || (item.slug != null && row.slug === item.slug) || row.full_name === item.full_name;

async function snapshotFor(type, item) {
  const ranking = await getCatalogRankings(type, { board: 'hot', period: 'week' }, { all: true });
  const index = ranking.items.findIndex(row => sameItem(row, item));
  return {
    stars: asNumber(item.stars) || 0,
    gain: item.gain ?? null,
    usage: item.usage ?? null,
    rank: index >= 0 ? index + 1 : null,
    sampledAt: new Date().toISOString()
  };
}

function changesSince(previous, current) {
  const before = asJson(previous, {});
  return {
    starDelta: (current.stars || 0) - (asNumber(before.stars) || 0),
    usageDelta: current.usage != null && before.usage != null ? current.usage - (asNumber(before.usage) || 0) : null,
    rankDelta: current.rank != null && before.rank != null ? before.rank - current.rank : null,
    previousRank: before.rank ?? null
  };
}

export async function watchStatus(userId, type, id) {
  const item = await loadItem(type, id);
  if (!item) return { watching: false };
  const row = await many(
    'SELECT item_id FROM watches WHERE user_id=$1 AND item_type=$2 AND item_id=ANY($3::text[]) LIMIT 1',
    [userId, type, [canonicalId(type, item), String(item.id), String(item.slug || '')].filter(Boolean)]
  );
  return { watching: row.length > 0, id: canonicalId(type, item) };
}

export async function addWatch(userId, type, id) {
  const item = await loadItem(type, id);
  if (!item) { const error = new Error('Item not found'); error.status = 404; throw error; }
  if ((await watchStatus(userId, type, id)).watching) return { watching: true, id: canonicalId(type, item) };
  const count = (await many('SELECT 1 FROM watches WHERE user_id=$1', [userId])).length;
  if (count >= MAX_WATCHES) { const error = new Error('Watch limit reached'); error.status = 400; throw error; }
  const key = canonicalId(type, item);
  const snapshot = await snapshotFor(type, item);
  const now = new Date().toISOString();
  await query(
    `INSERT INTO watches (user_id,item_type,item_id,created_at,last_viewed_at,snapshot)
     VALUES ($1,$2,$3,$4,$4,$5::jsonb)
     ON CONFLICT (user_id,item_type,item_id) DO UPDATE SET snapshot=EXCLUDED.snapshot`,
    [userId, type, key, now, JSON.stringify(snapshot)]
  );
  return { watching: true, id: key };
}

export async function removeWatch(userId, type, id) {
  const item = await loadItem(type, id);
  const keys = item ? [canonicalId(type, item), String(item.id), String(item.slug || '')] : [String(id)];
  await query('DELETE FROM watches WHERE user_id=$1 AND item_type=$2 AND item_id=ANY($3::text[])', [userId, type, keys.filter(Boolean)]);
  return { watching: false };
}

export async function listWatches(userId, { markSeen = false } = {}) {
  const rows = await many('SELECT * FROM watches WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
  const ranks = new Map();
  const items = [];
  for (const row of rows) {
    const item = await loadItem(row.item_type, row.item_id);
    if (!item) continue;
    if (!ranks.has(row.item_type)) {
      const ranking = await getCatalogRankings(row.item_type, { board: 'hot', period: 'week' }, { all: true });
      ranks.set(row.item_type, ranking.items);
    }
    const list = ranks.get(row.item_type) || [];
    const index = list.findIndex(entry => sameItem(entry, item));
    const current = {
      stars: asNumber(item.stars) || 0,
      gain: item.gain ?? null,
      usage: item.usage ?? null,
      rank: index >= 0 ? index + 1 : null,
      sampledAt: new Date().toISOString()
    };
    const changes = changesSince(row.snapshot, current);
    items.push({
      type: row.item_type,
      id: canonicalId(row.item_type, item),
      slug: item.slug || item.id,
      full_name: item.full_name,
      description: item.description,
      official: Boolean(item.official),
      stars: current.stars,
      gain: current.gain,
      usage: current.usage,
      rank: current.rank,
      createdAt: row.created_at,
      lastViewedAt: row.last_viewed_at,
      sampledAt: current.sampledAt,
      ...changes
    });
    if (markSeen) {
      await query('UPDATE watches SET last_viewed_at=$1, snapshot=$2::jsonb WHERE user_id=$3 AND item_type=$4 AND item_id=$5', [
        current.sampledAt, JSON.stringify(current), userId, row.item_type, row.item_id
      ]);
    } else {
      await query('UPDATE watches SET pending_snapshot=$1::jsonb WHERE user_id=$2 AND item_type=$3 AND item_id=$4',
        [JSON.stringify(current), userId, row.item_type, row.item_id]);
    }
  }
  return { items, board: 'hot', period: 'week' };
}

export async function markWatchesSeen(userId, items = []) {
  for (const item of items.slice(0, MAX_WATCHES)) {
    await query(`UPDATE watches SET snapshot=pending_snapshot,last_viewed_at=$1::text::timestamptz,pending_snapshot=NULL
      WHERE user_id=$2 AND item_type=$3 AND item_id=$4 AND pending_snapshot->>'sampledAt'=$1::text`,
      [item.sampledAt, userId, item.type, String(item.id)]);
  }
}

export async function savedWatches(userId) {
  const rows = await many('SELECT * FROM watches WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
  const items = [];
  for (const row of rows) {
    const item = await loadItem(row.item_type, row.item_id);
    if (item) items.push({ type: row.item_type, id: canonicalId(row.item_type,item), slug: item.slug || item.id,
      full_name: item.full_name, description: item.description });
  }
  return { items, locked: true };
}

export function registerWatchRoutes(app) {
  // Saved identities and removal remain available after Pro expires; live deltas do not.
  app.get('/api/watches/saved', requireUser, async (req,res) => res.json(await savedWatches(req.user.id)));
  app.get('/api/watches/:type/:id', requireUser, async (req, res) => {
    if (!TYPES.includes(req.params.type)) return res.status(404).json({ error: 'Unknown type' });
    res.json(await watchStatus(req.user.id, req.params.type, req.params.id));
  });
  app.get('/api/watches', requireUser, requirePro, async (req, res) => {
    res.json(await listWatches(req.user.id));
  });
  app.post('/api/watches/seen', requireUser, requirePro, async (req, res) => {
    await markWatchesSeen(req.user.id, Array.isArray(req.body?.items) ? req.body.items : []);
    res.json({ ok: true });
  });
  app.post('/api/watches', requireUser, requirePro, async (req, res) => {
    try {
      res.json(await addWatch(req.user.id, req.body?.type, req.body?.id));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message, code: error.status === 403 ? 'PRO_REQUIRED' : undefined });
    }
  });
  app.delete('/api/watches', requireUser, async (req, res) => {
    try {
      res.json(await removeWatch(req.user.id, req.body?.type, req.body?.id));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });
}
