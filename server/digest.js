import { emailBrandHeader, wrapEmailHtml } from './email-brand.js';
import { asJson } from './db.js';
import { TYPES, TYPE_META, ASSET_BOARDS, getCatalogRankings } from './catalog.js';
import { boards as REPO_BOARDS } from './rankings.js';
import { validGrowth, growthLabel, renderGrowthChart } from './digest-growth.js';
import { savedWatches } from './watches.js';
import { listSavedSearches } from './saved-searches.js';
import { productKey } from '../shared/product-resources.js';
import { freezeTrendImage } from './digest-snapshots.js';

const root = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const title = (board, type, locale) => type === 'github-repo'
  ? REPO_BOARDS[board]?.[locale] || board
  : ASSET_BOARDS[board]?.[locale] || board;
const itemUrl = (item, type, locale) => `${root}/${locale}/${type}/${encodeURIComponent(item.slug || item.id)}`;
const itemKey = item => String(item.full_name || item.id);

// Rank movement versus the last sent digest: 'new' entered the list, n>0 moved up, n<0 moved down, 0 unchanged, null = no history.
function rankChange(item, previousKeys) {
  if (!Array.isArray(previousKeys)) return null;
  const index = previousKeys.indexOf(itemKey(item));
  if (index === -1) return 'new';
  return index + 1 - item.rank;
}
function changeHtml(change, zh) {
  if (change == null) return '';
  if (change === 'new') return `<span style="display:inline-block;margin-left:6px;padding:1px 5px;background:#111;color:#fff;font-size:10px;font-weight:700;letter-spacing:.5px;vertical-align:middle">${zh ? '新上榜' : 'NEW'}</span>`;
  if (change > 0) return `<span style="margin-left:6px;color:#315fd9;font-size:12px;font-weight:700">&#9650;${change}</span>`;
  if (change < 0) return `<span style="margin-left:6px;color:#a53e3e;font-size:12px;font-weight:700">&#9660;${-change}</span>`;
  return `<span style="margin-left:6px;color:#9a9a9a;font-size:12px">&#8212;</span>`;
}
function changeText(change, zh) {
  if (change == null) return '';
  if (change === 'new') return zh ? ' · 新上榜' : ' · new';
  if (change > 0) return ` · ▲${change}`;
  if (change < 0) return ` · ▼${-change}`;
  return '';
}

export async function buildDigest(sub, manageToken, { previous = null } = {}) {
  const locale = sub.locale === 'zh' ? 'zh' : 'en';
  const zh = locale === 'zh';
  const num = new Intl.NumberFormat(zh ? 'zh-CN' : 'en-US');
  const savedTypes = asJson(sub.types, ['github-repo']);
  const types = [...new Set(Array.isArray(savedTypes) ? savedTypes : ['github-repo'])].filter(type => TYPES.includes(type));
  const boards = asJson(sub.boards, ['hot']);
  const topics = asJson(sub.topics, sub.topic ? [sub.topic] : []);
  const languages = asJson(sub.languages, sub.language ? [sub.language] : []);
  const queryBase = { period: 'day', language: languages.join(','), languages, topic: topics.join(','), topics, limit: 10 };
  const sections = [];
  const snapshot = {};
  const seenProducts = new Set();
  let remaining = 12;
  const lookup = new Map();
  const rankingFor = (type,filters) => {
    const key=JSON.stringify([type,filters]);
    if(!lookup.has(key)) lookup.set(key,getCatalogRankings(type,filters));
    return lookup.get(key);
  };
  const uniqueItems = (items,max) => items.filter(item=>{
    const key=productKey(item);
    if(!remaining || seenProducts.has(key) || max<=0)return false;
    seenProducts.add(key);remaining--;max--;return true;
  });
  const addSection = async (type,board,ranking,items,name,reason,chart=false,filters=queryBase) => {
    if(!items.length)return;
    const leader=chart?items.find(validGrowth):null;
    const image=leader?await freezeTrendImage(leader,type,ranking.updatedAt,root):null;
    sections.push({type,board,chart,updatedAt:ranking.updatedAt,typeName:TYPE_META[type]?.[locale] || type,name,reason,filters,
      items:items.map(item=>({...item,url:itemUrl(item,type,locale)})),
      trend:image?{name:leader.full_name,url:itemUrl(leader,type,locale),image}:null});
  };
  if(sub.user_id){
    const watches=(await savedWatches(sub.user_id)).items;
    for(const type of [...new Set(watches.map(item=>item.type))]){
      const ranking=await getCatalogRankings(type,{board:'stars',period:'day'}, {all:true});
      const ids=new Set(watches.filter(item=>item.type===type).map(item=>String(item.id)));
      const watched=uniqueItems(ranking.items.filter(item=>ids.has(String(item.slug || item.id))),5);
      await addSection(type,'stars',ranking,watched,zh?'你关注的项目':'Your watched projects',zh?'因为你关注了这些项目。':'Because you watch these projects.');
    }
    for(const search of (await listSavedSearches(sub.user_id)).filter(item=>item.notify)){
      const {type,...filters}=search.filters, ranking=await rankingFor(type,{...filters,limit:50}),key=`saved:${search.id}`;
      const fingerprint=JSON.stringify([filters,search.rule,search.threshold]), filterKey=key+':filters';
      const current=ranking.items.map(itemKey),before=previous?.[filterKey]===fingerprint?previous?.[key]:null;
      snapshot[key]=current;snapshot[filterKey]=fingerprint;
      const growthKey=key+':growth', oldGrowth=previous?.[growthKey] || {};
      snapshot[growthKey]=Object.fromEntries(ranking.items.filter(validGrowth).map(item=>[itemKey(item),item.gain]));
      // First delivery establishes a baseline, without pretending existing results are new.
      const matched=Array.isArray(before)?ranking.items.filter(item=>search.rule==='growth-threshold'?validGrowth(item)&&item.gain>=search.threshold&&(!(itemKey(item) in oldGrowth)||oldGrowth[itemKey(item)]<search.threshold):!before.includes(itemKey(item))):[];
      const items=uniqueItems(matched,3);
      await addSection(type,filters.board,ranking,items,search.name,
        search.rule==='growth-threshold'?(zh?`保存的筛选：${filters.period} 窗口新增 Star ≥ ${search.threshold}`:`Saved filter: new stars ≥ ${search.threshold} in the ${filters.period} window`):(zh?'自上次摘要检查后首次出现在这组筛选结果中。':'Entered these saved search results since your last digest check.'),false,filters);
    }
  }
  const selectedTypes=types.length?types:['github-repo'];
  const quota=Math.max(1,Math.floor(remaining/selectedTypes.length));
  for (const type of selectedTypes) {
    let first = true,typeRemaining=quota;
    for (const board of boards) {
      if (type === 'github-repo' ? !REPO_BOARDS[board] : !ASSET_BOARDS[board]) continue;
      const ranking = await rankingFor(type,{ ...queryBase, board });
      if (!ranking.updatedAt || !ranking.items?.length) continue;
      const key = `${type}:${board}`;
      const previousKeys = previous && Array.isArray(previous[key]) ? previous[key] : null;
      snapshot[key] = ranking.items.map(itemKey);
      const sorted=[...ranking.items].sort((a,b)=>Number(rankChange(b,previousKeys)==='new')-Number(rankChange(a,previousKeys)==='new')||a.rank-b.rank);
      const items = uniqueItems(sorted,Math.min(typeRemaining,first?5:4)).map(item => ({ ...item, change: rankChange(item, previousKeys) }));
      await addSection(type,board,ranking,items,title(board,type,locale),
        (zh?'匹配你选择的类型与榜单':'Matches your selected collection and board')+(languages.length?` · ${languages.join(', ')}`:'')+(topics.length?` · ${topics.join(', ')}`:''),first);
      typeRemaining-=items.length;
      first = false;
    }
  }
  const account = `${root}/${locale}/account/delivery`;
  const unsubscribe = `${account}?intent=stop`;
  const oneClick = `${root}/api/one-click?token=${encodeURIComponent(manageToken)}`;
  const boardLink = section => `${root}/${locale}/${section.type}/ranking?${new URLSearchParams({...Object.fromEntries(Object.entries(section.filters || queryBase).filter(([key,value])=>!['languages','topics','limit'].includes(key)&&value!=null).map(([key,value])=>[key,String(value)])),board:section.board})}`;
  const localTime = at => new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { timeZone: sub.timezone, dateStyle: 'medium' }).format(new Date(at));
  const subject = zh ? 'Trend Top 每日摘要' : 'Trend Top daily digest';
  const intro = zh ? '你关注的开源项目，每日一封。' : 'The open-source projects you follow, once a day.';
  const text = [
    intro, '',
    ...sections.flatMap(section => [
      section.typeName + ' · ' + section.name + ' · ' + localTime(section.updatedAt),
      section.reason,
      ...section.items.map(item => '#' + item.rank + ' ' + item.full_name + ' · ' + growthLabel(item, num, zh) + changeText(item.change, zh) + ' · ' + item.url),
      boardLink(section), ''
    ]),
    zh ? '管理邮件推送：' : 'Manage email delivery:', account,
    zh ? '停止邮件推送：' : 'Stop emails:', unsubscribe
  ].join('\n');
  const htmlSections = sections.map(section => {
    const rows = section.items.map(item => `<p style="margin:8px 0;font-size:14px"><strong>#${item.rank}</strong> <a href="${escape(item.url)}" style="color:#171717">${escape(item.full_name)}</a>${changeHtml(item.change, zh)} <span style="color:#606060">${growthLabel(item, num, zh)}</span></p>`).join('');
    const trend = section.trend
      ? `<p style="margin:16px 0 6px;color:#666;font-size:12px">${zh ? '近 30 天累计新增 Star · ' : 'New stars, last 30 days · '}<a href="${escape(section.trend.url)}" style="color:#171717;font-weight:700">${escape(section.trend.name)}</a></p><a href="${escape(section.trend.url)}" style="display:block"><img src="${escape(section.trend.image)}" width="552" alt="${escape(section.trend.name)} ${zh ? '30 天累计新增 Star 走势' : '30-day cumulative new star trend'}" style="display:block;width:100%;max-width:100%;height:auto;border:1px solid #e5e5e5"></a>`
      : '';
    const periodName=({day:zh?'每日':'Daily',week:zh?'本周':'Weekly',month:zh?'本月':'Monthly'})[section.filters?.period || 'day'];
    const metricTitle = section.type === 'github-repo' ? (zh ? periodName+'新增 Star' : periodName+' new stars') : (zh ? '关联仓库'+periodName+'新增 Star' : periodName+' new stars in the associated repository');
    const hasGrowth = section.items.some(validGrowth);
    const growth = hasGrowth ? `<p style="margin:12px 0 0;color:#666;font-size:12px">${metricTitle}</p>${renderGrowthChart(section.items, num, zh, changeHtml)}` : rows;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="border-top:1px solid #dedede;padding:22px 0 8px"><p style="margin:0 0 5px;color:#315fd9;font-size:12px;font-weight:700;letter-spacing:1px">${escape(section.typeName)}</p><h2 class="email-h2" style="margin:0;font-size:20px">${escape(section.name)}</h2><p style="margin:5px 0 12px;color:#666;font-size:12px">${escape(localTime(section.updatedAt))} · ${escape(sub.timezone)}${(process.env.DATA_MODE || 'demo') === 'demo' ? ' · DEMO DATA' : ''}</p><p style="font-size:12px;color:#666">${escape(section.reason)}</p>${growth}${trend}<a href="${escape(boardLink(section))}" style="display:inline-block;margin-top:10px;color:#315fd9;font-weight:700">${zh ? '查看完整榜单' : 'View full ranking'} →</a></td></tr></table>`;
  }).join('');
  const html = wrapEmailHtml(`${emailBrandHeader(root, locale)}<p>${escape(intro)}</p>${htmlSections}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #dedede;padding-top:20px;font-size:13px"><a href="${escape(account)}">${zh ? '管理邮件推送' : 'Manage email delivery'}</a> · <a href="${escape(unsubscribe)}">${zh ? '停止邮件推送' : 'Stop emails'}</a></td></tr></table>`, { locale, preheader: intro });
  return { schemaVersion:1, templateVersion:'2026-09-18.1', generatedAt:new Date().toISOString(), preferences:{types,boards,languages,topics,timezone:sub.timezone}, subject, text, html, sections, snapshot, unsubscribe, oneClick };
}
