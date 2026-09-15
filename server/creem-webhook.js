import crypto from 'node:crypto';
import express from 'express';
import { one, query } from './db.js';
import { creemConfig } from './creem-client.js';

const text = value => value == null ? null : String(value);
const iso = value => { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); };
const objectId = value => typeof value === 'object' && value ? value.id : value;
const planForProduct = (productId, config) => productId === config.weeklyProductId ? 'pro_weekly' : productId === config.monthlyProductId ? 'pro_monthly' : null;
const eventTime = payload => iso(payload.created_at || payload.createdAt) || new Date().toISOString();

export function verifyCreemSignature(rawBody, signature, secret) {
  const actual = String(signature || '').replace(/^sha256=/i, '').trim().toLowerCase();
  if (!secret || !/^[a-f0-9]{64}$/.test(actual)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

async function resolveUser(object) {
  const metadata = object?.metadata || {};
  if (metadata.userId) return text(metadata.userId);
  const customerId = text(objectId(object?.customer) || object?.customer_id);
  if (customerId) return (await one('SELECT user_id FROM billing_customers WHERE creem_customer_id=$1', [customerId]))?.user_id || null;
  const subscriptionId = text(objectId(object?.subscription) || object?.subscription_id || object?.id);
  if (subscriptionId) return (await one('SELECT user_id FROM billing_subscriptions WHERE creem_subscription_id=$1', [subscriptionId]))?.user_id || null;
  const requestId = text(object?.request_id);
  if (requestId) return (await one('SELECT user_id FROM billing_checkouts WHERE request_id=$1', [requestId]))?.user_id || null;
  return null;
}

async function upsertCustomer(userId, customer, fallbackEmail, mode, at) {
  const customerId = text(objectId(customer));
  if (!userId || !customerId) return customerId;
  const email = text(customer?.email || fallbackEmail || '') || '';
  await query(`INSERT INTO billing_customers (id,user_id,creem_customer_id,email,mode,metadata,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)
    ON CONFLICT (user_id) DO UPDATE SET creem_customer_id=EXCLUDED.creem_customer_id,email=EXCLUDED.email,mode=EXCLUDED.mode,metadata=EXCLUDED.metadata,updated_at=EXCLUDED.updated_at`,
    [crypto.randomUUID(), userId, customerId, email, mode, JSON.stringify(customer?.metadata || {}), at]);
  return customerId;
}

function subscriptionData(object, config, eventType, fallback = {}) {
  const source = object?.subscription && typeof object.subscription === 'object' ? object.subscription : object;
  const product = source?.product && typeof source.product === 'object' ? source.product : fallback.product;
  const productId = text(objectId(product) || source?.product_id || fallback.product_id);
  return {
    source,
    id: text(source?.id || objectId(object?.subscription) || fallback.subscription_id),
    customer: source?.customer || object?.customer || fallback.customer,
    customerId: text(objectId(source?.customer) || source?.customer_id || objectId(object?.customer) || fallback.customer_id),
    productId,
    planKey: source?.metadata?.planKey || object?.metadata?.planKey || planForProduct(productId, config),
    status: text(eventType?.startsWith('subscription.') ? eventType.slice('subscription.'.length) : source?.status || fallback.status || 'active'),
    price: Number.isFinite(Number(source?.price || product?.price)) ? Number(source?.price || product?.price) : null,
    currency: text(source?.currency || product?.currency),
    periodStart: iso(source?.current_period_start_date || source?.current_period_start_at || source?.current_period_start),
    periodEnd: iso(source?.current_period_end_date || source?.current_period_end_at || source?.current_period_end),
    nextAt: iso(source?.next_transaction_date || source?.next_transaction_at),
    canceledAt: iso(source?.canceled_at || source?.cancelled_at),
    providerUpdatedAt: iso(source?.updated_at || object?.updated_at)
  };
}

async function upsertSubscription(userId, object, mode, at, config, eventType) {
  const sub = subscriptionData(object, config, eventType);
  if (!userId || !sub.id || !sub.customerId || !sub.productId || !sub.planKey) return null;
  const result = await query(`INSERT INTO billing_subscriptions
    (id,user_id,creem_subscription_id,creem_customer_id,creem_product_id,plan_key,mode,status,units,price,currency,current_period_start_at,current_period_end_at,next_transaction_at,canceled_at,metadata,provider_payload,provider_updated_at,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$19)
    ON CONFLICT (creem_subscription_id) DO UPDATE SET
      creem_customer_id=EXCLUDED.creem_customer_id,creem_product_id=EXCLUDED.creem_product_id,plan_key=EXCLUDED.plan_key,status=EXCLUDED.status,
      units=EXCLUDED.units,price=EXCLUDED.price,currency=EXCLUDED.currency,current_period_start_at=EXCLUDED.current_period_start_at,
      current_period_end_at=EXCLUDED.current_period_end_at,next_transaction_at=EXCLUDED.next_transaction_at,canceled_at=EXCLUDED.canceled_at,
      metadata=EXCLUDED.metadata,provider_payload=EXCLUDED.provider_payload,provider_updated_at=EXCLUDED.provider_updated_at,updated_at=EXCLUDED.updated_at
    WHERE billing_subscriptions.provider_updated_at IS NULL OR EXCLUDED.provider_updated_at IS NULL OR billing_subscriptions.provider_updated_at <= EXCLUDED.provider_updated_at`,
    [crypto.randomUUID(), userId, sub.id, sub.customerId, sub.productId, sub.planKey, mode, sub.status, Number(sub.source?.units || 1), sub.price, sub.currency, sub.periodStart, sub.periodEnd, sub.nextAt, sub.canceledAt, JSON.stringify(sub.source?.metadata || object?.metadata || {}), JSON.stringify(sub.source), sub.providerUpdatedAt, at]);
  return result.rowCount ? sub : null;
}

async function updateEntitlement(userId, sub, eventType, at, graceDays = 3) {
  if (!userId || !sub?.id) return;
  const activeEvents = new Set(['checkout.completed', 'subscription.active', 'subscription.paid', 'subscription.trialing', 'subscription.scheduled_cancel']);
  const graceEvents = new Set(['subscription.past_due', 'subscription.unpaid']);
  const revokedEvents = new Set(['subscription.paused', 'subscription.expired', 'subscription.canceled', 'subscription.cancelled']);
  let state = activeEvents.has(eventType) ? (eventType === 'subscription.trialing' ? 'trialing' : 'active') : graceEvents.has(eventType) ? 'grace' : revokedEvents.has(eventType) ? 'revoked' : null;
  if (!state) state = ['active', 'paid', 'trialing'].includes(sub.status) ? sub.status === 'trialing' ? 'trialing' : 'active' : null;
  if (!state) return;
  let endsAt = sub.periodEnd;
  if (state === 'grace') {
    const grace = new Date(Date.now() + graceDays * 86400000).toISOString();
    endsAt = !endsAt || endsAt < grace ? grace : endsAt;
  }
  await query(`INSERT INTO user_entitlements (user_id,feature_key,plan_key,state,source_sub_id,starts_at,ends_at,updated_at)
    VALUES ($1,'pro',$2,$3,$4,$5,$6,$7)
    ON CONFLICT (user_id,feature_key) DO UPDATE SET plan_key=EXCLUDED.plan_key,state=EXCLUDED.state,source_sub_id=EXCLUDED.source_sub_id,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,updated_at=EXCLUDED.updated_at`,
    [userId, sub.planKey, state, sub.id, sub.periodStart || at, endsAt, at]);
}

async function applyEvent(payload, eventType, object, mode, at, config) {
  const candidateProductId = text(objectId(object?.product) || object?.product_id || objectId(object?.subscription?.product) || object?.subscription?.product_id);
  if (candidateProductId && ![config.weeklyProductId, config.monthlyProductId].includes(candidateProductId)) return 'ignored';
  const userId = await resolveUser(object);
  if (!userId) return 'ignored';
  const customer = object?.customer || object?.subscription?.customer;
  await upsertCustomer(userId, customer, object?.customer?.email, mode, at);
  if (eventType === 'checkout.completed') {
    const checkoutId = text(object?.id);
    await query(`UPDATE billing_checkouts SET status='completed',creem_customer_id=$1,creem_subscription_id=$2,provider_payload=$3::jsonb,completed_at=$4
      WHERE user_id=$5 AND (request_id=$6 OR creem_checkout_id=$7 OR id=$8)`, [text(objectId(object?.customer)), text(objectId(object?.subscription)), JSON.stringify(object), at, userId, text(object?.request_id), checkoutId, text(object?.metadata?.billingCheckoutId)]);
  }
  const sub = await upsertSubscription(userId, object, mode, at, config, eventType);
  if (sub) await updateEntitlement(userId, sub, eventType, at, config.graceDays);
  const transaction = eventType.startsWith('transaction.') || eventType.startsWith('refund.') ? object : object?.transaction;
  if (transaction?.id) {
    await query(`INSERT INTO billing_transactions (id,user_id,creem_transaction_id,creem_order_id,creem_subscription_id,creem_customer_id,amount,tax_amount,refunded_amount,currency,status,mode,provider_payload,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$14)
      ON CONFLICT (creem_transaction_id) DO UPDATE SET status=EXCLUDED.status,refunded_amount=EXCLUDED.refunded_amount,provider_payload=EXCLUDED.provider_payload,updated_at=EXCLUDED.updated_at`,
      [crypto.randomUUID(), userId, text(transaction.id), text(objectId(transaction.order)), text(objectId(transaction.subscription)), text(objectId(transaction.customer)), Number(transaction.amount || 0), Number(transaction.tax_amount || 0), Number(transaction.refunded_amount || 0), text(transaction.currency), text(transaction.status), mode, JSON.stringify(transaction), at]);
  }
  return 'processed';
}

export async function creemWebhookHandler(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const config = await creemConfig();
  if (!config.webhookSecret) return res.status(503).json({ error: 'Creem webhook is not configured' });
  if (!verifyCreemSignature(raw, req.get('creem-signature'), config.webhookSecret)) return res.status(401).json({ error: 'Invalid webhook signature' });
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Invalid webhook payload' }); }
  const eventType = text(payload.eventType || payload.type);
  const object = payload.object || {};
  const eventId = text(payload.id) || crypto.createHash('sha256').update(raw).digest('hex');
  const mode = text(payload.mode || object.mode || config.mode);
  const receivedAt = new Date().toISOString();
  if (!eventType) return res.status(400).json({ error: 'Missing webhook event type' });
  const inserted = await query(`INSERT INTO creem_webhook_events (event_id,event_type,mode,payload,status,attempts,received_at)
    VALUES ($1,$2,$3,$4::jsonb,'received',1,$5) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`, [eventId, eventType, mode, JSON.stringify(payload), receivedAt]);
  if (!inserted.rowCount) {
    const existing = await one('SELECT status FROM creem_webhook_events WHERE event_id=$1', [eventId]);
    if (existing?.status !== 'failed') return res.json({ ok: true, duplicate: true });
    await query("UPDATE creem_webhook_events SET status='received',attempts=attempts+1,last_error=NULL WHERE event_id=$1", [eventId]);
  }
  if (mode !== config.mode) {
    await query("UPDATE creem_webhook_events SET status='ignored',processed_at=$1,last_error='mode mismatch' WHERE event_id=$2", [receivedAt, eventId]);
    return res.json({ ok: true, ignored: true });
  }
  try {
    const status = await applyEvent(payload, eventType, object, mode, eventTime(payload), config);
    await query('UPDATE creem_webhook_events SET status=$1,processed_at=$2 WHERE event_id=$3', [status, receivedAt, eventId]);
    res.json({ ok: true, status });
  } catch (error) {
    await query("UPDATE creem_webhook_events SET status='failed',last_error=$1 WHERE event_id=$2", [String(error.message || error).slice(0, 1000), eventId]);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

export function registerCreemWebhookRoute(app) {
  app.post('/api/webhooks/creem', express.raw({ type: 'application/json', limit: '256kb' }), creemWebhookHandler);
}
