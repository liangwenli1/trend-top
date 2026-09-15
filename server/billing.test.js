import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

delete process.env.DATABASE_URL;
process.env.DATA_MODE = 'demo';
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trend-top-billing-'));
process.env.ADMIN_TOKEN = 'test-admin-token-with-enough-entropy';
process.env.AUTH_SECRET = 'test-auth-secret-with-enough-entropy';
process.env.ADMIN_EMAILS = 'admin@example.invalid';

const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  if (String(input).startsWith('https://test-api.creem.io/v1/checkouts')) return Promise.resolve(new Response(JSON.stringify({ id: 'ch_test_1', status: 'pending', checkout_url: 'https://checkout.creem.io/ch_test_1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (String(input).startsWith('https://test-api.creem.io/v1/customers/billing')) return Promise.resolve(new Response(JSON.stringify({ customer_portal_link: 'https://creem.io/my-orders/login/test' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  return nativeFetch(input, options);
};

const { app } = await import('./index.js');
const { one } = await import('./db.js');

test('admin configures one Pro tier, checkout and signed webhook activate it idempotently', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let adminCookie = '', userCookie = '';
  const call = async (url, method = 'GET', body, cookie = '') => {
    const response = await nativeFetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { response, status: response.status, data: await response.json() };
  };
  try {
    const adminEmail = 'admin@example.invalid', adminPassword = 'an admin test password';
    await call('/api/auth/register', 'POST', { email: adminEmail, password: adminPassword, locale: 'en' });
    const adminCode = (await one('SELECT text FROM outbox WHERE to_email=$1 ORDER BY id DESC LIMIT 1', [adminEmail])).text.match(/code: (\d{6})/)[1];
    const login = await call('/api/auth/register/verify', 'POST', { email: adminEmail, code: adminCode });
    adminCookie = login.response.headers.get('set-cookie').split(';')[0];
    assert.equal(login.status, 200);
    assert.equal(login.data.user.isAdmin, true);
    assert.equal((await call('/api/admin/auth/me', 'GET', undefined, adminCookie)).data.admin, true);
    assert.equal((await call('/api/admin/settings', 'GET')).status, 401);
    const configured = await call('/api/admin/settings', 'PUT', {
      billing: { enabled: true, mode: 'test', currency: 'USD', weeklyPrice: 300, monthlyPrice: 900, weeklyProductId: 'prod_week', monthlyProductId: 'prod_month', apiBaseUrl: 'https://test-api.creem.io', graceDays: 3 },
      contact: { email: 'support@example.com' }, social: { x: 'https://x.com/trendtop', facebook: '', telegram: '' },
      secrets: { creemApiKey: 'creem_test_key', creemWebhookSecret: 'webhook_test_secret' }
    }, adminCookie);
    assert.equal(configured.status, 200);
    assert.equal(configured.data.secretFlags.creemApiKey, true);
    assert.doesNotMatch((await one("SELECT secret_data FROM app_settings WHERE key='site'")).secret_data, /creem_test_key/);
    const plans = await call('/api/billing/plans');
    assert.deepEqual(plans.data.plans.map(plan => plan.key), ['pro_weekly', 'pro_monthly']);
    assert.ok(plans.data.plans.every(plan => plan.available));

    const email = 'buyer@example.invalid', password = 'a secure test password';
    await call('/api/auth/register', 'POST', { email, password, locale: 'en' });
    const code = (await one('SELECT text FROM outbox WHERE to_email=$1 ORDER BY id DESC LIMIT 1', [email])).text.match(/code: (\d{6})/)[1];
    const verified = await call('/api/auth/register/verify', 'POST', { email, code });
    userCookie = verified.response.headers.get('set-cookie').split(';')[0];
    assert.equal(verified.data.user.isAdmin, false);
    assert.equal((await call('/api/admin/settings', 'GET', undefined, userCookie)).status, 403);
    const checkout = await call('/api/billing/checkout', 'POST', { planKey: 'pro_weekly' }, userCookie);
    assert.equal(checkout.status, 201);
    assert.equal(checkout.data.checkoutUrl, 'https://checkout.creem.io/ch_test_1');

    const checkoutRow = await one('SELECT * FROM billing_checkouts WHERE request_id=$1', [checkout.data.requestId]);
    const payload = JSON.stringify({ id: 'evt_1', eventType: 'checkout.completed', mode: 'test', object: { id: 'ch_test_1', request_id: checkout.data.requestId, mode: 'test', metadata: { userId: verified.data.user.id, billingCheckoutId: checkoutRow.id, planKey: 'pro_weekly' }, customer: { id: 'cust_1', email }, subscription: { id: 'sub_1', status: 'active', customer: { id: 'cust_1', email }, product: { id: 'prod_week', price: 300, currency: 'USD' }, current_period_start_date: '2026-09-15T00:00:00Z', current_period_end_date: '2026-09-22T00:00:00Z', updated_at: '2026-09-15T00:00:00Z', metadata: { userId: verified.data.user.id, planKey: 'pro_weekly' } } } });
    const signature = crypto.createHmac('sha256', 'webhook_test_secret').update(payload).digest('hex');
    const webhook = await nativeFetch(base + '/api/webhooks/creem', { method: 'POST', headers: { 'Content-Type': 'application/json', 'creem-signature': signature }, body: payload });
    assert.equal(webhook.status, 200);
    const duplicate = await nativeFetch(base + '/api/webhooks/creem', { method: 'POST', headers: { 'Content-Type': 'application/json', 'creem-signature': signature }, body: payload });
    assert.equal((await duplicate.json()).duplicate, true);
    const me = await call('/api/billing/me', 'GET', undefined, userCookie);
    assert.equal(me.data.subscription.status, 'active');
    assert.equal(me.data.entitlements[0].state, 'active');
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM creem_webhook_events')).n), 1);
    const portal = await call('/api/billing/portal', 'POST', {}, userCookie);
    assert.equal(portal.data.portalUrl, 'https://creem.io/my-orders/login/test');
  } finally { server.close(); globalThis.fetch = nativeFetch; }
});

