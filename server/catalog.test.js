import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

delete process.env.DATABASE_URL;
process.env.DATA_MODE = 'demo';
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-catalog-'));

const { ready, one, query } = await import('./db.js');
const {
  getTypeSummary, getCatalogRankings, getCatalogChart, getCatalogItem,
  getCategory, getCompare, searchCatalog, getCatalogFilters
} = await import('./catalog.js');
const { canonicalTopic, normalizeTopics } = await import('../shared/topics.js');
await ready;

test('catalog exposes six types and demo assets', async () => {
  const summary = await getTypeSummary();
  assert.equal(summary.types.length, 6);
  assert.ok(summary.types.find(x => x.id === 'skill').count >= 8);
  assert.ok(summary.types.find(x => x.id === 'plugin').count >= 8);
  assert.ok(summary.types.find(x => x.id === 'agent').count >= 5);
  assert.ok(summary.types.find(x => x.id === 'github-repo').count >= 8);
});

test('skill rankings return a set, not a single pick, with official marks', async () => {
  const ranking = await getCatalogRankings('skill', { board: 'hot', period: 'week', limit: 20 });
  assert.ok(ranking.items.length >= 3);
  assert.ok(ranking.items.some(x => x.official));
  assert.ok(ranking.items.some(x => x.similarCount > 0));
  assert.ok(ranking.items.every(x => x.rank >= 1));
});

test('category pages recommend two to four options', async () => {
  const page = await getCategory('plugin', 'postgres');
  assert.ok(page.recommend.length >= 2 && page.recommend.length <= 4);
  assert.ok(page.ranking.items.length >= page.recommend.length);
  assert.equal(page.chart.type, 'plugin');
});

test('compare returns selected items side by side', async () => {
  const ranking = await getCatalogRankings('skill', { category: 'pdf', limit: 10 });
  const ids = ranking.items.slice(0, 3).map(x => x.slug);
  const compared = await getCompare('skill', ids.join(','));
  assert.equal(compared.items.length, 3);
});

test('compare with one id fills same-category peers', async () => {
  const compared = await getCompare('skill', 'pdf-extract-pro');
  assert.ok(compared.items.length >= 2);
  const categories = new Set(compared.items.map(x => x.category).filter(Boolean));
  assert.equal(categories.size, 1);
});

test('search and detail expose a bounded related preview', async () => {
  const found = await searchCatalog('pdf', 'skill');
  assert.ok(found.items.length > 0);
  const item = await getCatalogItem('skill', 'anthropic-pdf');
  assert.equal(item.official, true);
  assert.ok(item.similar.length <= 6);
  assert.ok(item.relatedCount >= item.similar.length);
});

test('github-repo catalog still ranks live demo repos', async () => {
  const ranking = await getCatalogRankings('github-repo', { board: 'rising', period: 'week' });
  assert.ok(ranking.items.length > 0);
  assert.equal(ranking.items[0].type, 'github-repo');
  const chart = await getCatalogChart('github-repo', { board: 'hot', period: 'week' });
  assert.ok(chart.bars.length > 0);
  const combined = await getCatalogChart('github-repo', { board: 'hot', period: 'week', includeRanking: '1' });
  assert.ok(combined.ranking.items.length > 0);
});

test('topic aliases agree in JavaScript and SQL without merging related concepts', async () => {
  const samples = ['API', ' apis ', 'public-api', 'public-apis', 'public', 'software', 'ai_agent', 'AI agents', 'mcp-servers', 'next.js', 'golang', 'front-end', 'ai', 'llm', 'react', 'components', 'C++', '--web---tools--'];
  const result = await query('SELECT value, canonical_topic(value) AS canonical FROM jsonb_array_elements_text($1::jsonb) AS value', [JSON.stringify(samples)]);
  assert.deepEqual(result.rows.map(row => row.canonical), samples.map(canonicalTopic));
  assert.deepEqual(normalizeTopics(['api', 'public-apis', 'apis', 'public', 'AI', 'llm', 'ai']), ['api', 'ai', 'llm']);
  assert.deepEqual(normalizeTopics(['react', 'components']), ['react', 'components']);
});

test('existing raw topics deduplicate in detail, facets and alias-filtered rankings', async () => {
  const raw = ['api', 'public-apis', 'public-api', 'public', 'apis', 'security', 'SECURITY', 'llm'];
  for (const [type, table, id] of [['skill', 'assets', 'anthropic-pdf'], ['github-repo', 'repos', 'modelcontextprotocol/servers']]) {
    const original = await one(`SELECT * FROM ${table} WHERE ${table === 'assets' ? 'slug' : 'full_name'}=$1`, [id]);
    assert.ok(original);
    try {
      await query(`UPDATE ${table} SET topics=$1::jsonb WHERE id=$2`, [JSON.stringify(raw), original.id]);
      const detail = await getCatalogItem(type, table === 'assets' ? id : original.id);
      assert.deepEqual(new Set(detail.topics), new Set(['api', 'security', 'llm']));
      const filters = await getCatalogFilters(type);
      assert.ok(filters.topics.includes('api'));
      assert.ok(!filters.topics.some(topic => ['apis', 'public-api', 'public-apis', 'public'].includes(topic)));
      for (const topic of ['api', 'public-apis']) {
        const ranking = await getCatalogRankings(type, { topic, board: 'stars', limit: 100 });
        assert.ok(ranking.items.some(item => String(item.id) === String(original.id)));
      }
      const multi = await getCatalogRankings(type, { topics: ['public-api', 'unknown-topic'], board: 'stars', limit: 100 });
      assert.ok(multi.items.some(item => String(item.id) === String(original.id)));
      // Preserve source evidence; presentation changes do not destroy historical tags.
      assert.deepEqual((await one(`SELECT topics FROM ${table} WHERE id=$1`, [original.id])).topics, raw);
    } finally {
      await query(`UPDATE ${table} SET topics=$1::jsonb WHERE id=$2`, [JSON.stringify(original.topics), original.id]);
    }
  }
});

test('use-case axis does not use the first GitHub topic as the category', async () => {
  const { classify } = await import('../shared/taxonomy.js');
  const storage = classify({ type: 'github-repo', full_name: 'minio/minio', description: 'High performance object storage', topics: ['ai', 'go', 'minio'] });
  assert.equal(storage.useCase, 'storage');
  assert.equal(storage.category, 'object-storage');
  const database = classify({ type: 'plugin', full_name: 'modelcontextprotocol/postgres', description: 'Postgres MCP', topics: ['mcp', 'postgres'], category: 'postgres' });
  assert.equal(database.useCase, 'database');
  const ranking = await getCatalogRankings('plugin', { useCase: 'database', limit: 20 });
  assert.ok(ranking.items.length >= 1);
  assert.ok(ranking.items.every(item => item.useCase === 'database'));
});

test('official requires evidence and compare exposes protocol fields', async () => {
  const item = await getCatalogItem('skill', 'anthropic-pdf');
  assert.equal(item.official, true);
  assert.ok(item.officialEvidence);
  const community = await getCatalogItem('skill', 'pdf-extract-pro');
  assert.equal(community.official, false);
  assert.equal(community.officialEvidence, null);
  const compared = await getCompare('plugin', 'postgres-official,supabase-mcp');
  assert.ok(compared.items.every(row => row.compare?.protocol === 'MCP'));
  assert.ok(compared.items.every(row => !String(row.compare?.identity || '').includes('npx')));
});

test('skill hot score blends usage with star momentum', async () => {
  const originals = await query("SELECT slug, ranking_signals FROM assets WHERE slug IN ('anthropic-pdf','pdf-extract-pro')");
  try {
    await query("UPDATE assets SET ranking_signals='{\"installs\":1}'::jsonb WHERE slug='anthropic-pdf'");
    await query("UPDATE assets SET ranking_signals='{\"installs\":80000}'::jsonb WHERE slug='pdf-extract-pro'");
    const ranking = await getCatalogRankings('skill', { board: 'hot', period: 'week', category: 'pdf', limit: 20 });
    const community = ranking.items.find(item => item.slug === 'pdf-extract-pro');
    const official = ranking.items.find(item => item.slug === 'anthropic-pdf');
    assert.ok(community?.usage > official?.usage);
    assert.ok(community.score > official.score);
  } finally {
    for (const row of originals.rows) {
      await query('UPDATE assets SET ranking_signals=$1::jsonb WHERE slug=$2', [JSON.stringify(row.ranking_signals || {}), row.slug]);
    }
  }
});

test('search expands use-case and type instead of only matching names', async () => {
  const { expandSearch } = await import('../shared/taxonomy.js');
  const expanded = expandSearch('数据库 mcp');
  assert.ok(expanded.useCases.includes('database'));
  assert.deepEqual(expanded.types, ['plugin']);
  const found = await searchCatalog('数据库 mcp');
  assert.ok(found.items.some(item => item.category === 'postgres' || item.useCase === 'database'));
  assert.ok(found.items.every(item => item.type === 'plugin' || item.resources));
});

test('architecture topics classify instead of staying uncategorized', async () => {
  const { classify, officialEvidenceFor, compareFields } = await import('../shared/taxonomy.js');
  const archify = classify({
    type: 'github-repo',
    full_name: 'tt-a1i/archify',
    description: 'Agent skill for architecture diagrams',
    topics: ['uncategorized', 'agent-skills', 'architecture-diagram', 'claude-skill']
  });
  assert.equal(archify.category, 'diagrams');
  assert.equal(archify.useCase, 'coding');
  assert.equal(officialEvidenceFor({ type: 'plugin', full_name: 'someone/pg', ranking_signals: { directory: 'glama' } }), null);
  assert.match(officialEvidenceFor({ type: 'plugin', full_name: 'supabase/mcp', ranking_signals: { directory: 'glama' } }) || '', /Glama/);
  assert.match(officialEvidenceFor({ type: 'plugin', full_name: 'acme/random-mcp', ranking_signals: { directory: 'official-mcp-registry' } }) || '', /Official MCP Registry/);
  const compared = compareFields({ type: 'plugin', full_name: 'modelcontextprotocol/postgres', description: 'stdio MCP for Postgres', language: 'TypeScript' });
  assert.equal(compared.protocol, 'MCP');
  assert.equal(compared.transport, 'stdio');
  assert.ok(!String(compared.identity).includes('npx'));
});
