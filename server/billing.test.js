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
let cancellationCalls = 0, refundCalls = 0;
globalThis.fetch = (input, options) => {
  if (String(input).endsWith('/v1/subscriptions/sub_1/cancel')) {
    cancellationCalls++;
    assert.deepEqual(JSON.parse(options.body), { mode: 'scheduled', onExecute: 'cancel' });
    return Promise.resolve(Response.json({ id: 'sub_1', status: 'scheduled_cancel' }));
  }
  if (String(input).endsWith('/v1/refunds')) {
    refundCalls++;
    assert.deepEqual(JSON.parse(options.body), { transaction_id: 'tran_1' });
    return Promise.resolve(Response.json({ id: 'ref_1', status: 'pending' }));
  }
  if (String(input).startsWith('https://test-api.creem.io/v1/checkouts')) return Promise.resolve(new Response(JSON.stringify({ id: 'ch_test_1', status: 'pending', checkout_url: 'https://checkout.creem.io/ch_test_1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (String(input).startsWith('https://test-api.creem.io/v1/customers/billing')) return Promise.resolve(new Response(JSON.stringify({ customer_portal_link: 'https://creem.io/my-orders/login/test' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  return nativeFetch(input, options);
};

const { app } = await import('./index.js');
const { one, query } = await import('./db.js');

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
    assert.equal((await call('/api/admin/catalog-coverage')).status, 401);
    const coverage = await call('/api/admin/catalog-coverage', 'GET', undefined, adminCookie);
    assert.equal(coverage.status, 200);
    assert.equal(coverage.response.headers.get('cache-control'), 'no-store');
    assert.equal(coverage.data.expected, 16);
    const configured = await call('/api/admin/settings', 'PUT', {
      billing: { enabled: true, mode: 'test', prices: { en: { currency: 'USD', monthly: '9.99', yearly: 79 }, zh: { currency: 'CNY', monthly: 68, yearly: 560 } }, monthlyProductId: 'prod_month', yearlyProductId: 'prod_year', apiBaseUrl: 'https://test-api.creem.io', graceDays: 3 },
      contact: { email: 'support@example.com' }, social: { x: 'https://x.com/trendtop', facebook: '', telegram: '' },
      secrets: { creemApiKey: 'creem_test_key', creemWebhookSecret: 'webhook_test_secret' }
    }, adminCookie);
    assert.equal(configured.status, 200);
    assert.equal(configured.data.secretFlags.creemApiKey, true);
    assert.doesNotMatch((await one("SELECT secret_data FROM app_settings WHERE key='site'")).secret_data, /creem_test_key/);
    const plans = await call('/api/billing/plans');
    assert.deepEqual(plans.data.plans.map(plan => plan.key), ['pro_monthly', 'pro_yearly']);
    assert.ok(plans.data.plans.every(plan => plan.available));
    assert.deepEqual(plans.data.plans.map(plan => [plan.price, plan.currency]), [[9.99, 'USD'], [79, 'USD']]);
    const zhPlans = await call('/api/billing/plans?locale=zh');
    assert.deepEqual(zhPlans.data.plans.map(plan => [plan.price, plan.currency]), [[68, 'CNY'], [560, 'CNY']]);
    assert.equal((await call('/api/site-settings')).data.billing.weeklyPrice, undefined);
    const cached = await call('/api/billing/plans?locale=zh');
    assert.equal(cached.response.headers.get('x-catalog-cache'), 'HIT');
    await call('/api/admin/settings', 'PUT', { ...configured.data.public, billing: { ...configured.data.public.billing, prices: { ...configured.data.public.billing.prices, zh: { currency: 'CNY', monthly: 0, yearly: 560 } } } }, adminCookie);
    const changed = await call('/api/billing/plans?locale=zh');
    assert.equal(changed.response.headers.get('x-catalog-cache'), 'MISS');
    assert.equal(changed.data.plans[0].price, null);
    assert.equal(changed.data.plans[0].available, false);
    assert.equal((await call('/api/billing/plans?locale=en')).data.plans[0].available, true);
    await call('/api/admin/settings', 'PUT', configured.data.public, adminCookie);

    const email = 'buyer@example.invalid', password = 'a secure test password';
    await call('/api/auth/register', 'POST', { email, password, locale: 'en' });
    const code = (await one('SELECT text FROM outbox WHERE to_email=$1 ORDER BY id DESC LIMIT 1', [email])).text.match(/code: (\d{6})/)[1];
    const verified = await call('/api/auth/register/verify', 'POST', { email, code });
    userCookie = verified.response.headers.get('set-cookie').split(';')[0];
    assert.equal(verified.data.user.isAdmin, false);
    assert.equal((await call('/api/admin/settings', 'GET', undefined, userCookie)).status, 403);
    assert.equal((await call('/api/admin/catalog-coverage', 'GET', undefined, userCookie)).status, 403);
    const checkout = await call('/api/billing/checkout', 'POST', { planKey: 'pro_yearly' }, userCookie);
    assert.equal(checkout.status, 201);
    assert.equal(checkout.data.checkoutUrl, 'https://checkout.creem.io/ch_test_1');

    const checkoutRow = await one('SELECT * FROM billing_checkouts WHERE request_id=$1', [checkout.data.requestId]);
    const payload = JSON.stringify({ id: 'evt_1', eventType: 'checkout.completed', mode: 'test', object: { id: 'ch_test_1', request_id: checkout.data.requestId, mode: 'test', metadata: { userId: verified.data.user.id, billingCheckoutId: checkoutRow.id, planKey: 'pro_yearly' }, customer: { id: 'cust_1', email }, subscription: { id: 'sub_1', status: 'active', customer: { id: 'cust_1', email }, product: { id: 'prod_year', price: 7900, currency: 'USD' }, current_period_start_date: '2026-09-15T00:00:00Z', current_period_end_date: '2027-09-15T00:00:00Z', updated_at: '2026-09-15T00:00:00Z', metadata: { userId: verified.data.user.id, planKey: 'pro_yearly' } } } });
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
    const preferences = { types: ['skill','github-repo'], boards: ['hot'], languages: ['Python'], topics: ['ai'], sendHour: 9, timezone: 'UTC', locale: 'en' };
    assert.equal((await call('/api/subscription', 'PUT', preferences, userCookie)).status, 200);
    await call('/api/subscription/status', 'PATCH', { status: 'paused' }, userCookie);
    assert.equal((await call('/api/subscription', 'PUT', { ...preferences, sendHour: 10 }, userCookie)).data.subscription.status, 'paused');
    assert.equal((await call('/api/billing/cancel', 'POST', {}, adminCookie)).status, 404);
    const canceled = await call('/api/billing/cancel', 'POST', {}, userCookie);
    assert.equal(canceled.status, 200);
    assert.equal(canceled.data.billing.subscription.status, 'scheduled_cancel');
    assert.equal(canceled.data.billing.entitlements[0].state, 'active');
    assert.equal((await call('/api/billing/cancel', 'POST', {}, userCookie)).data.duplicate, true);
    assert.equal(cancellationCalls, 1);
    assert.equal((await call('/api/subscription', 'GET', undefined, userCookie)).data.subscription.status, 'paused');
    const sendEvent = async (id, eventType, object) => {
      const body = JSON.stringify({ id, eventType, mode: 'test', object });
      const response = await nativeFetch(base + '/api/webhooks/creem', { method: 'POST', headers: { 'Content-Type': 'application/json', 'creem-signature': crypto.createHmac('sha256', 'webhook_test_secret').update(body).digest('hex') }, body });
      assert.equal(response.status, 200); return response.json();
    };
    const transaction = { id: 'tran_1', status: 'completed', amount: 7900, tax_amount: 790, currency: 'USD', created_at: Date.now() - 86400000, customer: { id: 'cust_1', email }, subscription: 'sub_1' };
    await sendEvent('evt_payment', 'transaction.completed', transaction);
    const payments = (await call('/api/billing/me', 'GET', undefined, userCookie)).data.transactions;
    assert.equal(payments.length, 1);
    assert.equal(payments[0].refundEligible, true);
    assert.equal(payments[0].taxAmount, 790);
    assert.equal((await call('/api/billing/refund-requests', 'POST', { transactionId: payments[0].id, reason: 'Service was not provided as described.' }, adminCookie)).status, 404);
    const requested = await call('/api/billing/refund-requests', 'POST', { transactionId: payments[0].id, reason: 'Service was not provided as described.' }, userCookie);
    assert.equal(requested.status, 201);
    assert.equal(requested.data.refundRequest.status, 'requested');
    assert.equal((await call('/api/billing/refund-requests', 'POST', { transactionId: payments[0].id, reason: 'Service was not provided as described.' }, userCookie)).data.duplicate, true);
    const reviewPath = `/api/admin/refund-requests/${requested.data.refundRequest.id}/review`;
    assert.equal((await call(reviewPath, 'POST', { action: 'approve' }, userCookie)).status, 403);
    assert.equal((await call('/api/admin/refund-requests', 'GET', undefined, adminCookie)).data.requests[0].amount, 8690);
    assert.equal((await call(reviewPath, 'POST', { action: 'approve', note: 'Verified the delivery issue.' }, adminCookie)).data.refundRequest.status, 'pending');
    assert.equal((await call(reviewPath, 'POST', { action: 'approve' }, adminCookie)).status, 409);
    assert.equal(refundCalls, 1);
    await sendEvent('evt_refund', 'refund.created', { id: 'ref_1', status: 'succeeded', refund_amount: 8690, refund_currency: 'USD', transaction: { ...transaction, status: 'refunded', refunded_amount: 8690 }, customer: transaction.customer, subscription: { id: 'sub_1', status: 'canceled' } });
    const refunded = (await call('/api/billing/me', 'GET', undefined, userCookie)).data;
    assert.equal(refunded.refundRequests[0].status, 'succeeded');
    assert.equal(refunded.transactions[0].refundedAmount, 8690);
    assert.equal(refunded.subscription.status, 'canceled');
    assert.equal(refunded.entitlements[0].state, 'revoked');
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM billing_transactions')).n), 1);
    await sendEvent('evt_old_transaction', 'transaction.completed', transaction);
    assert.equal((await one("SELECT status,refunded_amount FROM billing_transactions WHERE creem_transaction_id='tran_1'")).status, 'refunded');
    assert.equal((await call('/api/subscription', 'GET', undefined, userCookie)).data.subscription.status, 'paused');
    await query("UPDATE billing_transactions SET created_at=$1,status='completed',refunded_amount=0 WHERE creem_transaction_id='tran_1'", [new Date(Date.now() - 8 * 86400000).toISOString()]);
    assert.equal((await call('/api/billing/me', 'GET', undefined, userCookie)).data.transactions[0].refundEligible, false);
    await sendEvent('evt_subscription_update', 'subscription.update', { ...JSON.parse(payload).object.subscription, status: 'expired', updated_at: new Date().toISOString() });
    assert.equal((await call('/api/billing/me', 'GET', undefined, userCookie)).data.subscription.status, 'expired');
    assert.equal((await call('/api/billing/me', 'GET', undefined, userCookie)).data.entitlements[0].state, 'revoked');
  } finally { server.close(); globalThis.fetch = nativeFetch; }
});

