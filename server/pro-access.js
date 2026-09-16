import { many } from './db.js';
import { creemConfig } from './creem-client.js';

// UI gates and delivery jobs use the same dated entitlement and provider mode.
export async function proUsers(now = new Date(), userId = null) {
  const { mode } = await creemConfig();
  return many(`SELECT e.user_id, e.plan_key, e.state,
      COALESCE(e.ends_at,b.current_period_end_at) AS ends_at
    FROM user_entitlements e JOIN billing_subscriptions b
      ON b.creem_subscription_id=e.source_sub_id AND b.user_id=e.user_id
    WHERE e.feature_key='pro' AND e.state IN ('active','trialing','grace')
      AND b.mode=$1 AND b.status IN ('active','paid','trialing','scheduled_cancel','past_due','unpaid')
      AND (e.starts_at IS NULL OR e.starts_at <= $2::timestamptz)
      AND COALESCE(e.ends_at,b.current_period_end_at) > $2::timestamptz
      AND ($3::text IS NULL OR e.user_id=$3)`, [mode, now.toISOString(), userId]);
}

export async function proAccess(userId, now = new Date()) {
  if (!userId) return { active: false };
  const [row] = await proUsers(now, userId);
  return row ? { active: true, state: row.state, planKey: row.plan_key, endsAt: new Date(row.ends_at).toISOString() } : { active: false };
}

export async function requirePro(req, res, next) {
  try {
    if (!(await proAccess(req.user.id)).active) return res.status(403).json({ error: 'Pro is required for email delivery', code: 'PRO_REQUIRED' });
    next();
  } catch (error) { next(error); }
}
