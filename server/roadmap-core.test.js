import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createScheduler } from '../scripts/scheduler-core.mjs';
import { renderGrowthChart, growthLabel } from './digest-growth.js';
import { parseChartEnd } from './digest-chart-date.js';
import { createPublicJsonCache } from './catalog-cache.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const num = new Intl.NumberFormat('en-US');

test('growth charts never substitute totals, manufacture a zero bar, or show unverified gains', () => {
  const html = renderGrowthChart([
    {full_name:'unknown',gain:null,stars:990000},
    {full_name:'known',gain:10,stars:5000},
    {full_name:'zero',gain:0},
    {full_name:'review',gain:500000,anomaly:true}
  ], num, false);
  assert.doesNotMatch(html, /990,000|5,000|500,000/);
  assert.match(html, /width:100%/);
  assert.match(html, /width:0%/);
  assert.match(html, /Growth unavailable/);
  assert.match(html, /Growth under review/);
  assert.equal(growthLabel({gain:-3},num,false), '-3 ★');
  assert.equal(growthLabel({gain:NaN},num,false), 'Growth unavailable');
  assert.doesNotMatch(renderGrowthChart([{full_name:'<script>',gain:1}],num,false), /<script>/);
  const compared = renderGrowthChart([{full_name:'big',gain:80},{full_name:'small',gain:20}], num, false);
  assert.match(compared, /width:100%/);
  assert.match(compared, /width:25%/);
});

test('email chart dates are explicit valid UTC days, with no future or coercible input', () => {
  const now = new Date('2026-09-17T01:00:00Z');
  assert.equal(parseChartEnd('2024-02-29',now).toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(parseChartEnd(undefined,now), null);
  for (const value of ['2026-02-30','2026-09-18','2026-9-1',['2026-09-17'],'not-a-day']) assert.throws(()=>parseChartEnd(value,now));
});

test('hourly delivery runs while collection is blocked, with one slot per task and missed-hour recovery', async () => {
  let clock = new Date('2026-09-17T02:24:00Z'), release;
  const calls = [];
  const scheduler = createScheduler({ now:()=>clock, run:async task=>{
    calls.push(task);
    if(task==='collect') return new Promise(resolve=>{release=resolve;});
    return true;
  }});
  await scheduler.tick(); await flush();
  assert.deepEqual(calls,['digest','collect']);
  clock = new Date('2026-09-17T03:40:00Z');
  await scheduler.tick(); await flush(); await scheduler.tick();
  assert.equal(calls.filter(task=>task==='digest').length,2);
  assert.equal(calls.filter(task=>task==='collect').length,1);
  release(true); await scheduler.settle();
  clock = new Date('2026-09-17T04:00:00Z');
  await scheduler.tick(); await scheduler.settle();
  assert.equal(calls.filter(task=>task==='collect').length,1);
});

test('collection checks use a fresh clock after a slow database lookup', async () => {
  let clock = new Date('2026-09-17T02:59:00Z'), release;
  const calls=[];
  const scheduler=createScheduler({now:()=>clock,latestCollectDay:()=>new Promise(resolve=>{release=resolve;}),run:async task=>{calls.push(task);return true;}});
  const tick=scheduler.tick(); await flush();
  assert.deepEqual(calls,['digest']);
  clock=new Date('2026-09-17T03:00:00Z'); release('');
  await tick; await scheduler.settle();
  assert.equal(calls.filter(task=>task==='digest').length,2);
  assert.equal(scheduler.status().lastCollectAttemptHour,'2026-09-17T03');
});

test('completed partial days are respected after restart; failed collections retry only next hour', async () => {
  let clock=new Date('2026-09-17T10:15:00Z'), calls=[];
  const completed=createScheduler({now:()=>clock,latestCollectDay:async()=> '2026-09-17',run:async task=>{calls.push(task);return true;}});
  await completed.tick(); await completed.settle(); assert.deepEqual(calls,['digest']);
  calls=[];
  const failed=createScheduler({now:()=>clock,run:async task=>{calls.push(task);return task==='digest';}});
  await failed.tick(); await failed.settle(); await failed.tick(); await failed.settle();
  assert.equal(calls.filter(task=>task==='collect').length,1);
  clock=new Date('2026-09-17T11:10:00Z');
  await failed.tick(); await failed.settle();
  assert.equal(calls.filter(task=>task==='collect').length,2);
});

async function withCacheServer(callback, options={}) {
  const app=express(), cache=createPublicJsonCache(options);
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  let calls=0, release;
  app.get('/catalog',cache.middleware,async(req,res)=>{calls++; if(req.query.wait) await new Promise(resolve=>{release=resolve;});res.json({locale:req.query.locale||'en',version:calls});});
  app.get('/failure',cache.middleware,(_req,res)=>{calls++;res.status(503).json({error:'Unavailable'});});
  app.get('/account',(_req,res)=>res.json({private:true}));
  const server=app.listen(0), base=`http://127.0.0.1:${server.address().port}`;
  try {await callback({cache,base,calls:()=>calls,release:()=>release?.()});}
  finally {await new Promise(resolve=>server.close(resolve));}
}

test('public cache coalesces work, isolates filters/locales, expires and never caches private or failed responses', async () => {
  let clock=0;
  await withCacheServer(async({cache,base,calls,release})=>{
    const first=fetch(base+'/catalog?wait=1');
    while(!calls()) await flush();
    const second=fetch(base+'/catalog?wait=1');
    while(!cache.summary().coalesced) await flush();
    release();
    const [a,b]=await Promise.all([first,second]);
    assert.deepEqual(await a.json(),await b.json()); assert.equal(calls(),1);
    const hit=await fetch(base+'/catalog?wait=1');
    assert.equal(hit.headers.get('x-catalog-cache'),'HIT');
    await fetch(base+'/catalog?locale=zh'); await fetch(base+'/catalog?locale=en&topic=mcp');
    assert.equal(calls(),3);
    clock=100;
    await fetch(base+'/catalog?locale=zh'); assert.equal(calls(),4);
    for(let i=0;i<2;i++) {const error=await fetch(base+'/failure');assert.equal(error.headers.get('cache-control'),'no-store');}
    assert.equal(calls(),6);
    const privateResponse=await fetch(base+'/account');
    assert.equal(privateResponse.headers.get('cache-control'),'no-store');
    assert.equal(privateResponse.headers.get('x-catalog-cache'),null);
  },{ttl:100,now:()=>clock});
});

test('public cache limits memory and invalidation prevents stale in-flight data from being retained', async () => {
  await withCacheServer(async({cache,base,calls,release})=>{
    await fetch(base+'/catalog?a=1'); await fetch(base+'/catalog?a=2'); await fetch(base+'/catalog?a=3');
    assert.equal(cache.summary().entries,2);
    const pending=fetch(base+'/catalog?wait=1'); while(calls()<4) await flush();
    cache.clear();release();await pending;
    assert.equal(cache.summary().entries,0);
    assert.equal(cache.summary().bytes,0);
  },{maxEntries:2});
});
