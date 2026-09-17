import crypto from 'node:crypto';
import { asJson, many, one, query, transaction } from './db.js';
import { requireUser } from './auth.js';
import { requirePro } from './pro-access.js';
import { normalizeSavedFilters } from '../shared/saved-search-filters.js';
const response=row=>({...row,filters:normalizeSavedFilters(asJson(row.filters,{}))});
export async function listSavedSearches(userId) {
  return (await many('SELECT id,name,filters,notify,rule,threshold,created_at,updated_at FROM saved_searches WHERE user_id=$1 ORDER BY created_at DESC',[userId])).map(response);
}
export async function saveSearch(userId,body,id=null) {
  return transaction(async()=>{
  if(!(await one('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId])))throw Object.assign(new Error('User not found'),{status:404});
  const name=String(body.name || '').trim().slice(0,100),filters=normalizeSavedFilters(body.filters),rule=body.rule==='growth-threshold'?'growth-threshold':'new-entry';
  const threshold=Math.min(1000000,Math.max(1,Math.trunc(Number(body.threshold)||1)));
  if(!name)throw Object.assign(new Error('Name is required'),{status:400});
  if(id){
    const result=await query('UPDATE saved_searches SET name=$1,filters=$2::jsonb,notify=$3,rule=$4,threshold=$5,updated_at=NOW() WHERE id=$6 AND user_id=$7 RETURNING *',[name,JSON.stringify(filters),Boolean(body.notify),rule,threshold,id,userId]);
    if(!result.rows.length)throw Object.assign(new Error('Saved search not found'),{status:404});
    return response(result.rows[0]);
  }
  const count=await one('SELECT COUNT(*)::int AS n FROM saved_searches WHERE user_id=$1',[userId]);
  if(count.n>=20)throw Object.assign(new Error('You can save up to 20 searches'),{status:400});
  const result=await query('INSERT INTO saved_searches (id,user_id,name,filters,notify,rule,threshold,created_at,updated_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,NOW(),NOW()) RETURNING *',[crypto.randomUUID(),userId,name,JSON.stringify(filters),Boolean(body.notify),rule,threshold]);
  return response(result.rows[0]);
  });
}
export function registerSavedSearchRoutes(app){
  app.get('/api/saved-searches',requireUser,async(req,res)=>res.json({items:await listSavedSearches(req.user.id)}));
  app.post('/api/saved-searches',requireUser,requirePro,async(req,res)=>{try{res.status(201).json({item:await saveSearch(req.user.id,req.body || {})})}catch(error){res.status(error.status || 500).json({error:error.message})}});
  app.put('/api/saved-searches/:id',requireUser,requirePro,async(req,res)=>{try{res.json({item:await saveSearch(req.user.id,req.body || {},req.params.id)})}catch(error){res.status(error.status || 500).json({error:error.message})}});
  app.delete('/api/saved-searches/:id',requireUser,async(req,res)=>{await query('DELETE FROM saved_searches WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);res.json({ok:true})});
  app.get('/api/delivery-history',requireUser,async(req,res)=>res.json({items:await many(`SELECT d.id,d.local_date,d.status,d.attempts,d.sent_at,d.accepted_at
    FROM deliveries d JOIN subscriptions s ON s.id=d.subscription_id WHERE s.user_id=$1 ORDER BY d.id DESC LIMIT 30`,[req.user.id]),
    statusMeaning:'sent means accepted by the mail provider; inbox delivery is not confirmed'}));
  app.post('/api/feedback',requireUser,async(req,res)=>{
    const rating=String(req.body?.rating || ''),deliveryId=Number(req.body?.deliveryId)||null;
    if(!['useful','not-relevant','unreliable'].includes(rating))return res.status(400).json({error:'Invalid rating'});
    if(deliveryId&&!(await one('SELECT d.id FROM deliveries d JOIN subscriptions s ON s.id=d.subscription_id WHERE d.id=$1 AND s.user_id=$2',[deliveryId,req.user.id])))return res.status(404).json({error:'Delivery not found'});
    const recent=await one("SELECT COUNT(*)::int AS n FROM user_feedback WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 day'",[req.user.id]);
    if(recent.n>=30)return res.status(429).json({error:'Feedback limit reached for today'});
    await query('INSERT INTO user_feedback (user_id,delivery_id,rating,notes) VALUES ($1,$2,$3,$4)',[req.user.id,deliveryId,rating,String(req.body?.notes || '').trim().slice(0,1000)]);res.status(201).json({ok:true});
  });
}
