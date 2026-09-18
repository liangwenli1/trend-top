import crypto from 'node:crypto';
import { asJson, many, one, query, transaction, catalogWritesStaged } from './db.js';
import { publicResponseCache } from './catalog-cache.js';

export async function acquireLease(task, owner, seconds = 180) {
  const result = await query(`INSERT INTO task_leases (task,owner,expires_at,started_at,status)
    VALUES ($1,$2,NOW()+($3::int * INTERVAL '1 second'),NOW(),'running')
    ON CONFLICT (task) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at,
      started_at=NOW(),finished_at=NULL,status='running',last_error=NULL
    WHERE task_leases.expires_at<NOW() OR task_leases.status<>'running' RETURNING owner`, [task, owner, seconds]);
  return result.rows.length > 0;
}
export async function withTaskLease(task, run) {
  const owner = crypto.randomUUID();
  if (!(await acquireLease(task, owner))) return { skipped: true, reason: 'task-already-running' };
  let lost = false, renewing = false;
  const assertLease = async () => {
    const row = await one('SELECT owner,status,expires_at FROM task_leases WHERE task=$1 FOR UPDATE', [task]);
    if (lost || row?.owner !== owner || row.status !== 'running' || new Date(row.expires_at) <= new Date()) throw new Error('Task lease lost');
  };
  const heartbeat = setInterval(async () => {
    if (renewing) return;
    renewing = true;
    try {
      const result = await query("UPDATE task_leases SET expires_at=NOW()+INTERVAL '180 seconds' WHERE task=$1 AND owner=$2 AND status='running' AND expires_at>NOW() RETURNING owner", [task, owner]);
      if (!result.rows.length) lost = true;
    } catch { lost = true; }
    finally { renewing = false; }
  }, 30000);
  heartbeat.unref();
  try {
    const value = await run(assertLease, owner);
    await assertLease();
    await query("UPDATE task_leases SET status='ok',finished_at=NOW(),expires_at=NOW() WHERE task=$1 AND owner=$2", [task, owner]);
    return value;
  } catch (error) {
    await query("UPDATE task_leases SET status='failed',last_error=$3,finished_at=NOW(),expires_at=NOW() WHERE task=$1 AND owner=$2", [task, owner, String(error.message).slice(0, 500)]);
    throw error;
  } finally { clearInterval(heartbeat); }
}

export async function recordTraces(runId, type, entries) {
  if (!runId || !entries.length) return;
  // One INSERT per page, rather than adding a database round trip to every search hit.
  for (let offset=0;offset<entries.length;offset+=200) {
  const values = entries.slice(offset, offset+200).map(entry => ({ identity: String(entry.identity || '').toLowerCase(),
    path: entry.path || null, query: entry.query || null, stage: entry.stage, outcome: entry.stage==='storage' && entry.outcome==='stored' && catalogWritesStaged()?'staged':entry.outcome, reason: entry.reason || null }));
  await query(`INSERT INTO collection_traces (run_id,collection_type,identity,resource_path,query_text,stage,outcome,reason)
    SELECT $1,$2,x.identity,x.path,x.query,x.stage,x.outcome,x.reason
    FROM jsonb_to_recordset($3::jsonb) AS x(identity text,path text,query text,stage text,outcome text,reason text)`, [runId, type, JSON.stringify(values)]);
  }
}
export async function publishCatalog(runId, status) {
  await transaction(async () => {
    await query('LOCK TABLE catalog_publications IN SHARE ROW EXCLUSIVE MODE');
    if(runId)await query("UPDATE collection_traces SET outcome='published' WHERE run_id=$1 AND stage='storage' AND outcome='staged'",[runId]);
    const rows = await many('SELECT type,COUNT(*)::int AS n FROM assets WHERE active=TRUE GROUP BY type');
    const repos = await one("SELECT COUNT(*)::int AS n FROM repos WHERE source='github' AND active=TRUE AND deleted=FALSE AND archived=FALSE");
    const counts = { ...Object.fromEntries(rows.map(row => [row.type, row.n])), 'github-repo': repos.n };
    const publication = await one('INSERT INTO catalog_publications (run_id,published_at,status,counts) VALUES ($1,NOW(),$2,$3::jsonb) RETURNING id', [runId, status, JSON.stringify(counts)]);
    // Commit catalog and homepage together. A failure keeps the previous snapshot.
    await (await import('./homepage.js')).publishHomeSnapshot(publication.id);
  });
  publicResponseCache.clear();(await import('./catalog.js')).clearRelatedCache();
}
let revisionAt = 0, revision = '';
export async function catalogRevision(req, res, next) {
  if (!/^\/api\/(?:types|home(?:\/|$)|search|filters|rankings|chart|(?:skill|plugin|agent|components|website|github-repo)\/)/.test(req.path)) return next();
  try {
    if (Date.now() - revisionAt > 5000) {
      const row = await one('SELECT id,published_at FROM catalog_publications ORDER BY id DESC LIMIT 1');
      const current = row ? `${row.id}:${new Date(row.published_at).toISOString()}` : 'initial';
      if (current !== revision) { revision = current; publicResponseCache.clear();(await import('./catalog.js')).clearRelatedCache(); }
      revisionAt = Date.now();
    }
    res.set('X-Catalog-Version', revision);
    next();
  } catch (error) { next(error); }
}
export async function operationsSummary() {
  const [leases, publication, deliveries] = await Promise.all([
    many('SELECT * FROM task_leases ORDER BY task'), one("SELECT * FROM catalog_publications WHERE run_id IS NOT NULL ORDER BY id DESC LIMIT 1"),
    many('SELECT status,COUNT(*)::int AS n,MIN(claimed_at) AS oldest_claim FROM deliveries WHERE local_date>=(NOW()-INTERVAL \'7 days\')::date::text GROUP BY status')
  ]);
  const alerts = [];
  for (const lease of leases) {
    if (lease.status === 'failed') alerts.push({ code: 'task-failed', task: lease.task, message: lease.last_error });
    if (lease.status === 'running' && new Date(lease.expires_at) < new Date()) alerts.push({ code: 'expired-task-lease', task: lease.task });
  }
  if (!publication || Date.now() - new Date(publication.published_at) > 36 * 3600000) alerts.push({ code: 'catalog-stale' });
  const uncertain = deliveries.find(row => row.status === 'uncertain');
  const waiting=deliveries.find(row=>row.status==='pending');
  const failures=deliveries.find(row=>row.status==='failed');
  if(waiting?.n)alerts.push({code:'delivery-backlog',count:waiting.n});
  if(failures?.n)alerts.push({code:'delivery-failures',count:failures.n});
  if (uncertain?.n) alerts.push({ code: 'delivery-needs-review', count: uncertain.n });
  const requests=await many('SELECT id,task,status,attempts,created_at,last_error FROM task_requests ORDER BY created_at DESC LIMIT 50');
  if(requests.some(row=>row.status==='failed'))alerts.push({code:'queued-task-failed'});
  return { leases, requests, publication: publication ? { ...publication, counts: asJson(publication.counts, {}) } : null, deliveries, alerts };
}
