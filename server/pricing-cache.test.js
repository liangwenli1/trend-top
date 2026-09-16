import test from 'node:test';
import assert from 'node:assert/strict';
import { createPricingCache } from '../src/pricing-data.js';

test('plans share pending requests, isolate locales, and expire', async () => {
  let calls = 0, clock = 0;
  const cache = createPricingCache({ now: () => clock, ttl: 100, fetcher: async url => {
    calls++;
    return Response.json({ plans: [{ key: url }] });
  } });
  const [first, second] = await Promise.all([cache.load('en'), cache.load('en')]);
  assert.strictEqual(first, second);
  assert.strictEqual(await cache.load('en'), first);
  assert.equal(calls, 1);
  assert.notDeepEqual(await cache.load('zh'), first);
  clock = 100;
  assert.equal(cache.get('en'), null);
  await cache.load('en');
  assert.equal(calls, 3);
});

test('failed plans can retry and invalidation prevents stale requests repopulating cache', async () => {
  let calls = 0, release;
  const cache = createPricingCache({ fetcher: async () => {
    calls++;
    if (calls === 1) return Response.json({ error: 'Unavailable' }, { status: 503 });
    if (calls === 2) await new Promise(resolve => { release = resolve; });
    return Response.json({ plans: [{ key: calls }] });
  } });
  await assert.rejects(cache.load('en'), /Unavailable/);
  const old = cache.load('en');
  await new Promise(resolve => setImmediate(resolve));
  cache.clear();
  release();
  await old;
  assert.equal(cache.get('en'), null);
  await cache.load('en');
  assert.equal(calls, 3);
});
