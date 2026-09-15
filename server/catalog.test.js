import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

delete process.env.DATABASE_URL;
process.env.DATA_MODE = 'demo';
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-catalog-'));

const { ready } = await import('./db.js');
const {
  getTypeSummary, getCatalogRankings, getCatalogChart, getCatalogItem,
  getCategory, getCompare, searchCatalog
} = await import('./catalog.js');
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

test('search and detail include similar cluster members', async () => {
  const found = await searchCatalog('pdf', 'skill');
  assert.ok(found.items.length > 0);
  const item = await getCatalogItem('skill', 'anthropic-pdf');
  assert.equal(item.official, true);
  assert.ok(item.similar.length >= 1);
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
