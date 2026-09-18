import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selectHomeItems } from '../shared/home-discovery.js';
import { renderPublicDigestPreview } from './digest-preview.js';

const item=(id,repo,gain=5)=>({id,slug:`skill-${id}`,full_name:`Skill ${id}`,description:'Useful workflow',sourceRepoUrl:repo,gain,privateToken:'never-publish',email:'private@example.invalid'});
const board=(type,items,extra={})=>({type,items,board:'hot',updatedAt:'2026-09-18',growthBasis:'star_created',...extra});

test('discovery balances boards and merges the same product across resource types',()=>{
  const selected=selectHomeItems([
    board('skill',[item(1,'https://github.com/Owner/Product/tree/main'),item(2,'https://github.com/other/skill')]),
    board('plugin',[item(3,'https://github.com/third/plugin')]),
    board('github-repo',[{...item(4,'https://github.com/owner/product'),url:'https://github.com/owner/product'},{...item(5,'https://github.com/fifth/repo'),url:'https://github.com/fifth/repo'}])
  ]);
  assert.deepEqual(selected.map(value=>value.id),['1','3','2','5']);
  assert.equal(new Set(selected.map(value=>value.productFamily)).size,4);
  assert.equal(selected[0].metricScope,'associated-repository');
  assert.equal(selected.at(-1).metricScope,'repository');
  assert.ok(!JSON.stringify(selected).includes('never-publish'));
  assert.ok(!JSON.stringify(selected).includes('private@example.invalid'));
});

test('unknown, anomalous, and unrelated Star gains are not invented; zero and declines survive',()=>{
  const selected=selectHomeItems([board('skill',[
    item(1,'https://github.com/a/one',0),item(2,'https://github.com/a/two',-4),item(3,'https://github.com/a/three',null),
    {...item(4,'https://github.com/a/four',600),anomaly:true},item(5,'https://unrelated.example/site',99),{...item(6,'https://github.com/a/six'),description:''}
  ],{board:'stars'})]);
  assert.deepEqual(selected.map(value=>value.gain),[0,-4,null,null,null]);
  assert.equal(selected.at(-1).metricScope,'none');
  assert.ok(selected.every(value=>value.selection==='catalog'));
  assert.equal(selectHomeItems([board('skill',Array.from({length:20},(_,i)=>item(i,`https://github.com/a/item${i}`)))]).length,6);
});

test('public email preview escapes catalog content, shares centered branding and has no account links',()=>{
  const items=selectHomeItems([board('skill',[{...item(1,'https://github.com/a/one'),full_name:'<script>alert(1)</script>',description:'<img src=x onerror=alert(1)>'}])]);
  const html=renderPublicDigestPreview({source:'demo',items});
  assert.match(html,/SAMPLE EMAIL · PUBLIC CATALOG · DEMO DATA/);
  assert.match(html,/email-logo\.png/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script|<img src=x|private@example|never-publish|\/manage\?|\/unsubscribe\?|token=/);
  assert.match(html,/associated repository/i);
  assert.match(html,/\/en\/skill\/skill-1/);
  assert.match(renderPublicDigestPreview({source:'demo',items},'zh'),/示例邮件/);
  assert.match(renderPublicDigestPreview({source:'demo',items},'malicious"'),/<html lang="en">/);
  const compared=renderPublicDigestPreview({source:'demo',items:[],previewBoards:{skill:[
    {...items[0],gain:100,full_name:'big',url:'/en/skill/skill-1'},
    {...items[0],id:'2',slug:'skill-2',gain:40,full_name:'small',url:'/en/skill/skill-2'}
  ]}});
  assert.match(compared,/width:100%/);
  assert.match(compared,/width:40%/);
});

delete process.env.DATABASE_URL;
process.env.DATA_MODE='demo';
process.env.PGLITE_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'trend-home-test-'));
const {app}=await import('./index.js');
const {ready,one,query,transaction,dataSource,closeDb}=await import('./db.js');
const {initializeHomeSnapshot,getHomeDiscovery,publishHomeSnapshot}=await import('./homepage.js');
const {publishCatalog}=await import('./operations.js');
const {freezeTrendImage}=await import('./digest-snapshots.js');
test.after(async()=>{ await closeDb(); });
await ready;
await assert.rejects(getHomeDiscovery(),error=>error.status===503);
await initializeHomeSnapshot();

test('public preview freezes real complete chart history without writing mail or digest images',async()=>{
  const data=await getHomeDiscovery({includePreviewCharts:true});
  assert.ok(data.previewCharts.length>0);
  assert.equal((await getHomeDiscovery()).previewCharts,undefined,'ordinary homepage does not transfer PNG bytes');
  const html=renderPublicDigestPreview(data);
  assert.match(html,/30-day cumulative new Stars chart/);
  assert.match(html,/src="data:image\/png;base64,iVBOR/);
  assert.match(html,/7-day Hot/);
  assert.match(html,/Skills|Plugins|Agents|Components|Websites|Repositories/);
  const chart=data.previewCharts[0];
  const selected=data.items.find(item=>item.type===chart.type&&item.id===chart.id);
  assert.notEqual(selected.type,'github-repo');
  const before=await one('SELECT COUNT(*)::int AS n FROM digest_images');
  const png=await freezeTrendImage(selected,selected.type,selected.updatedAt,'',{requireComplete:true,inline:true});
  assert.equal(png,chart.image);
  assert.deepEqual(await one('SELECT COUNT(*)::int AS n FROM digest_images'),before);
  await assert.rejects(transaction(async()=>{
    await query('UPDATE asset_daily SET star_created=NULL WHERE asset_id=$1 AND day=$2::date',[selected.id,chart.end]);
    assert.equal(await freezeTrendImage(selected,selected.type,selected.updatedAt,'',{requireComplete:true,inline:true}),null);
    assert.equal(renderPublicDigestPreview(await getHomeDiscovery({includePreviewCharts:true})),html,'published image survives unpublished history changes');
    throw new Error('restore chart fixture');
  }),/restore chart fixture/);
  assert.doesNotMatch(renderPublicDigestPreview({...data,previewCharts:[{...chart,image:'javascript:alert(1)'}]}),/javascript:/);
});

test('homepage publication persists, follows catalog versions and survives generation or commit failure',async()=>{
  const initial=await getHomeDiscovery();
  assert.equal(initial.snapshot.catalogVersion,0);
  const selected=initial.items[0];
  assert.notEqual(selected.type,'github-repo');
  await query('UPDATE assets SET description=$1 WHERE id=$2',['Changed only in unpublished storage',selected.id]);
  assert.deepEqual(await getHomeDiscovery(),initial);
  await initializeHomeSnapshot();
  assert.deepEqual(await getHomeDiscovery(),initial,'restart reuses the publication');
  await publishCatalog(null,'homepage-test');
  const published=await getHomeDiscovery();
  assert.ok(published.snapshot.catalogVersion>0);
  assert.equal(published.items.find(item=>item.id===selected.id&&item.type===selected.type).description,'Changed only in unpublished storage');
  for(const useCase of Object.keys((await import('../shared/taxonomy.js')).USE_CASES)){
    const filtered=await getHomeDiscovery({type:'skill',useCase});
    assert.ok(filtered.items.every(item=>item.type==='skill'&&item.useCase===useCase));
  }
  const stored=await one('SELECT * FROM homepage_snapshots WHERE source=$1',[dataSource()]);
  const catalogBefore=await one('SELECT id FROM catalog_publications ORDER BY id DESC LIMIT 1');
  await assert.rejects(transaction(async()=>{
    await publishCatalog(null,'interrupted-homepage-test');
    throw new Error('publication interrupted before commit');
  }),/publication interrupted/);
  assert.deepEqual(await one('SELECT * FROM homepage_snapshots WHERE source=$1',[dataSource()]),stored);
  assert.deepEqual(await one('SELECT id FROM catalog_publications ORDER BY id DESC LIMIT 1'),catalogBefore);
  await assert.rejects(publishHomeSnapshot(published.snapshot.catalogVersion+1,async()=>{throw new Error('candidate generation failed');}),/generation failed/);
  assert.deepEqual(await getHomeDiscovery(),published);
  await publishHomeSnapshot(0,async()=>({variants:{}}));
  assert.deepEqual(await getHomeDiscovery(),published,'older workers cannot replace newer publications');
  await query("UPDATE homepage_snapshots SET published_at=NOW()-INTERVAL '2 days' WHERE source=$1",[dataSource()]);
  const stale=await getHomeDiscovery();
  assert.equal(stale.snapshot.stale,true);
  assert.ok(stale.items.every(item=>item.stale));
  assert.deepEqual(stale.items.map(item=>item.updatedAt),published.items.map(item=>item.updatedAt));
  await query('UPDATE homepage_snapshots SET published_at=$1 WHERE source=$2',[stored.published_at,dataSource()]);
});
test('public homepage API supports canonical type/task filters, validates inputs, and never queues mail',async()=>{
  const server=app.listen(0);
  const base=`http://127.0.0.1:${server.address().port}`;
  const before=await one('SELECT COUNT(*)::int AS count FROM outbox');
  try {
    const response=await fetch(base+'/api/home');
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.types.length,6);
    assert.ok(data.items.length>0&&data.items.length<=6);
    assert.equal(new Set(data.items.map(item=>item.productFamily)).size,data.items.length);
    assert.equal(data.selection,'type-board-round-robin');
    assert.ok(response.headers.get('X-Catalog-Version'));
    const cached=await fetch(base+'/api/home');
    assert.equal(cached.headers.get('X-Catalog-Cache'),'HIT');
    assert.equal((await cached.json()).generatedAt,data.generatedAt);
    await publishCatalog(null,'homepage-api-test');
    const refreshed=await fetch(base+'/api/home');
    assert.equal(refreshed.headers.get('X-Catalog-Cache'),'MISS');
    assert.ok((await refreshed.json()).snapshot.catalogVersion>data.snapshot.catalogVersion);
    assert.ok(data.tasks.every(task=>['browser','coding','ui','documents','research','git'].includes(task.id)));
    const filtered=await(await fetch(base+'/api/home?type=skill')).json();
    assert.ok(filtered.items.length>0);
    assert.ok(filtered.items.every(item=>item.type==='skill'));
    const task=await(await fetch(base+'/api/home?type=skill&useCase=browser')).json();
    assert.ok(task.items.every(item=>item.type==='skill'&&item.useCase==='browser'));
    for(const query of ['type=invalid','useCase=invalid','type=skill&type=plugin','useCase=browser&useCase=ui'])assert.equal((await fetch(base+'/api/home?'+query)).status,400);
    const preview=await(await fetch(base+'/api/home/digest-preview?locale=zh')).json();
    assert.equal(preview.sample,true);
    assert.match(preview.html,/公开目录/);
    assert.match(preview.html,/data:image\/png;base64,iVBOR/);
    assert.doesNotMatch(preview.html,/manage_token|unsubscribe_token|recipient|private@example/);
    assert.deepEqual(await one('SELECT COUNT(*)::int AS count FROM outbox'),before);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
