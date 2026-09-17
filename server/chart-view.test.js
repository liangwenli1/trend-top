import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogQuery} from '../shared/catalog-query.js';
import {knownCount,elapsedDays,scatterSamples,starTiles,dayBuckets} from '../shared/chart-view.js';

test('row tags refine one filter while preserving the combined ranking view',()=>{
 const current={board:'rising',period:'month',language:'Rust',topic:'mcp',useCase:'data-processing',age:'90',q:'A & B',official:'1'};
 const changed=new URLSearchParams(catalogQuery(current,{topic:'database'}));
 assert.deepEqual(Object.fromEntries(changed),{...current,topic:'database'});
 const language=new URLSearchParams(catalogQuery(current,{language:'Python'}));
 assert.equal(language.get('topic'),'mcp'); assert.equal(language.get('useCase'),'data-processing');
 const cleared=new URLSearchParams(catalogQuery(current,{topic:''}));
 assert.equal(cleared.has('topic'),false); assert.equal(cleared.get('language'),'Rust');
});
test('missing metrics never become a measured zero',()=>{
 for(const value of [null,undefined,'', ' ',NaN,Infinity,-1,false,{}]) assert.equal(knownCount(value),null);
 assert.equal(knownCount(0),0); assert.equal(knownCount('12'),12);
 const items=[{full_name:'zero',stars:0,forks:0},{full_name:'missing',stars:null,forks:100},{full_name:'known',stars:20,forks:'4'}];
 assert.deepEqual(scatterSamples(items).map(x=>x.full_name),['zero','known']);
 assert.deepEqual(starTiles(items).map(x=>[x.name,x.size]),[['known',20]]);
 assert.deepEqual(starTiles([{stars:0},{stars:null}]),[]);
});
test('unknown dates stay separate from newest items in chart buckets',()=>{
 const rows=dayBuckets([{ageDays:null},{},{ageDays:0},{ageDays:30},{ageDays:31},{ageDays:120}], 'ageDays',[30,90],['New','Recent','Old'],'Unknown');
 assert.deepEqual(rows,[{name:'New',count:2},{name:'Recent',count:1},{name:'Old',count:1},{name:'Unknown',count:2}]);
 assert.equal(elapsedDays(null,'2026-09-17'),null); assert.equal(elapsedDays('invalid','2026-09-17'),null);
 assert.equal(elapsedDays('2026-09-17','2026-09-17'),0); assert.equal(elapsedDays('2026-09-16','2026-09-17'),1);
});
