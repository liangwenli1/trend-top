import { query } from './db.js';
import { creemConfig } from './creem-client.js';

// Synthetic provider records for isolated test databases only.
export async function grantTestPro(userId, options={}) {
  const now=new Date(), end=options.endsAt || new Date(now.getTime()+86400000).toISOString();
  const mode=options.mode || (await creemConfig()).mode;
  await query(`INSERT INTO billing_subscriptions
    (id,user_id,creem_subscription_id,creem_customer_id,creem_product_id,plan_key,mode,status,current_period_end_at,created_at,updated_at)
    VALUES($1,$2,$3,'test-customer','test-product','pro_monthly',$4,$5,$6,$7,$7)
    ON CONFLICT(id) DO UPDATE SET mode=EXCLUDED.mode,status=EXCLUDED.status,current_period_end_at=EXCLUDED.current_period_end_at`,
    ['test-sub-'+userId,userId,'test-provider-'+userId,mode,options.status || 'active',end,now.toISOString()]);
  await query(`INSERT INTO user_entitlements(user_id,feature_key,plan_key,state,source_sub_id,starts_at,ends_at,updated_at)
    VALUES($1,'pro','pro_monthly',$2,$3,$4,$5,$6)
    ON CONFLICT(user_id,feature_key) DO UPDATE SET state=EXCLUDED.state,source_sub_id=EXCLUDED.source_sub_id,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at`,
    [userId,options.state || 'active',options.sourceSubId || 'test-provider-'+userId,options.startsAt || now.toISOString(),end,now.toISOString()]);
}

export async function attachTestPro(subscriptionId) {
  await query('UPDATE subscriptions SET user_id=$1 WHERE id=$1',[subscriptionId]);
  await grantTestPro(subscriptionId);
}
