import crypto from 'node:crypto';
import { asDay, asNumber, dataSource, lastCompleteDay, many, one } from './db.js';
import { query } from './db.js';
import { getStarSeries } from './rankings.js';
import { renderGainChart } from './png-chart.js';

export async function freezeTrendImage(item,type,sampledAt,root,{requireComplete=false,inline=false}={}){
  const end=dataSource()==='demo'?new Date(sampledAt):lastCompleteDay(new Date(sampledAt));
  const start=new Date(end.getTime()-29*86400000);
  let counts;
  if(type==='github-repo'&&dataSource()!=='demo'){
    counts=(await getStarSeries(item.id,end,30,item.created_at)).points.map(point=>point.count);
  }else{
    const rows=type==='github-repo'?await many('SELECT day,star_created FROM daily_metrics WHERE repo_id=$1 AND source=$4 AND day BETWEEN $2::date AND $3::date',[item.id,asDay(start),asDay(end),dataSource()]):await many('SELECT day,star_created FROM asset_daily WHERE asset_id=$1 AND day BETWEEN $2::date AND $3::date',[item.id,asDay(start),asDay(end)]);
    const byDay=new Map(rows.map(row=>[asDay(row.day),asNumber(row.star_created)]));
    counts=Array.from({length:30},(_,i)=>byDay.get(asDay(new Date(start.getTime()+i*86400000)))??null);
  }
  if(requireComplete && (counts.length!==30 || counts.some(count=>count==null || !Number.isFinite(count) || count<0)))return null;
  const png=renderGainChart(counts,{width:1088,height:326,xStart:asDay(start).slice(5),xEnd:asDay(end).slice(5)});
  if(!png)return null;
  if(inline)return `data:image/png;base64,${png.toString('base64')}`;
  const hash=crypto.createHash('sha256').update(png).digest('hex');
  await query('INSERT INTO digest_images (hash,png_base64) VALUES ($1,$2) ON CONFLICT (hash) DO UPDATE SET last_used_at=NOW()',[hash,png.toString('base64')]);
  return `${root}/api/digest-images/${hash}.png`;
}
export function registerDigestImageRoutes(app){
  app.get('/api/digest-images/:hash.png',async(req,res)=>{
    if(!/^[a-f0-9]{64}$/.test(req.params.hash))return res.status(404).end();
    const image=await one('SELECT png_base64 FROM digest_images WHERE hash=$1',[req.params.hash]);
    if(!image)return res.status(404).end();
    res.set('Cache-Control','public, max-age=31536000, immutable').type('image/png').send(Buffer.from(image.png_base64,'base64'));
  });
}
