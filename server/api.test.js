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
const { digest, decryptManageToken } = await import('./jobs.js');
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
    assert.match(mail, /\/zh\/account/);
    assert.doesNotMatch(mail, /\/zh\/manage\?token=/);
    const manage = decryptManageToken((await one("SELECT manage_hash FROM subscriptions WHERE email = 'hello@example.invalid'")).manage_hash);
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

test('email-code registration, login, and account-managed digest cover all six types', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const email = 'account@example.invalid', password = 'a secure test password';
  let cookie = '';
  const request = async (url, method = 'GET', body, signedIn = false) => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(signedIn ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await request('/api/subscription')).status, 401);
    assert.equal((await request('/api/auth/register', 'POST', { email, password, locale: 'en' })).status, 200);
    const text = (await one('SELECT text FROM outbox WHERE to_email = $1 ORDER BY id DESC LIMIT 1', [email])).text;
    const code = text.match(/code: (\d{6})/)[1];
    assert.equal((await request('/api/auth/register/verify', 'POST', { email, code: '000000' })).status, 400);
    const verified = await request('/api/auth/register/verify', 'POST', { email, code });
    assert.equal(verified.status, 200);
    assert.equal(verified.data.user.email, email);
    assert.equal((await request('/api/auth/me', 'GET', undefined, true)).data.user.email, email);
    const filters = await request('/api/subscription-filters?types=skill,plugin');
    assert.ok(filters.data.topics.includes('ocr'));
    const typeFilters = await Promise.all(['skill', 'plugin'].map(type => request(`/api/${type}/filters`)));
    assert.deepEqual(filters.data.topics, [...new Set(typeFilters.flatMap(result => result.data.topics))].sort());
    const types = ['skill', 'plugin', 'agent', 'components', 'website', 'github-repo'];
    const saved = await request('/api/subscription', 'PUT', { types, boards: ['hot'], languages: [], topics: [], sendHour: 9, timezone: 'UTC', locale: 'en' }, true);
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.subscription.types, types);
    assert.equal((await request('/api/subscription', 'GET', undefined, true)).data.subscription.status, 'active');
    const delivery = await digest({ force: true });
    assert.equal(delivery.sent, 1);
    const mail = (await one('SELECT * FROM outbox WHERE to_email = $1 ORDER BY id DESC LIMIT 1', [email]));
    for (const label of ['Skills', 'Plugins', 'Agents', 'Components', 'Websites', 'Repositories']) assert.match(mail.text, new RegExp(label));
    assert.match(mail.html, /<table role="presentation"/);
    assert.match(mail.html, /\/en\/account/);
    assert.doesNotMatch(mail.html, /\/en\/manage\?token=/);
    assert.equal((await request('/api/subscription/status', 'PATCH', { status: 'paused' }, true)).data.status, 'paused');
    const normalized = await request('/api/subscription', 'PUT', { types, boards: ['hot'], languages: [], topics: ['API', 'apis', 'public-api', 'public'], sendHour: 9, timezone: 'UTC', locale: 'en' }, true);
    assert.equal(normalized.status, 200);
    assert.deepEqual(normalized.data.subscription.topics, ['api']);
    assert.equal(normalized.data.subscription.status, 'paused');
    assert.equal((await request('/api/auth/logout', 'POST', {}, true)).status, 200);
    assert.equal((await request('/api/subscription', 'GET', undefined, true)).status, 401);
    assert.equal((await request('/api/auth/login', 'POST', { email, password })).status, 200);
    assert.equal((await request('/api/subscription', 'GET', undefined, true)).data.subscription.status, 'paused');
    const otherSession = cookie;
    assert.equal((await request('/api/auth/login', 'POST', { email, password })).status, 200);
    assert.equal((await request('/api/auth/password/change', 'POST', { currentPassword: 'wrong', password: 'a replacement password' }, true)).status, 401);
    assert.equal((await request('/api/auth/password/change', 'POST', { currentPassword: password, password: 'a replacement password' }, true)).status, 200);
    assert.equal((await request('/api/auth/me', 'GET', undefined, true)).data.user.email, email);
    assert.equal((await (await fetch(base + '/api/auth/me', { headers: { Cookie: otherSession } })).json()).user, null);
    assert.equal((await request('/api/auth/login', 'POST', { email, password })).status, 401);
    assert.equal((await request('/api/auth/login', 'POST', { email, password: 'a replacement password' })).status, 200);
  } finally { server.close(); }
});
