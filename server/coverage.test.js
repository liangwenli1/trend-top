import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

delete process.env.DATABASE_URL;
process.env.DATA_MODE = 'demo';
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trend-coverage-'));
const { ready, query, one, asDay, closeDb } = await import('./db.js');
const { evaluateCoverage, getCoverageReport } = await import('./catalog-coverage.js');
const { resourceProvenance, repoIdentity, safeSourceUrl } = await import('../shared/data-sources.js');
const { getCatalogRankings, getCatalogItem } = await import('./catalog.js');
await ready;
test.after(closeDb);

test('production image includes the scheduler and coverage command with their local dependencies', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const runner = dockerfile.split('AS runner')[1];
  const copies = [...runner.matchAll(/^COPY\s+(?!\-\-)(\S+)\s+(\S+)\s*$/gm)].map(match => ({ source: path.resolve(root, match[1]), destination: path.resolve(root, match[2]) }));
  const visited = new Set();
  const check = relative => {
    const file = path.resolve(root, relative);
    if (visited.has(file)) return;
    visited.add(file);
    assert.ok(copies.some(copy => copy.source === file && copy.destination === file || fs.statSync(copy.source).isDirectory() && file.startsWith(copy.source + path.sep) && path.relative(copy.source, file) === path.relative(copy.destination, file)), `${relative} is missing from the production image`);
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/from\s+['"]((?:\.|\.\.)\/[^'"]+)['"]/g)) check(path.relative(root, path.resolve(path.dirname(file), match[1])));
  };
  check('scripts/scheduler.mjs'); check('scripts/catalog-coverage.mjs');
});

test('coverage checks exact repositories and Skill paths without mistaking parent or keyword hits for resources', () => {
  const entry = { id: 'test', type: 'skill', repo: 'anthropics/skills', resourcePath: 'skills/pdf/SKILL.md' };
  const repos = [{ id: 1, full_name: 'anthropics/skills', active: true }];
  assert.equal(evaluateCoverage(entry, { repos }).status, 'repository-only');
  const row = { id: 'skill-pdf', type: 'skill', source_repo_url: 'https://github.com/anthropics/skills', active: true, ranking_signals: { resourcePath: 'skills/other/SKILL.md' } };
  assert.equal(evaluateCoverage(entry, { repos, assets: [row] }).status, 'repository-only');
  row.ranking_signals.resourcePath = 'skills/pdf/SKILL.md';
  assert.equal(evaluateCoverage(entry, { repos, assets: [row] }).status, 'covered');
  row.active = false; row.ranking_signals.classificationAudit = 'retired-unverified-repository-copy';
  const retired = evaluateCoverage(entry, { assets: [row] });
  assert.equal(retired.status, 'inactive');
  assert.equal(retired.items[0].retirementReason, 'retired-unverified-repository-copy');
  assert.equal(evaluateCoverage({ type: 'github-repo', repoName: 'awesome-design-md' }, { repos: [{ full_name: 'other/awesome-design-md-tools', active: true }] }).status, 'not-in-catalog');
  assert.equal(evaluateCoverage({ type: 'github-repo', repoName: 'awesome-design-md' }, { repos: [{ full_name: 'example/awesome-design-md', active: true }] }).status, 'covered');
});

test('coverage distinguishes wrong types, unverified copies, queued candidates and actual website failures', () => {
  const target = { type: 'agent', repo: 'example/product' };
  const row = { id: 'copy', type: 'skill', url: 'https://github.com/example/product', active: true };
  assert.equal(evaluateCoverage(target, { assets: [row] }).status, 'other-type');
  row.type = 'agent';
  assert.equal(evaluateCoverage(target, { assets: [row] }).status, 'unverified');
  row.source_query = 'manual:approved';
  assert.equal(evaluateCoverage(target, { assets: [row] }).status, 'covered');
  const candidates = [{ id: 2, url: 'https://github.com/example/product', status: 'pending', type: 'agent' }];
  assert.equal(evaluateCoverage(target, { candidates }).status, 'candidate-pending');
  candidates[0].type = 'skill';
  assert.equal(evaluateCoverage(target, { candidates }).status, 'not-in-catalog');
  const website = { type: 'website', website: 'https://21st.dev' };
  const source = { url: 'https://www.21st.dev/', active: true, last_error: 'Website 429' };
  assert.equal(evaluateCoverage(website, { sources: [source] }).status, 'source-failed');
  source.active = false;
  assert.equal(evaluateCoverage(website, { sources: [source] }).status, 'source-disabled');
  assert.equal(evaluateCoverage({ type: 'website', website: 'https://glama.ai/mcp/servers' }, { assets: [{ type: 'website', url: 'https://glama.ai/unrelated', active: true }] }).status, 'not-in-catalog');
});

test('source provenance distinguishes associated stars, own Skill installs and extraction tools', () => {
  const row = { type: 'skill', source_repo_url: 'https://github.com/example/skills', last_fetched_at: '2026-09-17T00:00:00Z' };
  const signals = { provider: 'firecrawl', directoryMetrics: { 'skills-sh': { installs: { value: 42, period: 'weekly', scope: 'skill', resource: 'pdf', sampledAt: '2026-09-16T00:00:00Z', sourceUrl: 'https://skills.sh/example/skills/pdf' } } } };
  const result = resourceProvenance(row, signals);
  assert.equal(result.source, 'GitHub');
  assert.equal(result.metrics[0].scope, 'associated-repository');
  assert.equal(result.metrics[1].source, 'Skills.sh');
  assert.equal(result.metrics[1].period, 'weekly');
  assert.equal(result.metrics[1].scope, 'skill');
  assert.equal(result.metrics[1].sampledAt, '2026-09-16T00:00:00Z');
  const site = resourceProvenance({ type: 'website', source_query: 'website-source:21st-dev', website_url: 'https://21st.dev', source_repo_url: row.source_repo_url }, { provider: 'firecrawl' });
  assert.equal(site.source, '21st.dev'); assert.deepEqual(site.metrics, []);
  assert.equal(resourceProvenance(row, {}, true).mode, 'demo');
  const legacy = resourceProvenance(row, { installs: 12 });
  assert.equal(legacy.metrics[1].period, 'unknown');
  assert.equal(legacy.metrics[1].scope, 'unknown');
  assert.equal(repoIdentity('https://github.com.attacker.invalid/example/skills'), '');
  assert.equal(safeSourceUrl('javascript:alert(1)'), null);
  assert.equal(safeSourceUrl('https://user:secret@example.invalid'), null);
});

test('unknown or incomplete growth stays unavailable; complete zero growth is real and metadata rankings remain accessible', async () => {
  const seed = await one("SELECT * FROM assets WHERE type='skill' LIMIT 1");
  const id = 'coverage-zero-growth';
  await query("INSERT INTO assets (id,type,slug,name,full_name,category,stars,forks,created_at,pushed_at,ranking_signals,active) VALUES ($1,'skill',$1,'coveragezero','coverage/zero','pdf',12345,1,NOW(),NOW(),$2::jsonb,TRUE)", [id, JSON.stringify({ typeVerified: true })]);
  const endpoint = (await getCatalogRankings('skill', { board: 'stars' })).updatedAt;
  const end = Date.parse(asDay(endpoint) + 'T00:00:00Z');
  try {
    await query('INSERT INTO asset_daily(asset_id,day,star_created,stars) VALUES ($1,$2,NULL,12345)', [id, asDay(endpoint)]);
    let detail = await getCatalogItem('skill', id);
    assert.equal(detail.gain, null);
    assert.deepEqual(detail.growthCoverage, { knownDays: 0, expectedDays: 7 });
    const collected = await getCatalogRankings('skill', { board: 'stars', q: 'coverage/zero' });
    assert.equal(collected.total, 1); assert.equal(collected.items[0].gain, null);
    assert.equal((await getCatalogRankings('skill', { board: 'rising', q: 'coverage/zero' })).total, 0);
    for (let offset = 0; offset < 7; offset++) await query('INSERT INTO asset_daily(asset_id,day,star_created,stars) VALUES ($1,$2,0,12345) ON CONFLICT(asset_id,day) DO UPDATE SET star_created=0', [id, asDay(new Date(end - offset * 86400000))]);
    detail = await getCatalogItem('skill', id);
    assert.equal(detail.gain, 0); assert.equal(detail.prevGain, null);
    assert.deepEqual(detail.growthCoverage, { knownDays: 7, expectedDays: 7 });
    const hot = await getCatalogRankings('skill', { board: 'hot', q: 'coverage/zero' });
    assert.equal(hot.total, 1); assert.equal(hot.coverage, 100);
    await query('DELETE FROM asset_daily WHERE asset_id=$1 AND day=$2', [id, asDay(new Date(end - 3 * 86400000))]);
    assert.equal((await getCatalogItem('skill', id)).gain, null);
    assert.equal((await getCatalogRankings('skill', { board: 'hot', q: 'coverage/zero' })).coverage, 0);
    assert.ok(seed); // Existing demo catalog survives the completeness checks.
  } finally { await query('DELETE FROM asset_daily WHERE asset_id=$1', [id]); await query('DELETE FROM assets WHERE id=$1', [id]); }
});

test('coverage report is read-only, covers six types and keeps licensing reviews explicitly pending', async () => {
  const before = await one('SELECT COUNT(*) AS n FROM assets');
  const report = await getCoverageReport();
  assert.equal(report.expected, 100);
  assert.equal(new Set(report.byType.map(group => group.type)).size, 6);
  assert.equal(report.mode, 'demo');
  assert.equal(report.covered, report.entries.filter(entry => entry.status === 'covered').length);
  assert.ok(report.sourcePolicies.every(source => source.id==='glama' ? source.reviewStatus==='restricted' && !source.enabled && !source.metricsAllowed : source.reviewStatus === 'pending'));
  assert.equal((await one('SELECT COUNT(*) AS n FROM assets')).n, before.n);
});
