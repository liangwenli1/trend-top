import { asJson, many, one, query, ready, transaction, dataSource } from './db.js';
import { TYPES, getTypeSummary, getCatalogRankings } from './catalog.js';
import { USE_CASES } from '../shared/taxonomy.js';
import { selectHomeItems } from '../shared/home-discovery.js';

const taskIds = ['browser', 'coding', 'ui', 'documents', 'research', 'git'];

const schemaVersion = 1;
const variantKey = (type, useCase) => `${type}:${useCase}`;

// Run at publication time, never in a visitor's request.
export async function buildHomeSnapshot() {
  const [summary, taskRows] = await Promise.all([
    getTypeSummary(),
    many(`SELECT DISTINCT use_case FROM assets WHERE active=TRUE
      UNION SELECT DISTINCT use_case FROM repos WHERE active=TRUE AND deleted=FALSE AND archived=FALSE AND source=$1`, [dataSource()])
  ]);
  const available = new Set(taskRows.map(row => row.use_case));
  const variants = {};
  // Reuse each set of six ordered boards for all seven type variants. Generate
  // every accepted canonical filter, including combinations with no results.
  for (const useCase of ['', ...Object.keys(USE_CASES)]) {
    const collections = await Promise.all(TYPES.map(async type => {
      const hot = await getCatalogRankings(type, { board: 'hot', period: 'week', limit: 12, useCase });
      return hot.items.length ? hot : getCatalogRankings(type, { board: 'stars', period: 'week', limit: 12, useCase });
    }));
    for (const type of ['', ...TYPES]) {
      const selected = type ? collections.filter(collection => collection.type === type) : collections;
      variants[variantKey(type, useCase)] = { type, useCase, items: selectHomeItems(selected),
        partial: selected.some(collection => collection.stale || collection.dataInsufficient),
        collections: selected.map(collection => ({ type: collection.type, board: collection.board, updatedAt: collection.updatedAt || null })) };
    }
  }
  return { schemaVersion, summary, period: 'week', selection: 'type-board-round-robin',
    tasks: taskIds.filter(id => available.has(id)).map(id => ({ id, ...USE_CASES[id] })), variants };
}

export async function publishHomeSnapshot(catalogVersion, build = buildHomeSnapshot) {
  const payload = await build();
  await query(`INSERT INTO homepage_snapshots (source,catalog_version,schema_version,published_at,payload)
    VALUES ($1,$2,$3,NOW(),$4::jsonb)
    ON CONFLICT (source) DO UPDATE SET catalog_version=EXCLUDED.catalog_version,
      schema_version=EXCLUDED.schema_version,published_at=EXCLUDED.published_at,payload=EXCLUDED.payload
    WHERE homepage_snapshots.catalog_version<=EXCLUDED.catalog_version`,
  [dataSource(), catalogVersion, schemaVersion, JSON.stringify(payload)]);
}

// Existing deployments are bootstrapped once; restarts reuse the durable result.
export async function initializeHomeSnapshot() {
  await ready;
  try { return await transaction(async () => {
    await query('LOCK TABLE catalog_publications IN SHARE ROW EXCLUSIVE MODE');
    const publication = await one('SELECT id FROM catalog_publications ORDER BY id DESC LIMIT 1');
    const existing = await one('SELECT catalog_version,schema_version FROM homepage_snapshots WHERE source=$1', [dataSource()]);
    const version = publication?.id || 0;
    if (existing?.schema_version === schemaVersion && Number(existing.catalog_version) >= version) return;
    await publishHomeSnapshot(version);
  }); } catch (error) {
    const existing = await one('SELECT schema_version FROM homepage_snapshots WHERE source=$1', [dataSource()]);
    if (existing?.schema_version !== schemaVersion) throw error;
    // A refresh failure must not prevent serving an already valid publication.
    console.error('Homepage refresh failed; retaining the previous publication:', error.message);
    return { retained: true };
  }
}

export async function getHomeDiscovery({ type = '', useCase = '' } = {}) {
  // A request reads only its public variant, never rankings or private mail data.
  const row = await one(`SELECT catalog_version,published_at,payload->'summary' AS summary,
    payload->'tasks' AS tasks,payload->'variants'->$2 AS variant
    FROM homepage_snapshots WHERE source=$1 AND schema_version=$3`, [dataSource(), variantKey(type, useCase), schemaVersion]);
  if (!row) throw Object.assign(new Error('Homepage publication is not available yet'), { status: 503 });
  const variant = asJson(row.variant, null);
  if (!variant) throw Object.assign(new Error('Unknown homepage filter'), { status: 400 });
  const publishedAt = new Date(row.published_at).toISOString();
  const stale = Date.now() - new Date(publishedAt).getTime() > 36 * 3600000;
  return { ...asJson(row.summary, {}), ...variant, period: 'week', selection: 'type-board-round-robin',
    tasks: asJson(row.tasks, []), generatedAt: publishedAt, partial: variant.partial || stale,
    items: variant.items.map(item => ({ ...item, stale: item.stale || stale })),
    snapshot: { catalogVersion: Number(row.catalog_version), publishedAt, stale } };
}
