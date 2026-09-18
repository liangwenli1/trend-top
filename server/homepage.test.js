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
  assert.match(html,/Associated repository/);
  assert.match(html,/\/en\/skill\/skill-1/);
  assert.match(renderPublicDigestPreview({source:'demo',items},'zh'),/示例邮件/);
  assert.match(renderPublicDigestPreview({source:'demo',items},'malicious"'),/<html lang="en">/);
});

delete process.env.DATABASE_URL;
process.env.DATA_MODE='demo';
process.env.PGLITE_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'trend-home-test-'));
const {app}=await import('./index.js');
const {ready,one,closeDb}=await import('./db.js');
test.after(async()=>{ await closeDb(); });
await ready;
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
    assert.doesNotMatch(preview.html,/manage_token|unsubscribe_token|recipient|private@example/);
    assert.deepEqual(await one('SELECT COUNT(*)::int AS count FROM outbox'),before);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
