import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

delete process.env.DATABASE_URL;
process.env.DATA_MODE = 'demo';
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-api-'));

const { app } = await import('./index.js');
const { ready, one } = await import('./db.js');
const { digest } = await import('./jobs.js');
await ready;

test('verification gates delivery and management controls the subscription', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, method = 'GET', body) => {
    const r = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: r.status, data: r.headers.get('content-type')?.includes('application/json') ? await r.json() : await r.text() };
  };
  try {
    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.db, 'pglite');
    const filters = await request('/api/filters');
    assert.ok(filters.data.languages.includes('TypeScript'));
    const chart = await request('/api/chart?board=hot&period=week');
    assert.equal(chart.status, 200);
    assert.equal(chart.data.source, 'demo');
    assert.equal(chart.data.points.length, 8);
    assert.ok(chart.data.bars.length > 0);
    assert.ok(chart.data.languages.length > 0);
    assert.equal(chart.data.languages.reduce((sum, item) => sum + item.count, 0), chart.data.languageSampleCount);
    const created = await request('/api/subscriptions', 'POST', {
      email: 'hello@example.invalid', locale: 'zh', boards: ['hot', 'ai'], sendHour: 9, timezone: 'Asia/Shanghai'
    });
    assert.equal(created.status, 201);
    assert.equal((await one("SELECT status FROM subscriptions WHERE email = 'hello@example.invalid'")).status, 'pending');
    assert.equal((await digest({ force: true })).sent, 0);
    const text = (await one('SELECT text FROM outbox ORDER BY id DESC LIMIT 1')).text;
    const verify = text.match(/\/zh\/verify\?token=([^\s]+)/);
    assert.ok(verify);
    const verified = await request('/api/verify', 'POST', { token: decodeURIComponent(verify[1]) });
    assert.equal(verified.status, 200);
    assert.equal((await digest({ force: true })).sent, 1);
    const mail = (await one('SELECT text FROM outbox ORDER BY id DESC LIMIT 1')).text;
    assert.match(mail, /近期热门/);
    assert.match(mail, /AI 热门/);
    const manage = decodeURIComponent(mail.match(/\/zh\/manage\?token=([^\s]+)/)[1]);
    assert.equal((await request('/api/manage?token=' + encodeURIComponent(manage))).data.status, 'active');
    assert.equal((await request('/api/manage', 'PATCH', { token: manage, status: 'paused', boards: ['ai'], sendHour: 10, timezone: 'UTC' })).data.status, 'paused');
    const oneClick = await request('/api/one-click?token=' + encodeURIComponent(manage), 'POST');
    assert.equal(oneClick.status, 200);
    assert.equal((await request('/api/manage?token=' + encodeURIComponent(manage))).data.status, 'cancelled');
    assert.equal((await request('/api/unsubscribe', 'POST', { token: manage })).data.ok, true);
    assert.equal((await request('/api/manage?token=' + encodeURIComponent(manage))).data.status, 'cancelled');
  } finally {
    server.close();
  }
});
