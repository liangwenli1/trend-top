import { many, query, asJson } from './db.js';

const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const safeHomepage = value => { try { const url=new URL(value);return ['http:','https:'].includes(url.protocol) && !['github.com','localhost','127.0.0.1'].includes(url.hostname); }catch{return false;} };

// Topics and README search hits are candidate discovery, never proof of resource type.
export function primaryRepoType(repo) {
  const name=String(repo.full_name || ''), description=String(repo.description || '');
  if (/\bmcp[- ]server\b|model context protocol server|\bplugin (for|to)\b/i.test(description) || /(?:^|[-/])mcp(?:-server)?$/i.test(name)) return 'plugin';
  if (/\b(component library|ui library|ui components|design system)\b/i.test(description)) return 'components';
  if (/\b(?:autonomous|coding|research|browser|personal|ai)[- ]agent\b|\bagent (that|which)\b/i.test(description) && !/\b(api|sdk|framework|library|platform|tools? for|for (ai |your )?agents)\b/i.test(description)) return 'agent';
  if (/\b(skills? (collection|library|pack|for)|claude skills?)\b/i.test(description) && /(?:^|[-/])skills?(?:[-/]|$)/i.test(name)) return 'skill';
  return null;
}

export function skillResources(repo, tree = []) {
  const paths=tree.filter(entry=>entry.type==='blob' && /(?:^|\/)SKILL\.md$/i.test(entry.path) && !/^(?:\.github|\.claude|\.codex|test|tests|examples|docs|node_modules)\//i.test(entry.path));
  return paths.slice(0,40).map(entry=>({ path:entry.path, name:entry.path==='SKILL.md'?(repo.name || repo.full_name.split('/')[1]):entry.path.split('/').slice(-2,-1)[0],
    url:`https://github.com/${repo.full_name}/blob/${encodeURIComponent(repo.default_branch || 'main')}/${entry.path.split('/').map(encodeURIComponent).join('/')}` }));
}

export function acceptsRepoType(type, repo) {
  if(type==='website')return safeHomepage(repo.homepage);
  return primaryRepoType(repo)===type;
}

// Reversible retirement of copied main-repository assets; independent/manual resources stay intact.
export async function auditCopiedAssets() {
  const rows=await many("SELECT id,type,full_name,description,url,website_url,source_query,install,ranking_signals FROM assets WHERE active=TRUE AND full_name LIKE '%/%'");
  let retired=0;
  for(const row of rows){
    if(row.id!==`${row.type}-${slug(row.full_name)}` || row.source_query?.startsWith('manual:') || row.source_query?.startsWith('website-source:') || row.install)continue;
    const signals=asJson(row.ranking_signals,{});
    if(signals.resourcePath || signals.typeVerified)continue;
    const allowed=row.type==='skill'?false:acceptsRepoType(row.type,{...row,homepage:row.website_url});
    if(allowed)continue;
    await query("UPDATE assets SET active=FALSE,ranking_signals=$1::jsonb WHERE id=$2",[JSON.stringify({...signals,classificationAudit:'retired-unverified-repository-copy',classificationAuditAt:new Date().toISOString()}),row.id]);
    retired++;
  }
  return { retired };
}
