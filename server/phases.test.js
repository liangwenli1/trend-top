import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
delete process.env.DATABASE_URL;
process.env.DATA_MODE='demo';
process.env.PGLITE_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'trend-phases-'));
const {ready,query,one,many,transaction,stageCatalogWrites,commitCatalogWrites}=await import('./db.js');
await ready;
const {app}=await import('./index.js');
const {acquireLease,withTaskLease,recordTraces}=await import('./operations.js');
const {enqueueTask,runQueuedTask}=await import('./task-queue.js');
const {saveProductRelationship,removeProductRelationship,attachProductFamily}=await import('./product-families.js');
const {saveSourcePolicy,sourcePolicies,visibleSignals,reviewResource,pruneDiagnostics,removeSourceData}=await import('./source-policy.js');
const {comparableUsage,usagePercentile}=await import('../shared/usage-metrics.js');
const {robotsAllows}=await import('../shared/robots-rules.js');
const {saveSearch,listSavedSearches}=await import('./saved-searches.js');
const {buildDigest}=await import('./digest.js');
const {digest,encryptManageToken}=await import('./jobs.js');
const {freezeTrendImage}=await import('./digest-snapshots.js');
const {grantTestPro}=await import('./test-pro-fixture.js');
const {measurePublicApi}=await import('../scripts/performance-baseline.mjs');
const {normalizeSavedFilters}=await import('../shared/saved-search-filters.js');

async function user(id){
  await query("INSERT INTO users(id,email,password_hash,locale,created_at,verified_at) VALUES($1,$2,'synthetic-password','en',NOW(),NOW()) ON CONFLICT(id) DO NOTHING",[id,id+'@example.invalid']);
  const token=crypto.randomBytes(32).toString('hex');
  await query("INSERT INTO auth_sessions(token_hash,user_id,expires_at,created_at) VALUES($1,$2,NOW()+INTERVAL '1 day',NOW())",[crypto.createHash('sha256').update(token).digest('hex'),id]);
  return 'trend_top_session='+token;
}
const sub=(id,extra={})=>({id,user_id:id,locale:'en',types:['github-repo'],boards:['stars'],topics:[],languages:[],timezone:'UTC',...extra});

test('transaction rollback preserves the previous publication state',async()=>{
  await assert.rejects(transaction(async()=>{await query("INSERT INTO catalog_publications(status,counts,published_at) VALUES('rollback','{}',NOW())");throw new Error('interrupted publication')}),/interrupted/);
  assert.equal(await one("SELECT id FROM catalog_publications WHERE status='rollback'"),null);
});
test('network collection stages content and only publishes it after a complete database transaction',async()=>{
  const repo=await one("SELECT id,stars FROM repos WHERE source='demo' LIMIT 1");
  await stageCatalogWrites(async()=>{
    await query('UPDATE repos SET stars=$1 WHERE id=$2',[repo.stars+99,repo.id]);
    assert.equal((await one('SELECT stars FROM repos WHERE id=$1',[repo.id])).stars,repo.stars);
    await assert.rejects(commitCatalogWrites(async()=>{throw new Error('publication failed')}),/publication failed/);
    assert.equal((await one('SELECT stars FROM repos WHERE id=$1',[repo.id])).stars,repo.stars);
  });
  await stageCatalogWrites(async()=>{
    await query('UPDATE repos SET stars=$1 WHERE id=$2',[repo.stars+99,repo.id]);
    await commitCatalogWrites(async()=>{});
  });
  assert.equal((await one('SELECT stars FROM repos WHERE id=$1',[repo.id])).stars,repo.stars+99);
});
test('task leases exclude another process, recover expiry and fence a lost owner',async()=>{
  assert.equal(await acquireLease('lease-test','one'),true);
  assert.equal(await acquireLease('lease-test','two'),false);
  await query("UPDATE task_leases SET expires_at=NOW()-INTERVAL '1 second' WHERE task='lease-test'");
  assert.equal(await acquireLease('lease-test','two'),true);
  await assert.rejects(withTaskLease('lost-test',async check=>{await query("UPDATE task_leases SET owner='replacement' WHERE task='lost-test'");await check()}),/lease lost/);
  assert.equal((await one("SELECT owner FROM task_leases WHERE task='lost-test'")).owner,'replacement');
});
test('manual jobs coalesce, remain durable on failure, and recover an interrupted worker',async()=>{
  const first=await enqueueTask('backfill','test');
  assert.equal((await enqueueTask('backfill','another')).id,first.id);
  await assert.rejects(runQueuedTask('backfill',async()=>{throw new Error('temporary failure')}),/temporary/);
  let row=await one('SELECT * FROM task_requests WHERE id=$1',[first.id]);
  assert.equal(row.status,'queued');assert.equal(row.attempts,1);
  await query("UPDATE task_requests SET available_at=NOW(),status='running' WHERE id=$1",[first.id]);
  await runQueuedTask('backfill',async()=>({ok:true}));
  row=await one('SELECT * FROM task_requests WHERE id=$1',[first.id]);
  assert.equal(row.status,'ok');assert.equal(row.attempts,2);
});
test('per-candidate diagnostics persist every batch, including entries beyond 200',async()=>{
  const run=await one("INSERT INTO sync_runs(started_at,status) VALUES(NOW(),'test') RETURNING id");
  await recordTraces(run.id,'skill',Array.from({length:451},(_,i)=>({identity:'owner/repo-'+i,stage:'verification',outcome:'rejected',reason:'missing-file'})));
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM collection_traces WHERE run_id=$1',[run.id])).n,451);
});
test('source permissions remove anonymous live counters and cannot bypass restricted directories',async()=>{
  await assert.rejects(saveSourcePolicy('glama',{enabled:true,metricsAllowed:true,reviewStatus:'approved',policyUrl:'https://example.invalid/terms',notes:'test'},'reviewer'),/restricted/);
  await assert.rejects(saveSourcePolicy('skills-sh',{metricsAllowed:true},'reviewer'),/approved review/);
  await sourcePolicies();
  process.env.DATA_MODE='live';
  try{const visible=visibleSignals({installs:123,directoryMetrics:{'skills-sh':{installs:{value:123}},glama:{usage:{value:1}}}});assert.equal(visible.installs,undefined);assert.deepEqual(visible.directoryMetrics,{})}finally{process.env.DATA_MODE='demo'}
});
test('usage comparison isolates source, counting unit and window',()=>{
  const metric=(directory,period,value)=>comparableUsage({directoryMetrics:{[directory]:{installs:{value,scope:'individual-skill',period}}}});
  const first=metric('a','weekly',10),same=metric('a','weekly',20),other=metric('b','weekly',1000),window=metric('a','cumulative',2000);
  const items=[first,same,other,window].map(usageMetric=>({usageMetric,usage:usageMetric.value}));
  assert.equal(usagePercentile(items[0],items),0);assert.equal(usagePercentile(items[1],items),100);assert.equal(usagePercentile(items[2],items),null);
  assert.equal(metric('a','unknown',1).cohort,null);
});
test('robots groups and path rules respect specific bots, wildcard paths and Allow ties',()=>{
  const url='https://example.invalid/private/public-file';
  assert.equal(robotsAllows('User-agent: *\nDisallow: /private\nAllow: /private/public',url),true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /private',url),false);
  assert.equal(robotsAllows('User-agent: *\nAllow: /\nUser-agent: TrendTopBot\nDisallow: /',url),false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*?secret=*$','https://example.invalid/p?secret=x'),false);
});
test('reviewed families merge exact resources, reject chains and can be reversed',async()=>{
  const item={type:'plugin',sourceRepoUrl:'https://github.com/vendor/mcp-server',full_name:'vendor/mcp-server'};
  const other={type:'github-repo',full_name:'vendor/other',url:'https://github.com/vendor/other'};
  await saveProductRelationship({repository:'https://github.com/vendor/mcp-server',familyRepository:'https://github.com/vendor/product',evidence:'Reviewed official documentation'},'reviewer');
  assert.equal(attachProductFamily(item).productFamily,'repo:vendor/product');
  assert.equal(attachProductFamily(other).productFamily,'repo:vendor/other');
  await assert.rejects(saveProductRelationship({repository:'https://github.com/vendor/product',familyRepository:'https://github.com/vendor/another',evidence:'test'},'reviewer'),/chained/);
  await removeProductRelationship('https://github.com/vendor/mcp-server','Incorrect relationship','reviewer');
  assert.equal(attachProductFamily(item).productFamily,'repo:vendor/mcp-server');
});
test('classification review is reversible and component preview cannot reactivate retired content',async()=>{
  const row=await one("SELECT id FROM assets WHERE type='components' LIMIT 1");
  await reviewResource('components',row.id,{action:'retire',evidence:'Wrong type sample'},'reviewer');
  await reviewResource('components',row.id,{action:'preview',url:'https://example.invalid/author.png',attribution:'Author',evidence:'Synthetic permission fixture'},'reviewer');
  assert.equal((await one('SELECT active FROM assets WHERE id=$1',[row.id])).active,false);
  await reviewResource('components',row.id,{action:'confirm',evidence:'Corrected type sample'},'reviewer');
  assert.equal((await one('SELECT active FROM assets WHERE id=$1',[row.id])).active,true);
});
test('saved filters enforce ownership, limits and safe canonical paths',async()=>{
  await user('saved-one');await user('saved-two');
  const saved=await saveSearch('saved-one',{name:'Skill search',filters:{type:'skill',topic:'api,apis',q:'test'},notify:true});
  assert.equal(saved.filters.topic,'api');assert.deepEqual(await listSavedSearches('saved-two'),[]);
  await assert.rejects(saveSearch('saved-two',{name:'steal',filters:{}},saved.id),/not found/);
  for(let i=1;i<20;i++)await saveSearch('saved-one',{name:'search '+i});
  await assert.rejects(saveSearch('saved-one',{name:'exceeds limit'}),/20/);
  assert.equal(normalizeSavedFilters(null).type,'github-repo');
});
test('daily saved-search alerts establish a baseline and only report threshold crossings',async()=>{
  await user('threshold-reader');
  const saved=await saveSearch('threshold-reader',{name:'Growth alert',filters:{type:'github-repo',board:'stars'},notify:true,rule:'growth-threshold',threshold:1});
  const preferences=sub('threshold-reader',{types:[],boards:[]});
  const first=await buildDigest(preferences,'fixture-token');
  assert.equal(first.sections.length,0);
  const key='saved:'+saved.id,previous={...first.snapshot};
  previous[key+':growth']=Object.fromEntries(first.snapshot[key].map(name=>[name,0]));
  const crossing=await buildDigest(preferences,'fixture-token',{previous});
  assert.ok(crossing.sections.some(section=>section.name==='Growth alert'));
  const unchanged=await buildDigest(preferences,'fixture-token',{previous:crossing.snapshot});
  assert.equal(unchanged.sections.length,0);
  await saveSearch('threshold-reader',{...saved,threshold:2},saved.id);
  assert.equal((await buildDigest(preferences,'fixture-token',{previous:crossing.snapshot})).sections.length,0);
});
test('mail has a global 12-product budget, per-type representation and receipt explanations',async()=>{
  const mail=await buildDigest(sub('six-types',{types:['skill','plugin','agent','components','website','github-repo'],boards:['stars','hot']}),'fixture-token');
  const items=mail.sections.flatMap(section=>section.items);
  assert.ok(items.length<=12&&items.length>0);
  assert.equal(new Set(mail.sections.map(section=>section.type)).size,6);
  assert.equal(new Set(items.map(item=>item.productFamily)).size,items.length);
  assert.ok(mail.sections.every(section=>section.reason));assert.ok(mail.text.includes('Manage email delivery'));
});
test('immutable chart URLs keep their exact bytes after history is corrected',async()=>{
  const item=await one("SELECT * FROM assets WHERE type='skill' LIMIT 1"),at=await one('SELECT MAX(day) AS day FROM asset_daily WHERE asset_id=$1',[item.id]);
  const before=await freezeTrendImage(item,'skill',at.day,'http://127.0.0.1');
  assert.match(before,/digest-images\/[a-f0-9]{64}\.png$/);
  const hash=before.split('/').pop().slice(0,-4),frozen=await one('SELECT * FROM digest_images WHERE hash=$1',[hash]);
  await query('UPDATE asset_daily SET star_created=star_created+500 WHERE asset_id=$1',[item.id]);
  const after=await freezeTrendImage(item,'skill',at.day,'http://127.0.0.1');
  assert.notEqual(after,before);assert.equal((await one('SELECT png_base64 FROM digest_images WHERE hash=$1',[hash])).png_base64,frozen.png_base64);
});
test('retry uses the frozen email and interrupted submissions wait for human review',async()=>{
  await user('retry-reader');await grantTestPro('retry-reader');
  await query(`INSERT INTO subscriptions(id,user_id,email,locale,types,boards,send_hour,timezone,status,manage_hash,created_at,verified_at)
    VALUES('retry-reader','retry-reader','retry-reader@example.invalid','en','["github-repo"]','["stars"]',0,'UTC','active',$1,NOW(),NOW())`,[encryptManageToken('fixture-token')]);
  await digest({force:true});
  const first=await one("SELECT * FROM deliveries WHERE subscription_id='retry-reader'");
  assert.equal(first.status,'sent');
  await query("UPDATE deliveries SET status='failed',attempts=0 WHERE id=$1",[first.id]);
  await query("UPDATE repos SET stars=stars+100000 WHERE source='demo'");
  await digest({force:true});
  const second=await one('SELECT * FROM deliveries WHERE id=$1',[first.id]);
  assert.deepEqual(second.mail_payload,first.mail_payload);
  const delivered=await many("SELECT html FROM outbox WHERE to_email='retry-reader@example.invalid' ORDER BY id");
  assert.equal(delivered.length,2);assert.equal(delivered[0].html,delivered[1].html);
  await query("UPDATE deliveries SET status='sending',claimed_at=NOW()-INTERVAL '1 hour' WHERE id=$1",[first.id]);
  await digest({force:true});assert.equal((await one('SELECT status FROM deliveries WHERE id=$1',[first.id])).status,'uncertain');
  assert.equal((await one("SELECT COUNT(*)::int AS n FROM outbox WHERE to_email='retry-reader@example.invalid'")).n,2);
});
test('saved-search and send-history APIs isolate accounts and keep cleanup after Pro expiry',async()=>{
  const cookie=await user('api-owner'),other=await user('api-other');await grantTestPro('api-owner');await grantTestPro('api-other');
  const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
  const request=(route,method='GET',body,auth=cookie)=>fetch(base+route,{method,headers:{Cookie:auth,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  try{
    assert.equal((await fetch(base+'/api/saved-searches')).status,401);
    const saved=await (await request('/api/saved-searches','POST',{name:'Owned',filters:{type:'skill'}})).json();
    assert.ok(saved.item?.id);
    assert.equal((await request('/api/saved-searches/'+saved.item.id,'PUT',{name:'Steal'},other)).status,404);
    await grantTestPro('api-owner',{endsAt:'2000-01-01T00:00:00Z'});
    assert.equal((await request('/api/saved-searches','POST',{name:'New'})).status,403);
    assert.equal((await request('/api/saved-searches/'+saved.item.id,'DELETE',{})).status,200);
    const history=await(await request('/api/delivery-history')).json();assert.deepEqual(history.items,[]);
    const foreign=await one("SELECT id FROM deliveries WHERE subscription_id='retry-reader'");
    assert.equal((await request('/api/feedback','POST',{rating:'useful',deliveryId:foreign.id})).status,404);
    assert.equal((await request('/api/feedback','POST',{rating:'useful'})).status,201);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
test('public performance baseline covers all six collections and separates cache states',async()=>{
  const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
  try{
    const report=await measurePublicApi({base,repeat:3,phase:'isolated-demo'});
    assert.equal(report.samples.length,63);assert.ok(report.samples.every(row=>row.status===200));
    assert.ok(report.groups.some(row=>row.cache==='HIT'));assert.ok(report.groups.some(row=>row.cache==='MISS'));
    if(process.env.PERF_REPORT){const output=path.resolve(process.env.PERF_REPORT);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n')}
  }finally{await new Promise(resolve=>server.close(resolve))}
});

test('reviewed instructions require a source and keep a retired resource inactive',async()=>{
  const row=await one("SELECT * FROM assets WHERE type='components' LIMIT 1");
  await reviewResource('components',row.id,{action:'retire',evidence:'Fixture retired'},'reviewer');
  await assert.rejects(reviewResource('components',row.id,{action:'instructions',install:'npm install fixture',evidence:'Author instructions'},'reviewer'),/documentation URL/);
  await reviewResource('components',row.id,{action:'instructions',install:'npm install fixture',documentation:'https://example.invalid/docs',framework:'React',evidence:'Author instructions'},'reviewer');
  const after=await one('SELECT * FROM assets WHERE id=$1',[row.id]);
  assert.equal(after.active,false);assert.equal(after.install,'npm install fixture');
  assert.equal(after.ranking_signals.instructions.documentation,'https://example.invalid/docs');
  assert.equal(after.ranking_signals.framework,'React');
});
test('successful source observations are staged while retry errors remain durable',async()=>{
  await query("INSERT INTO website_sources(id,name,url) VALUES('phase-source','Phase source','https://phase.example.invalid')");
  const row=await one("SELECT * FROM website_sources WHERE id='phase-source'");assert.ok(row);
  await stageCatalogWrites(async()=>{
    await query('UPDATE website_sources SET metadata=$1::jsonb WHERE id=$2',[JSON.stringify({staged:true}),row.id]);
    await query('UPDATE website_sources SET last_error=$1 WHERE id=$2',['retry fixture',row.id]);
    assert.deepEqual((await one('SELECT metadata FROM website_sources WHERE id=$1',[row.id])).metadata,row.metadata);
    await assert.rejects(commitCatalogWrites(async()=>{throw new Error('fixture rollback')}),/rollback/);
  });
  const after=await one('SELECT * FROM website_sources WHERE id=$1',[row.id]);
  assert.deepEqual(after.metadata,row.metadata);assert.equal(after.last_error,'retry fixture');
});
test('image retention keeps recently reused content and removes only expired diagnostics',async()=>{
  const item=await one("SELECT * FROM assets WHERE type='skill' LIMIT 1"),at=await one('SELECT MAX(day) AS day FROM asset_daily WHERE asset_id=$1',[item.id]);
  const url=await freezeTrendImage(item,'skill',at.day,'http://127.0.0.1');const hash=url.split('/').pop().slice(0,-4);
  await query("UPDATE digest_images SET last_used_at=NOW()-INTERVAL '401 days' WHERE hash=$1",[hash]);
  await freezeTrendImage(item,'skill',at.day,'http://127.0.0.1');
  await query("INSERT INTO digest_images(hash,png_base64,last_used_at) VALUES($1,'fixture',NOW()-INTERVAL '401 days')",['f'.repeat(64)]);
  await query("INSERT INTO task_requests(id,task,status,created_at) VALUES('old-complete','history','ok',NOW()-INTERVAL '91 days'),('old-pending','history','queued',NOW()-INTERVAL '91 days')");
  await pruneDiagnostics();
  assert.ok(await one('SELECT hash FROM digest_images WHERE hash=$1',[hash]));
  assert.equal(await one('SELECT hash FROM digest_images WHERE hash=$1',['f'.repeat(64)]),null);
  assert.equal(await one("SELECT id FROM task_requests WHERE id='old-complete'"),null);
  assert.ok(await one("SELECT id FROM task_requests WHERE id='old-pending'"));
});
test('admin quality is protected and uncertain delivery decisions are audited',async()=>{
  const previous=process.env.ADMIN_EMAILS;process.env.ADMIN_EMAILS='phase-admin@example.invalid';
  const cookie=await user('phase-admin'),other=await user('phase-reader');
  const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
  const request=(route,method='GET',body,auth=cookie)=>fetch(base+route,{method,headers:{Cookie:auth,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  try{
    assert.equal((await request('/api/admin/quality','GET',undefined,other)).status,403);
    const response=await request('/api/admin/quality');assert.equal(response.status,200);
    const quality=await response.json();assert.ok(quality.valueOverview);assert.ok(Array.isArray(quality.uncertain));
    assert.ok(!JSON.stringify(quality).includes('fixture-token'));
    const row=await one("SELECT id FROM deliveries WHERE subscription_id='retry-reader' AND status='uncertain'");assert.ok(row);
    assert.equal((await request('/api/admin/deliveries/'+row.id+'/resolve','POST',{action:'retry'})).status,400);
    assert.equal((await request('/api/admin/deliveries/'+row.id+'/resolve','POST',{action:'skip',evidence:'Provider confirmed no receipt; operator chose no resend'})).status,200);
    assert.equal((await one('SELECT status FROM deliveries WHERE id=$1',[row.id])).status,'skipped');
    assert.equal((await one('SELECT action FROM delivery_reviews WHERE delivery_id=$1',[row.id])).action,'skip');
    assert.equal((await request('/api/admin/deliveries/'+row.id+'/resolve','POST',{action:'retry',evidence:'Repeat'})).status,404);
    const first=await request('/api/admin/collect','POST',{});assert.equal(first.status,202);
    const second=await request('/api/admin/collect','POST',{});assert.equal(second.status,202);
  }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=previous}
});
test('source removal is audited and preserves independently collected repositories',async()=>{
  const row=await one("SELECT * FROM assets WHERE type='website' LIMIT 1");
  const before=await one('SELECT COUNT(*)::int AS n FROM repos');
  await query("UPDATE assets SET source_query='website-source:glama',ranking_signals=$1::jsonb WHERE id=$2",[JSON.stringify({directory:'glama',directoryMetrics:{glama:{value:9}}}),row.id]);
  await removeSourceData('glama','reviewer','Source owner restriction');
  const after=await one('SELECT * FROM assets WHERE id=$1',[row.id]);assert.equal(after.active,false);assert.equal(after.ranking_signals.directoryMetrics.glama,undefined);
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM repos')).n,before.n);
  assert.ok(await one("SELECT id FROM catalog_reviews WHERE item_id=$1 AND action='source-removal'",[row.id]));
});

test('a displaced queue worker cannot overwrite its replacement request state',async()=>{
  const request=await enqueueTask('digest','fixture');
  await assert.rejects(runQueuedTask('digest',async()=>{
    await query("UPDATE task_leases SET owner='replacement' WHERE task='queue:digest'");
    await query("UPDATE task_requests SET worker_owner='replacement',status='running' WHERE id=$1",[request.id]);
    throw new Error('old worker failed');
  }),/old worker failed/);
  const after=await one('SELECT * FROM task_requests WHERE id=$1',[request.id]);
  assert.equal(after.worker_owner,'replacement');assert.equal(after.status,'running');assert.equal(after.last_error,null);
});
