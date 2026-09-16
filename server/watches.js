import { asJson, asNumber, many, query } from './db.js';
import { TYPES, getCatalogItem, getCatalogRankings, isType } from './catalog.js';
import { requireUser } from './auth.js';
import { requirePro } from './pro-access.js';

const MAX_WATCHES = 100;
const canonicalId = (type, item) => String(type === 'github-repo' ? item.id : (item.slug || item.id));

async function loadItem(type, id) {
  if (!isType(type) || !id) return null;
  return getCatalogItem(type, decodeURIComponent(String(id)));
}

async function snapshotFor(type, item) {
  const ranking = await getCatalogRankings(type, { board: 'hot', period: 'week', limit: 200 });
  const index = ranking.items.findIndex(row => String(row.id) === String(item.id) || row.slug === item.slug || row.full_name === item.full_name);
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

export async function listWatches(userId, { markSeen = true } = {}) {
  const rows = await many('SELECT * FROM watches WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
  const ranks = new Map();
  const items = [];
  for (const row of rows) {
    const item = await loadItem(row.item_type, row.item_id);
    if (!item) continue;
    if (!ranks.has(row.item_type)) {
      const ranking = await getCatalogRankings(row.item_type, { board: 'hot', period: 'week', limit: 200 });
      ranks.set(row.item_type, ranking.items);
    }
    const list = ranks.get(row.item_type) || [];
    const index = list.findIndex(entry => String(entry.id) === String(item.id) || entry.slug === item.slug || entry.full_name === item.full_name);
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
      ...changes
    });
    if (markSeen) {
      await query('UPDATE watches SET last_viewed_at=$1, snapshot=$2::jsonb WHERE user_id=$3 AND item_type=$4 AND item_id=$5', [
        current.sampledAt, JSON.stringify(current), userId, row.item_type, row.item_id
      ]);
    }
  }
  return { items };
}

export function registerWatchRoutes(app) {
  app.get('/api/watches/:type/:id', requireUser, async (req, res) => {
    if (!TYPES.includes(req.params.type)) return res.status(404).json({ error: 'Unknown type' });
    res.json(await watchStatus(req.user.id, req.params.type, req.params.id));
  });
  app.get('/api/watches', requireUser, requirePro, async (req, res) => {
    res.json(await listWatches(req.user.id, { markSeen: req.query.mark !== '0' }));
  });
  app.post('/api/watches', requireUser, requirePro, async (req, res) => {
    try {
      res.json(await addWatch(req.user.id, req.body?.type, req.body?.id));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message, code: error.status === 403 ? 'PRO_REQUIRED' : undefined });
    }
  });
  app.delete('/api/watches', requireUser, requirePro, async (req, res) => {
    try {
      res.json(await removeWatch(req.user.id, req.body?.type, req.body?.id));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });
}
