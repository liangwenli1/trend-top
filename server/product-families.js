import { asJson, dataSource, many, query, transaction } from './db.js';
import { repoIdentity } from '../shared/data-sources.js';
import { productKey } from '../shared/product-resources.js';
import { publishCatalog } from './operations.js';
import { publicResponseCache } from './catalog-cache.js';

let relations = new Map(), loadedAt = 0;
export async function loadProductFamilies() {
  if (Date.now() - loadedAt < 5000) return;
  relations = new Map((await many('SELECT * FROM product_relationships')).map(row => [row.repository, row.family_repository]));
  loadedAt = Date.now();
}
export function attachProductFamily(item) {
  const key = productKey({...item,productFamily:undefined}), repository = key.startsWith('repo:') ? key.slice(5) : '';
  return { ...item, productFamily: relations.has(repository) ? `repo:${relations.get(repository)}` : key };
}
export async function saveProductRelationship(body, reviewer) {
  await transaction(async()=>{
  await query('LOCK TABLE product_relationships IN EXCLUSIVE MODE');
  const repository = repoIdentity(body.repository), family = repoIdentity(body.familyRepository);
  const evidence = String(body.evidence || '').trim().slice(0,2000);
  if (!repository || !family || !evidence) throw Object.assign(new Error('Repository, family repository, and relationship evidence are required'), { status:400 });
  const current=new Map((await many('SELECT repository,family_repository FROM product_relationships')).map(row=>[row.repository,row.family_repository]));
  // Only one-level reviewed edges; chains and cycles create inconsistent identities.
  if (repository===family || current.has(family) || [...current.values()].includes(repository)) throw Object.assign(new Error('Use the canonical family repository; chained relationships are not supported'), { status:400 });
  await query(`INSERT INTO product_relationships (repository,family_repository,evidence,reviewed_by)
    VALUES ($1,$2,$3,$4) ON CONFLICT (repository) DO UPDATE SET family_repository=EXCLUDED.family_repository,
    evidence=EXCLUDED.evidence,reviewed_by=EXCLUDED.reviewed_by,updated_at=NOW()`, [repository,family,evidence,reviewer]);
  });
  loadedAt=0;await loadProductFamilies();publicResponseCache.clear();await publishCatalog(null,'family-reviewed');
}
export async function familyResources(item) {
  await loadProductFamilies();
  const key=productKey(attachProductFamily(item));
  // Restrict queries to this family rather than reading the entire catalog on every detail.
  if(!key.startsWith('repo:'))return [];
  const root=key.slice(5), names=[root,...[...relations].filter(([,parent])=>parent===root).map(([name])=>name)];
  const urls=names.map(name=>'https://github.com/'+name);
  const [repositories,assets]=await Promise.all([
    many('SELECT id,full_name FROM repos WHERE source=$2 AND lower(full_name)=ANY($1::text[]) AND active=TRUE AND deleted=FALSE AND archived=FALSE',[names,dataSource()]),
    many(`SELECT id,type,slug,full_name,url,source_repo_url,ranking_signals FROM assets WHERE active=TRUE AND
      (lower(entity_key)=ANY($1::text[]) OR lower(rtrim(source_repo_url,'/'))=ANY($2::text[]) OR lower(rtrim(url,'/'))=ANY($2::text[]) OR lower(split_part(full_name,' / ',1))=ANY($3::text[])) LIMIT 100`,[names.map(name=>'repo:'+name),urls,names])
  ]);
  return [...repositories.map(row=>({...row,type:'github-repo'})),...assets].map(row=>({type:row.type,id:String(row.id),slug:row.slug,full_name:row.full_name})).slice(0,100);
}

export async function removeProductRelationship(repository, evidence, reviewer) {
  const identity=repoIdentity(repository);
  if(!identity || !String(evidence || '').trim())throw Object.assign(new Error('Repository and removal evidence required'),{status:400});
  await transaction(async()=>{
    await query('DELETE FROM product_relationships WHERE repository=$1',[identity]);
    await query('INSERT INTO catalog_reviews (item_type,item_id,action,evidence,reviewed_by) VALUES ($1,$2,$3,$4,$5)',['family',identity,'unlink',String(evidence).slice(0,2000),reviewer]);
  });
  loadedAt=0;await loadProductFamilies();publicResponseCache.clear();await publishCatalog(null,'family-reviewed');
}
