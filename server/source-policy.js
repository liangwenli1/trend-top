import { asJson, many, one, query, dataSource, transaction } from './db.js';
import { DATA_SOURCES, safeSourceUrl } from '../shared/data-sources.js';
import { publishCatalog } from './operations.js';
import { publicResponseCache } from './catalog-cache.js';

let cached = null, cachedAt = 0;
export async function sourcePolicies() {
  if (cached && Date.now() - cachedAt < 5000) return cached;
  const stored = await many('SELECT * FROM source_policies');
  cached = DATA_SOURCES.map(source => {
    const policy = stored.find(row => row.source_id === source.id);
    return { ...source, enabled: !source.collectionDisabled && (policy?.enabled ?? true), metricsAllowed: !source.collectionDisabled && (policy?.metrics_allowed ?? false),
      reviewStatus: source.collectionDisabled ? 'restricted' : policy?.review_status || 'pending', policyUrl: policy?.policy_url || source.policyUrl,
      attribution: policy?.attribution || source.name, notes: policy?.notes || source.restriction || '', reviewedAt: policy?.updated_at || null };
  });
  cachedAt = Date.now();
  return cached;
}
export async function collectionAllowed(sourceId) {
  return (await sourcePolicies()).find(row => row.id === sourceId)?.enabled !== false;
}
export async function saveSourcePolicy(id, body, user) {
  if (!DATA_SOURCES.some(source => source.id === id)) throw Object.assign(new Error('Unknown source'), { status: 404 });
  if (DATA_SOURCES.find(source=>source.id===id)?.collectionDisabled && (body.enabled || body.metricsAllowed)) throw Object.assign(new Error('This source is restricted until a separately authorized adapter is implemented'), {status:400});
  const reviewed = body.reviewStatus === 'approved';
  const policyUrl = safeSourceUrl(body.policyUrl);
  if (body.metricsAllowed && (!reviewed || !policyUrl || !String(body.notes || '').trim())) throw Object.assign(new Error('Metrics require an approved review, policy URL, and evidence notes'), { status: 400 });
  await query(`INSERT INTO source_policies (source_id,enabled,metrics_allowed,review_status,policy_url,attribution,notes,reviewed_by,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT (source_id) DO UPDATE SET enabled=EXCLUDED.enabled,
    metrics_allowed=EXCLUDED.metrics_allowed,review_status=EXCLUDED.review_status,policy_url=EXCLUDED.policy_url,
    attribution=EXCLUDED.attribution,notes=EXCLUDED.notes,reviewed_by=EXCLUDED.reviewed_by,updated_at=NOW()`,
  [id, body.enabled !== false, Boolean(body.metricsAllowed), reviewed ? 'approved' : body.reviewStatus === 'restricted' ? 'restricted' : 'pending', policyUrl, String(body.attribution || '').slice(0, 150), String(body.notes || '').slice(0, 2000), user]);
  cached = null; publicResponseCache.clear();await publishCatalog(null,'source-policy-changed');
}
export function visibleSignals(signals) {
  if (dataSource() === 'demo') return signals;
  const policies = cached || [];
  const directories = Object.fromEntries(Object.entries(signals.directoryMetrics || {}).filter(([id]) => {
    const source = policies.find(row => row.id === id);
    return source?.enabled && source.metricsAllowed && source.reviewStatus === 'approved';
  }));
  // Legacy anonymous counts have no auditable permission or comparable counting window.
  const { installs, usage, downloads, ...rest } = signals;
  return { ...rest, directoryMetrics: directories };
}
export async function removeSourceData(sourceId, reviewer, evidence) {
  return transaction(async()=>{
  if (!String(evidence || '').trim()) throw Object.assign(new Error('Removal evidence is required'), { status: 400 });
  const source = (await sourcePolicies()).find(row => row.id === sourceId);
  if (!source) throw Object.assign(new Error('Unknown source'), { status: 404 });
  await saveSourcePolicy(sourceId, { ...source, enabled: false, metricsAllowed: false, reviewStatus: 'restricted', notes: evidence }, reviewer);
  let removed = 0;
  const rows = await many('SELECT id,type,source_query,ranking_signals FROM assets');
  for (const row of rows) {
    const signals = asJson(row.ranking_signals, {});
    const ownsPage = row.source_query === `website-source:${sourceId}`;
    const ownsMetric = signals.directoryMetrics?.[sourceId];
    if (!ownsPage && !ownsMetric && signals.directory !== sourceId) continue;
    const { installs, usage, downloads, ...clean } = signals;
    clean.directoryMetrics = { ...(clean.directoryMetrics || {}) }; delete clean.directoryMetrics[sourceId];
    if (clean.directory === sourceId) delete clean.directory;
  await query('UPDATE assets SET ranking_signals=$1::jsonb,active=CASE WHEN $2 THEN FALSE ELSE active END WHERE id=$3', [JSON.stringify(clean), ownsPage, row.id]);
    await query('INSERT INTO catalog_reviews (item_type,item_id,action,evidence,reviewed_by) VALUES ($1,$2,\'source-removal\',$3,$4)', [row.type, row.id, evidence, reviewer]);
    removed++;
  }
  await query('UPDATE website_sources SET active=FALSE,metadata=\'{}\'::jsonb WHERE id=$1', [sourceId]);
  publicResponseCache.clear();(await import('./catalog.js')).clearRelatedCache();await publishCatalog(null,'source-removed');
  return { removed, sourceId };
  });
}
// Ranking counters are retained; diagnostics and completed mail snapshots have bounded retention.
export async function pruneDiagnostics() {
  await query("DELETE FROM collection_traces WHERE created_at<NOW()-INTERVAL '90 days'");
  await query("DELETE FROM sync_query_stats WHERE created_at<NOW()-INTERVAL '90 days'");
  await query("DELETE FROM auth_codes WHERE expires_at<NOW()-INTERVAL '1 day'");
  await query("DELETE FROM auth_oauth_states WHERE expires_at<NOW()-INTERVAL '1 day'");
  await query("DELETE FROM task_requests WHERE status IN ('ok','failed') AND created_at<NOW()-INTERVAL '90 days'");
  await query("UPDATE deliveries SET mail_payload=NULL WHERE status IN ('sent','skipped') AND local_date<(NOW()-INTERVAL '400 days')::date::text AND mail_payload IS NOT NULL");
  await query("DELETE FROM digest_images WHERE last_used_at<NOW()-INTERVAL '400 days'");
  await query("DELETE FROM auth_sessions WHERE expires_at<NOW()-INTERVAL '30 days'");
}

export async function reviewResource(type, id, body, reviewer) {
  return transaction(async()=>{
  const row = await one('SELECT * FROM assets WHERE type=$1 AND id=$2', [type, id]);
  if (!row) throw Object.assign(new Error('Resource not found'), { status: 404 });
  const evidence = String(body.evidence || '').trim().slice(0, 2000);
  if (!evidence || !['confirm', 'retire', 'preview', 'instructions'].includes(body.action)) throw Object.assign(new Error('Action and evidence are required'), { status: 400 });
  const signals = asJson(row.ranking_signals, {});
  if(['confirm','retire'].includes(body.action))signals.reviewDisposition=body.action==='retire'?'retired':'confirmed';
  if (body.action === 'confirm') {
    if (type === 'skill' && !/(?:^|\/)SKILL\.md$/i.test(String(signals.resourcePath || ''))) throw Object.assign(new Error('An exact SKILL.md path is required'), { status: 400 });
    signals.typeVerified = true; signals.classificationEvidence = evidence;
  }
  if (body.action === 'preview') {
    const url = safeSourceUrl(body.url), attribution = String(body.attribution || '').trim();
    if (type !== 'components' || !url || !attribution) throw Object.assign(new Error('Preview requires a component resource, safe image URL, and author attribution'), { status: 400 });
    signals.preview = { url, attribution: attribution.slice(0, 200), permissionEvidence: evidence, reviewedAt: new Date().toISOString() };
  }
    if(body.action==='instructions'){
    const instruction=String(body.install || '').trim().slice(0,4000),documentation=safeSourceUrl(body.documentation);
    if(!instruction || !documentation)throw Object.assign(new Error('Installation instructions and source documentation URL required'),{status:400});
    signals.instructions={documentation,evidence,reviewedAt:new Date().toISOString()};
    for(const field of ['transport','runtime','framework'])if(body[field]!=null)signals[field]=String(body[field]).trim().slice(0,200);
    await query('UPDATE assets SET install=$1 WHERE id=$2',[instruction,id]);
  }
  await query('UPDATE assets SET ranking_signals=$1::jsonb,active=$2 WHERE id=$3', [JSON.stringify(signals), ['preview','instructions'].includes(body.action) ? row.active : body.action !== 'retire', id]);
  await query('INSERT INTO catalog_reviews (item_type,item_id,action,evidence,reviewed_by) VALUES ($1,$2,$3,$4,$5)', [type, id, body.action, evidence, reviewer]);
  publicResponseCache.clear();(await import('./catalog.js')).clearRelatedCache();await publishCatalog(null,'resource-reviewed');
  return { ok: true };
  });
}
