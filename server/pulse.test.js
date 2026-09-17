import test from 'node:test';

import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';

delete process.env.DATABASE_URL;
process.env.DATA_MODE = 'demo';
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-core-'));

const { ready, query, one, many, asDay, expandStarHistoryToDaily, applySnapshotsToDaily, rebuildDerivedMetrics } = await import('./db.js');
const { getRankings, getStarSeries } = await import('./rankings.js');
const { digest, encryptManageToken, discoveryPlan, keepCandidate } = await import('./jobs.js');
await ready;
const { attachTestPro } = await import('./test-pro-fixture.js');

test('rankings use boundary snapshots and expose demo provenance', async () => {
  const week = await getRankings({ board: 'rising', period: 'week' });
  assert.equal(week.source, 'demo');
  assert.equal(week.sample, true);
  assert.ok(week.items.length > 0);
  assert.ok(week.items[0].gain > 0);
  assert.ok(week.items[0].gain >= week.items[1].gain);
  assert.equal((await getRankings({ board: 'ai' })).items.every(x => x.aiEvidence.length > 0), true);
  assert.equal((await getRankings({ board: 'new' })).items.every(x => x.ageDays <= 90), true);
});

test('missing snapshot pair never becomes a fabricated gain', async () => {
  await query('DELETE FROM snapshots WHERE repo_id = $1', [1]);
  await query('DELETE FROM daily_metrics WHERE repo_id = $1', [1]);
  await rebuildDerivedMetrics();
  const item = (await getRankings({ board: 'stars', limit: 50 })).items.find(x => x.id === 1);
  assert.equal(item.gain, null);
  assert.equal(item.score, null);
  assert.equal((await getRankings({ board: 'rising', limit: 50 })).items.some(x => x.id === 1), false);
});

test('official Star history expands into complete daily metrics', async () => {
  const week = Date.parse('2026-09-06T00:00:00Z') / 1000;
  await query(
    `INSERT INTO star_history (repo_id, week_start, total, days_json, sampled_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [999999, week, 28, JSON.stringify([1, 2, 3, 4, 5, 6, 7]), new Date().toISOString()]
  );
  const previous = process.env.DATA_MODE;
  process.env.DATA_MODE = 'live';
  try {
    await expandStarHistoryToDaily(999999);
    const end = new Date('2026-09-12T17:00:00Z');
    const complete = await getStarSeries(999999, end, 7, '2020-01-01T00:00:00Z');
    assert.equal(complete.complete, true);
    assert.deepEqual(complete.points.map(x => x.count), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal((await getStarSeries(999999, end, 8, '2020-01-01T00:00:00Z')).complete, false);
    const days = await many(
      `SELECT day, star_created FROM daily_metrics WHERE repo_id = $1 AND source = 'github' ORDER BY day`,
      [999999]
    );
    assert.equal(days.length, 7);
  } finally {
    process.env.DATA_MODE = previous;
  }
});

test('star history never stores the incomplete sample day as a zero gain', async () => {
  const id = 999997;
  const week = Date.parse('2026-09-13T00:00:00Z') / 1000;
  await query(
    `INSERT INTO star_history (repo_id, week_start, total, days_json, sampled_at) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [id, week, 3, JSON.stringify([1, 2, 0, 0, 0, 0, 0]), '2026-09-15T02:05:00Z']
  );
  await expandStarHistoryToDaily(id);
  const days = await many(`SELECT day, star_created FROM daily_metrics WHERE repo_id = $1 AND source = 'github' ORDER BY day`, [id]);
  assert.deepEqual(days.map(row => [asDay(row.day), Number(row.star_created)]), [['2026-09-13', 1], ['2026-09-14', 2]]);
  const series = await getStarSeries(id, new Date('2026-09-14T00:00:00Z'), 2, '2020-01-01T00:00:00Z');
  assert.deepEqual(series.points.map(point => point.count), [1, 2]);
});

test('digest chart renders a PNG only with enough known days', async () => {
  const { renderGainChart } = await import('./png-chart.js');
  assert.equal(renderGainChart([5, null, null]), null);
  const png = renderGainChart([1, 4, 0, 9, 2, 7, 3], { width: 120, height: 60 });
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 120);
  assert.equal(png.readUInt32BE(20), 60);
});

test('daily snapshot rebuild keeps only the latest snapshot for each UTC day', async () => {
  const id = 999998;
  await query(
    `INSERT INTO snapshots (repo_id, sampled_at, stars, forks, source) VALUES
     ($1, '2026-09-14T02:00:00Z', 100, 10, 'github'),
     ($1, '2026-09-14T18:00:00Z', 105, 12, 'github')`,
    [id]
  );
  await applySnapshotsToDaily();
  const daily = await one("SELECT stars, forks FROM daily_metrics WHERE repo_id = $1 AND day = '2026-09-14' AND source = 'github'", [id]);
  assert.equal(Number(daily.stars), 105);
  assert.equal(Number(daily.forks), 12);
});

test('discovery plan paginates, rotates, and lowers the star floor', () => {
  const plan = discoveryPlan(new Date('2026-09-14T00:00:00Z'));
  assert.ok(plan.queries.some(q => q.pages >= 2));
  assert.ok(plan.queries.some(q => /stars:5\.\./.test(q.q)));
  assert.ok(plan.queries.some(q => /stars:50\.\./.test(q.q)));
  assert.ok(plan.queries.some(q => /stars:>80000/.test(q.q)));
  assert.ok(plan.queries.some(q => /topic:design-system/.test(q.q)));
  assert.equal(plan.languages.length, 5);
  assert.equal(plan.topics.length, 6);
  assert.equal(plan.maxRepos, 2000);
  const later = discoveryPlan(new Date('2026-09-21T00:00:00Z'));
  assert.notDeepEqual(plan.languages, later.languages);
  const unique = new Map();
  for (let i = 0; i < 50; i++) keepCandidate(unique, { id: 1000 + i, stargazers_count: 90000 });
  assert.equal([...unique.values()].filter(r => r.stargazers_count > 80000).length, 40);
  keepCandidate(unique, { id: 1, stargazers_count: 120 });
  assert.ok(unique.has(1));
});

test('daily digest is one combined message and is idempotent', async () => {
  const id = crypto.randomUUID(), raw = `${id}.test-secret`;
  await query(
    `INSERT INTO subscriptions (id, email, locale, boards, language, topic, send_hour, timezone, status, manage_hash, created_at)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)`,
    [id, 'test@example.com', 'en', JSON.stringify(['hot', 'rising']), '', '', 9, 'UTC', 'active', encryptManageToken(raw), new Date().toISOString()]
  );
  await attachTestPro(id);
  const first = await digest({ force: true });
  const second = await digest({ force: true });
  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  const out = await many('SELECT * FROM outbox WHERE to_email = $1', ['test@example.com']);
  assert.equal(out.length, 1);
  assert.match(out[0].text, /Trending now/);
  assert.match(out[0].text, /Fastest rising/);
  assert.match(out[0].text, /Stop emails:/);
  assert.match(out[0].text, /account\/delivery\?intent=stop/);
  assert.match(out[0].html, /email-logo\.png/);
  assert.match(out[0].html, /api\/digest-images\/[a-f0-9]{64}\.png/);
  const delivery = await one('SELECT status, snapshot FROM deliveries WHERE subscription_id = $1', [id]);
  assert.equal(delivery.status, 'sent');
  const snapshot = typeof delivery.snapshot === 'string' ? JSON.parse(delivery.snapshot) : delivery.snapshot;
  assert.ok(Array.isArray(snapshot['github-repo:hot']) && snapshot['github-repo:hot'].length > 0);
  // A later digest compares against that snapshot and marks movement.
  const { buildDigest } = await import('./digest.js');
  const sub = await one('SELECT * FROM subscriptions WHERE id = $1', [id]);
  const shuffled = { 'github-repo:hot': [...snapshot['github-repo:hot']].reverse(), 'github-repo:rising': ['nobody/nothing'] };
  const next = await buildDigest(sub, raw, { previous: shuffled });
  const hot = next.sections.find(section => section.board === 'hot');
  assert.ok(hot.items.some(item => typeof item.change === 'number' && item.change !== 0));
  assert.ok(next.sections.find(section => section.board === 'rising').items.every(item => item.change === 'new'));
  assert.match(next.html, /NEW|&#9650;|&#9660;/);
});

test('daily digest skips an empty selection instead of sending an empty email', async () => {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO subscriptions (id, email, locale, boards, language, topic, topics, send_hour, timezone, status, manage_hash, created_at)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,
    [id, 'empty@example.com', 'en', JSON.stringify(['hot']), '', '', JSON.stringify(['no-such-topic']), 9, 'UTC', 'active', encryptManageToken(`${id}.test-secret`), new Date().toISOString()]
  );
  await attachTestPro(id);
  const result = await digest({ force: true });
  assert.equal(result.sent, 0);
  assert.equal((await many('SELECT * FROM outbox WHERE to_email = $1', ['empty@example.com'])).length, 0);
  assert.equal((await one('SELECT status FROM deliveries WHERE subscription_id = $1', [id])).status, 'skipped');
});
