import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
delete process.env.DATABASE_URL;
process.env.DATA_MODE='demo';
process.env.PGLITE_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'trend-resources-'));
const {ready,query,one}=await import('./db.js');
await ready;
const {acceptsRepoType,skillResources,auditCopiedAssets}=await import('./asset-classification.js');
const {upsertAsset,collectTypedAssets}=await import('./jobs.js');
const {getCatalogItem,getSimilar,clearRelatedCache}=await import('./catalog.js');
const {groupProductResources}=await import('../shared/product-resources.js');
const {rankRelated}=await import('../shared/related-projects.js');
const {digestEntryPath,digestDestination,loginUrl}=await import('../shared/account-paths.js');

test('email entry preserves its intent without changing ordinary login',()=>{
  const entry=digestEntryPath('zh','skill','rising');
  assert.equal(new URL(loginUrl('zh',entry),'https://local.invalid').searchParams.get('next'),entry);
  assert.equal(digestDestination('zh',false,'?type=skill&board=rising'),'/zh/pricing?type=skill&board=rising');
  assert.equal(digestDestination('zh',true,'?type=skill&board=rising'),'/zh/account/delivery?type=skill&board=rising');
  assert.equal(new URL(loginUrl('en'),'https://local.invalid').searchParams.get('next'),'/en/account');
});
test('README keywords do not turn main APIs or frameworks into agents or skills',()=>{
  const fire={full_name:'firecrawl/firecrawl',description:'The context API to search, scrape, and interact with the web at scale.',topics:['agents','skills','ai'],homepage:'https://firecrawl.dev'};
  assert.equal(acceptsRepoType('agent',fire),false);
  assert.equal(acceptsRepoType('skill',fire),false);
  assert.equal(acceptsRepoType('website',fire),true);
  assert.equal(acceptsRepoType('agent',{full_name:'microsoft/playwright',description:'Playwright is a framework for Web Testing and Automation.'}),false);
  assert.equal(acceptsRepoType('plugin',{full_name:'firecrawl/firecrawl-mcp-server'}),true);
  assert.equal(acceptsRepoType('agent',{full_name:'someone/research',description:'An autonomous research agent.'}),true);
  const skills=skillResources(fire,[{type:'blob',path:'skills/scrape/SKILL.md'},{type:'blob',path:'examples/dummy/SKILL.md'},{type:'blob',path:'.claude/skills/dev/SKILL.md'}]);
  assert.equal(skills.length,1);assert.equal(skills[0].name,'scrape');assert.match(skills[0].url,/skills\/scrape\/SKILL.md$/);
});
test('All search groups resources by their exact product, not their organization',()=>{
  const items=[{type:'skill',id:'skill',full_name:'firecrawl / scrape',sourceRepoUrl:'https://github.com/firecrawl/firecrawl'},
    {type:'website',id:'web',url:'https://firecrawl.dev',sourceRepoUrl:'https://github.com/firecrawl/firecrawl'},
    {type:'github-repo',id:1,full_name:'firecrawl/firecrawl',url:'https://github.com/firecrawl/firecrawl'},
    {type:'plugin',id:'mcp',url:'https://github.com/firecrawl/firecrawl-mcp-server'}];
  const groups=groupProductResources([...items,items[0]]);
  assert.equal(groups.length,2);assert.equal(groups[0].type,'github-repo');assert.equal(groups[0].resources.length,3);
});
test('Related projects require specific overlap and remove the same product',()=>{
  const base={type:'website',id:'base',topics:['ai'],url:'https://base.dev'};
  assert.deepEqual(rankRelated(base,[{...base,id:'other',url:'https://other.dev'}]),[]);
  const scraper={...base,description:'A web scraping tool'};
  const other={...base,id:'other',description:'A web crawler',url:'https://other.dev'};
  const related=rankRelated(scraper,[other,{...other,id:'duplicate'},{...scraper,id:'copy'}]);
  assert.equal(related.length,1);assert.equal(related[0].url,other.url);
});
test('Skill assets have their own file identity; mistaken copies retire reversibly',async()=>{
  const repo={id:123,full_name:'qa/main-api',description:'API for AI agents.',homepage:'https://qa-api.dev',topics:['ai'],created_at:new Date().toISOString(),pushed_at:new Date().toISOString()};
  const resource=skillResources(repo,[{type:'blob',path:'skills/scrape/SKILL.md'}])[0];
  const child=await upsertAsset('skill',repo,'asset:skill:test',undefined,resource);
  assert.match((await one('SELECT url FROM assets WHERE id=$1',[child])).url,/SKILL.md$/);
  const copy=await upsertAsset('agent',repo,'asset:agent:test');
  await query("UPDATE assets SET ranking_signals='{}'::jsonb WHERE id=$1",[copy]);
  await query("INSERT INTO asset_daily(asset_id,day,star_created,stars) VALUES($1,CURRENT_DATE,0,10)",[copy]);
  assert.equal((await auditCopiedAssets()).retired,1);
  assert.equal((await one('SELECT active FROM assets WHERE id=$1',[copy])).active,false);
  assert.ok(await one('SELECT * FROM asset_daily WHERE asset_id=$1',[copy]));
  assert.equal((await one('SELECT active FROM assets WHERE id=$1',[child])).active,true);
  assert.equal((await auditCopiedAssets()).retired,0);
});
test('Collector verifies discovery hits and creates separate Skill file resources',async()=>{
  const timestamp=new Date().toISOString();
  const fire={id:901,full_name:'collector/firecrawl',description:'Context API to scrape the web.',homepage:'https://collector-fire.dev',topics:['ai','agents','skills'],created_at:timestamp,pushed_at:timestamp};
  const plugin={...fire,id:902,full_name:'collector/firecrawl-mcp-server',description:'Official Firecrawl MCP Server',homepage:null};
  const agent={...fire,id:903,full_name:'collector/research-agent',description:'An autonomous research agent.',homepage:null};
  const calls=[];
  const fetchGithub=async url=>{
    calls.push(url);
    if(url.includes('/git/trees/'))return {tree:url.includes('/collector/firecrawl/')?[{type:'blob',path:'skills/scrape/SKILL.md'}]:[]};
    return {items:[fire,plugin,agent]};
  };
  const result=await collectTypedAssets([],1,timestamp,new Map(),fetchGithub,async()=>{});
  assert.deepEqual(result.counts,{skill:1,plugin:1,agent:1,components:0,website:1});
  assert.equal(calls.filter(url=>url.includes('/collector/firecrawl/git/trees/')).length,1);
  const skill=await one("SELECT * FROM assets WHERE type='skill' AND source_repo_url='https://github.com/collector/firecrawl'");
  assert.match(skill.full_name,/scrape$/);assert.match(skill.url,/skills\/scrape\/SKILL.md$/);
  assert.equal(await one("SELECT * FROM assets WHERE id='agent-collector-firecrawl'"),null);
});
test('Detail preview stays bounded while related pages expose all matches',async()=>{
  for(let i=0;i<15;i++)await upsertAsset('website',{id:200+i,full_name:'related/site-'+i,description:'Layout test resource',homepage:'https://site-'+i+'.invalid',topics:['qa-specific-related'],created_at:new Date().toISOString(),pushed_at:new Date().toISOString()},'manual:website');
  clearRelatedCache();
  const detail=await getCatalogItem('website','website-related-site-0');
  assert.equal(detail.similar.length,6);assert.equal(detail.relatedCount,14);
  const first=await getSimilar('website',detail.id,{page:1,limit:12}),second=await getSimilar('website',detail.id,{page:2,limit:12});
  assert.equal(first.items.length,12);assert.equal(second.items.length,2);assert.equal(first.total,14);
  assert.equal(new Set([...first.items,...second.items].map(row=>row.id)).size,14);
});
