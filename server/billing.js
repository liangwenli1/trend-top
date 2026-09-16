import crypto from 'node:crypto';
import { asIso, asNumber, many, one, query } from './db.js';
import { requireUser } from './auth.js';
import { createCreemCheckout, createCreemPortal, cancelCreemSubscription, creemConfig, creemReady } from './creem-client.js';
import { transactionSummary } from './refunds.js';

const positive = value => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; };
const localeOf = value => value === 'zh' ? 'zh' : 'en';
// Display prices come from the admin settings for the requested site language; Creem charges the product's own price.
const planRows = async (locale = 'en') => {
  const settings = await import('./settings.js').then(module => module.getSettings());
  const billing = settings.public.billing;
  const prices = billing.prices?.[localeOf(locale)] || {};
  const priced = interval => Object.values(billing.prices || {}).some(set => positive(set?.[interval]));
  return [
  {
    key: 'pro_monthly', name: { en: 'Pro Monthly', zh: 'Pro 月付' }, interval: 'month',
    productId: billing.monthlyProductId, price: positive(prices.monthly), currency: prices.currency, priced: priced('monthly'),
    features: { en: ['Daily digest email across six collections', 'Growth charts inside every email', 'Language and topic filters', 'Your delivery hour and time zone', 'One renewal per month, cancel anytime'], zh: ['覆盖六大类型的每日摘要邮件', '每封邮件内置增长图表', '按编程语言和主题筛选', '自选发送时间与时区', '每月续费一次，随时可取消'] }
  },
  {
    key: 'pro_yearly', name: { en: 'Pro Yearly', zh: 'Pro 年付' }, interval: 'year',
    productId: billing.yearlyProductId, price: positive(prices.yearly), currency: prices.currency, priced: priced('yearly'),
    features: { en: ['Daily digest email across six collections', 'Growth charts inside every email', 'Language and topic filters', 'Your delivery hour and time zone', 'One renewal per year, cancel anytime'], zh: ['覆盖六大类型的每日摘要邮件', '每封邮件内置增长图表', '按编程语言和主题筛选', '自选发送时间与时区', '每年续费一次，随时可取消'] }
  }
  ];
};

export async function billingPlans(locale = 'en') {
  const configured = await creemReady();
  return (await planRows(locale)).map(({ productId, priced, ...plan }) => ({ ...plan, available: configured && Boolean(productId && priced) }));
}

const privatePlan = async key => (await planRows()).find(plan => plan.key === key);
const publicUrl = req => String(process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const fail = (res, error, fallback = 500) => res.status(error.status || fallback).json({ error: error.message || 'Billing request failed' });
const serializeSubscription = row => row && ({
  planKey: row.plan_key, status: row.status, currency: row.currency, price: asNumber(row.price),
  periodStart: asIso(row.current_period_start_at), periodEnd: asIso(row.current_period_end_at),
  nextTransactionAt: asIso(row.next_transaction_at), canceledAt: asIso(row.canceled_at),
  cancelRequestedAt: asIso(row.cancel_requested_at)
});

export async function billingSummary(userId) {
  const { mode } = await creemConfig();
  const customer = await one('SELECT email, mode FROM billing_customers WHERE user_id = $1 AND mode=$2', [userId, mode]);
  const subscription = await one('SELECT * FROM billing_subscriptions WHERE user_id = $1 AND mode=$2 ORDER BY updated_at DESC LIMIT 1', [userId, mode]);
  const entitlements = await many('SELECT feature_key, state, plan_key, starts_at, ends_at FROM user_entitlements WHERE user_id = $1 ORDER BY feature_key', [userId]);
  return { configured: await creemReady(), mode, customer: customer || null, subscription: serializeSubscription(subscription), ...await transactionSummary(userId, mode), entitlements: entitlements.map(row => ({ featureKey: row.feature_key, state: row.state, planKey: row.plan_key, startsAt: asIso(row.starts_at), endsAt: asIso(row.ends_at) })) };
}

export function registerBillingRoutes(app) {
  app.get('/api/billing/plans', async (req, res) => { const config = await creemConfig(); res.json({ mode: config.mode, configured: await creemReady(), locale: localeOf(req.query.locale), plans: await billingPlans(req.query.locale) }); });
  app.get('/api/billing/me', requireUser, async (req, res) => res.json(await billingSummary(req.user.id)));
  app.post('/api/billing/checkout', requireUser, async (req, res) => {
    const config = await creemConfig();
    const plan = await privatePlan(req.body?.planKey);
    if (!plan) return res.status(400).json({ error: 'Unknown billing plan' });
    if (!await creemReady() || !plan.productId || !plan.priced) return res.status(503).json({ error: 'This plan is not available yet' });
    const active = await one("SELECT id FROM billing_subscriptions WHERE user_id = $1 AND mode=$2 AND status IN ('active','trialing','paid','scheduled_cancel') LIMIT 1", [req.user.id, config.mode]);
    if (active) return res.status(409).json({ error: 'Manage your current plan from Account' });
    const id = crypto.randomUUID(), requestId = `tt_${crypto.randomUUID()}`, now = new Date().toISOString();
    await query(`INSERT INTO billing_checkouts (id,user_id,request_id,plan_key,creem_product_id,mode,status,metadata,provider_payload,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,'pending',$7::jsonb,'{}'::jsonb,$8)`, [id, req.user.id, requestId, plan.key, plan.productId, config.mode, JSON.stringify({ userId: req.user.id, billingCheckoutId: id, planKey: plan.key }), now]);
    try {
      const checkout = await createCreemCheckout({
        product_id: plan.productId,
        request_id: requestId,
        units: 1,
        success_url: `${publicUrl(req)}/${req.user.locale === 'zh' ? 'zh' : 'en'}/billing/success`,
        customer: { email: req.user.email },
        metadata: { userId: req.user.id, billingCheckoutId: id, planKey: plan.key }
      });
      await query('UPDATE billing_checkouts SET creem_checkout_id=$1,status=$2,provider_payload=$3::jsonb WHERE id=$4', [checkout.id, checkout.status || 'pending', JSON.stringify(checkout), id]);
      res.status(201).json({ checkoutUrl: checkout.checkout_url, requestId });
    } catch (error) {
      await query("UPDATE billing_checkouts SET status='failed',provider_payload=$1::jsonb WHERE id=$2", [JSON.stringify({ error: error.message }), id]);
      fail(res, error, 502);
    }
  });
  app.get('/api/billing/checkout-status', requireUser, async (req, res) => {
    const checkout = await one('SELECT request_id,status,plan_key,completed_at FROM billing_checkouts WHERE request_id=$1 AND user_id=$2', [String(req.query.requestId || ''), req.user.id]);
    if (!checkout) return res.status(404).json({ error: 'Checkout not found' });
    res.json({ requestId: checkout.request_id, status: checkout.status, planKey: checkout.plan_key, completedAt: asIso(checkout.completed_at), billing: await billingSummary(req.user.id) });
  });
  app.post('/api/billing/portal', requireUser, async (req, res) => {
    const { mode } = await creemConfig();
    const customer = await one('SELECT creem_customer_id FROM billing_customers WHERE user_id=$1 AND mode=$2', [req.user.id, mode]);
    if (!customer) return res.status(404).json({ error: 'No billing account found' });
    try {
      const portal = await createCreemPortal(customer.creem_customer_id);
      res.json({ portalUrl: portal.customer_portal_link });
    } catch (error) { fail(res, error, 502); }
  });
  app.post('/api/billing/cancel', requireUser, async (req, res) => {
    const { mode } = await creemConfig();
    const sub = await one("SELECT * FROM billing_subscriptions WHERE user_id=$1 AND mode=$2 AND status IN ('active','paid','trialing','past_due','unpaid','scheduled_cancel') ORDER BY updated_at DESC LIMIT 1", [req.user.id, mode]);
    if (!sub) return res.status(404).json({ error: 'No renewable plan found' });
    if (sub.status === 'scheduled_cancel' || sub.cancel_requested_at) return res.json({ billing: await billingSummary(req.user.id), duplicate: true });
    if (!await creemReady()) return res.status(503).json({ error: 'Creem is not configured' });
    const at = new Date().toISOString();
    const locked = await query('UPDATE billing_subscriptions SET cancel_requested_at=$1 WHERE id=$2 AND cancel_requested_at IS NULL RETURNING id', [at, sub.id]);
    if (!locked.rows.length) return res.json({ billing: await billingSummary(req.user.id), duplicate: true });
    try {
      const result = await cancelCreemSubscription(sub.creem_subscription_id);
      if (result.status === 'scheduled_cancel') await query("UPDATE billing_subscriptions SET status='scheduled_cancel' WHERE id=$1 AND status IN ('active','paid','trialing','past_due','unpaid')", [sub.id]);
      res.json({ billing: await billingSummary(req.user.id) });
    } catch (error) {
      // Keep ambiguous requests pending until the webhook / provider confirms.
      if (error.status === 400) await query('UPDATE billing_subscriptions SET cancel_requested_at=NULL WHERE id=$1 AND cancel_requested_at=$2', [sub.id, at]);
      fail(res, error, 502);
    }
  });
}
