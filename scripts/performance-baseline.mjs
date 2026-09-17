import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const types=['skill','plugin','agent','components','website','github-repo'];
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]*10)/10};
export async function measurePublicApi({base,repeat=3,phase='unspecified',baseline=null}) {
  const root=new URL(base);
  if(!['http:','https:'].includes(root.protocol)||root.username||root.password)throw new Error('Use an HTTP base without credentials');
  repeat=Math.max(1,Math.min(20,Math.trunc(Number(repeat)||3)));
  const paths=['/api/types','/api/search?q=fire','/api/billing/plans?locale=en',
    ...types.flatMap(type=>[`/api/${type}/rankings?period=week&limit=10`,`/api/${type}/filters`,`/api/${type}/charts?period=week`])];
  const samples=[];
  for(const path of paths){
    for(let i=0;i<repeat;i++){
      const start=performance.now();
      try{
        const response=await fetch(new URL(path,root),{signal:AbortSignal.timeout(30000),redirect:'error'});
        const body=await response.arrayBuffer();
        samples.push({path,attempt:i+1,status:response.status,ms:Math.round((performance.now()-start)*10)/10,bytes:body.byteLength,cache:response.headers.get('X-Catalog-Cache')||'unreported',revision:response.headers.get('X-Catalog-Version')});
      }catch(error){samples.push({path,attempt:i+1,status:0,ms:Math.round(performance.now()-start),bytes:0,cache:'unreported',error:error.name})}
    }
  }
  const groups=[];
  for(const path of paths){for(const cache of new Set(samples.filter(row=>row.path===path).map(row=>row.cache))){
    const rows=samples.filter(row=>row.path===path&&row.cache===cache),previous=baseline?.groups?.find(row=>row.path===path&&row.cache===cache);
    groups.push({path,cache,requests:rows.length,p50Ms:percentile(rows.map(row=>row.ms),.5),p95Ms:percentile(rows.map(row=>row.ms),.95),maxBytes:Math.max(...rows.map(row=>row.bytes)),errors:rows.filter(row=>row.status<200||row.status>=400).length,previousP95Ms:previous?.p95Ms??null});
  }}
  return {generatedAt:new Date().toISOString(),base:root.origin,phase,repeat,notes:'Public API only. MISS/HIT are server-cache states, not proof of a cold database. Phase is an operator label; this does not prove a collection task was running. Small samples are diagnostic, not a production SLO.',groups,samples};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2),arg=(key,fallback)=>{const at=args.indexOf(key);return at<0?fallback:args[at+1]};
  const output=arg('--output','performance-baseline.json'),previous=arg('--baseline',null);
  const report=await measurePublicApi({base:arg('--base','http://127.0.0.1:3001'),repeat:arg('--repeat',3),phase:arg('--phase','unspecified'),baseline:previous?JSON.parse(fs.readFileSync(previous,'utf8')):null});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(`Saved ${report.samples.length} public API samples to ${output}`);
  if(report.groups.some(row=>row.errors))process.exitCode=1;
}
