import { SiteSettingsProvider, useSiteSettings, SupportEmail, SupportContact } from './site-contact.jsx';
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SearchInput,DesignSelect,TopicMultiSelect,TopicDialog} from './components.jsx';
import {AccountPage,LoginPage,DigestEntryPage,useProStatus,AuthContext,AUTH_CHANGED_EVENT,announceAuthChange} from './subscription.jsx';
import { pricingCache } from './pricing-data.js';
import { SaveSearchButton } from './saved-searches.jsx';
import { ComponentGrid } from './resource-guide.jsx';
import {normalizeUseCase} from '../shared/taxonomy.js';
import {catalogQuery} from '../shared/catalog-query.js';
import {loginUrl,digestEntryPath} from '../shared/account-paths.js';
import {TYPES, boardNames, typeLabel, typePath, itemPath} from './catalog.js';
import {ViewBar, TypeHome, TypeTrending, CategoryPage, ComparePage, SearchPage, ItemDetail, RelatedPage, HeaderSearch, TagActions} from './pages.jsx';
import {PricingPage,BillingResultPage,LegalPage} from './billing-ui.jsx';
const AdminPage=React.lazy(()=>import('./admin-page.jsx').then(m=>({default:m.AdminPage})));
import './style.css';
import './ollama.css';
import './home.css';
import './compare.css';
import './subscribe.css';
import './square-controls.css';
const TrendPanel=React.lazy(()=>import('./trend-panel.jsx').then(m=>({default:m.TrendPanel})));
const AnalyticsPage=React.lazy(()=>import('./analytics-page.jsx').then(m=>({default:m.AnalyticsPage})));

const names={hot:['近期热门','Trending now'],rising:['升星最快','Fastest rising'],new:['新秀项目','Newcomers'],ai:['AI 热门','AI & agents'],topics:['语言 / 主题','Language & topics'],stars:['总星数','All-time stars'],forks:['Fork 最多','Most forked']};
const descriptions={hot:['近期增长与活跃度的综合信号','Recent growth and activity, combined'],rising:['所选周期新增 Star','New stars in the selected period'],new:['近 90 天创建，至少 20 Star','Created in 90 days, at least 20 stars'],ai:['公开主题匹配 AI，再按热度排序','AI topics first, then hot score'],topics:['按语言与主题发现项目','Discover by language and topic'],stars:['累计关注度，不代表近期热度','Cumulative interest, not recent momentum'],forks:['累计 Fork 数量','Cumulative fork count'],official:['只看有官方标记的来源，再按热度排序','Official sources only, then ranked by momentum']};
const copy={
  zh:{nav:'开源项目发现',hero:'发现正在增长的开源项目。',sub:'按热度、增长和主题，发现好项目。',demo:'演示数据',live:'GitHub 公开数据',discover:'探索榜单',subscribe:'订阅每日摘要',mailPending:'每日邮件摘要暂未开放',method:'关于榜单',source:'数据来源',updated:'更新于',window:'统计窗口',timezone:'统计时区',coverage:'有效样本覆盖',search:'搜索',searchHint:'名称、简介或主题',board:'排序',period:'时间窗口',day:'日',week:'周',month:'月',language:'编程语言',allLanguages:'全部语言',topic:'主题',allTopics:'全部主题',useCase:'用途',allUseCases:'全部用途',age:'项目年龄',allAges:'不限',new90:'90 天内',new30:'30 天内',rank:'排名',repo:'仓库',stars:'Star 总数',gain:'新增 Star',forks:'Fork 总数',trend:'对比上期',score:'热度分',insufficient:'数据不足',anomaly:'异常增长待核实',details:'项目详情',github:'查看 GitHub',more:'加载更多',empty:'当前筛选下没有项目',loading:'正在加载榜单…',error:'加载失败，请重试。',retry:'重试',how:'如何计算',formula:'热度分按类型与时间窗口计算，筛选只改变显示范围。仓库/Agent/组件看增星与最近推送；目录用量按相同来源、单位和窗口单独比较；数据不足时不制造分数。异常增量不计分。',notice:'增量需有完整的起止快照；缺失时显示数据不足。按 UTC 每日约 02:00 采样，窗口边界容差 6 小时。',noFresh:'采样可能延迟，请查看时间戳。',stale:'数据超过 36 小时未更新',email:'邮箱地址',boards:'关注榜单',send:'发送时间',mailLocale:'邮件语言',sendButton:'发送验证邮件',pending:'验证邮件已发送。请先验证邮箱。',subscribeError:'订阅失败，请检查输入或邮件服务。',selectBoard:'至少选择一个榜单',selectTime:'每日当地时间',manage:'管理订阅',pause:'暂停',resume:'恢复',cancel:'取消订阅',save:'保存设置',verified:'邮箱已验证，订阅已启用。',verifyError:'验证链接无效。',manageError:'管理链接无效。',cancelled:'已取消订阅。',report:'报告 AI 分类错误',reported:'已提交纠错报告',original:'仓库原文简介',sample:'这里展示的是演示数据。',foot:'探索 Skill、插件、Agent、组件、网站与开源仓库。',languageSwitch:'English',theme:'切换明暗主题',list:'返回榜单'},
  en:{nav:'Open-source discovery',hero:'Find what is growing in open source.',sub:'Explore projects by momentum, growth, and topic.',demo:'Demo data',live:'GitHub public data',discover:'Explore rankings',subscribe:'Get the daily digest',mailPending:'Daily email digest is not available yet',method:'About',source:'Data source',updated:'Updated',window:'Window',timezone:'Statistics timezone',coverage:'Valid sample coverage',search:'Search',searchHint:'Name, description, or topic',board:'Sort',period:'Time window',day:'Day',week:'Week',month:'Month',language:'Language',allLanguages:'All languages',topic:'Topic',allTopics:'All topics',useCase:'Use case',allUseCases:'All use cases',age:'Project age',allAges:'Any age',new90:'Within 90 days',new30:'Within 30 days',rank:'Rank',repo:'Repository',stars:'Total stars',gain:'New stars',forks:'Total forks',trend:'Vs previous',score:'Hot score',insufficient:'Insufficient data',anomaly:'Unusual growth under review',details:'Project details',github:'View on GitHub',more:'Load more',empty:'No projects match these filters',loading:'Loading rankings…',error:'Could not load rankings. Try again.',retry:'Retry',how:'How it works',formula:'Hot score is calculated for each type and time window; filters select from that ranking. It uses repository star momentum and recent pushes. Associated resources use their repository signal. Directory counts retain their source, unit, and window, and do not change Hot rankings. Independent sites without repository momentum have no Hot score. Anomalous gains do not score.',notice:'Gains need complete boundary snapshots; missing pairs show insufficient data. Samples run near 02:00 UTC daily, with a 6-hour boundary tolerance.',noFresh:'Sampling may be delayed; check the timestamp.',stale:'Data has not updated for over 36 hours',email:'Email address',boards:'Boards to follow',send:'Send time',mailLocale:'Email language',sendButton:'Send verification email',pending:'Verification email sent. Verify your address to activate.',subscribeError:'Subscription failed. Check the form or mail service.',selectBoard:'Choose at least one board',selectTime:'Local time each day',manage:'Manage subscription',pause:'Pause',resume:'Resume',cancel:'Unsubscribe',save:'Save settings',verified:'Email verified. Your subscription is active.',verifyError:'Invalid verification link.',manageError:'Invalid management link.',cancelled:'Subscription cancelled.',report:'Report AI misclassification',reported:'Correction report submitted',original:'Original repository description',sample:'This page is showing demo data.',foot:'Explore skills, plugins, agents, components, websites, and repositories.',languageSwitch:'简体中文',theme:'Toggle light and dark theme',list:'Back to rankings'}
};
const params=()=>new URLSearchParams(location.search);
const parts=()=>location.pathname.split('/').filter(Boolean);
const lang=()=>parts()[0]==='zh'?'zh':'en';
const localeIndex=l=>l==='zh'?0:1;
function parseRoute(){
  const p=parts();
  if(p[0]==='login')return {l:params().get('locale')==='zh'?'zh':'en',type:null,page:'login',id:''};
  const l=p[0]==='zh'?'zh':'en';
  const seg=p.slice(1);
  const first=seg[0]||'home';
  if(TYPES.includes(first)){
    const type=first, second=seg[1];
    if(!second) return {l,type,page:'trending'};
    if(second==='ranking') return {l,type,page:'ranking'};
    if(second==='charts') return {l,type,page:'charts'};
    if(second==='official') return {l,type,page:'official'};
    if(second==='compare') return {l,type,page:'compare'};
    if(second==='related')return {l,type,page:'related',id:decodeURI(seg.slice(2).join('/'))};
    if(second==='c'&&seg[2]) return {l,type,page:'category',category:seg[2]};
    return {l,type,page:'detail',id:decodeURI(seg.slice(1).join('/'))};
  }
  return {l,type:null,page:first,id:decodeURI(seg.slice(1).join('/')),board:seg[1]};
}
function legacyRedirect(){
  const route=parseRoute();
  const q=location.search.slice(1);
  if(route.type) return false;
  if(route.page==='ranking'||route.page==='charts'||route.page==='official'){history.replaceState({},'',`/${route.l}/github-repo/${route.page}${q?`?${q}`:''}${location.hash}`);return true;}
  if(route.page==='repo'&&route.id){history.replaceState({},'',`/${route.l}/github-repo/${route.id}`);return true;}
  if(route.page==='board'){history.replaceState({},'',`/${route.l}/github-repo/ranking?board=${encodeURIComponent(route.board||'hot')}`);return true;}
  return false;
}
function updatePath(path,query) {
  const next=path+(query?`?${query}`:'');
  if(next===location.pathname+location.search) return;
  history.pushState({},'',next);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}
function api(url,options) {return fetch(url,options).then(async r=>{const j=await r.json();if(!r.ok) throw new Error(j.error||'Request failed');return j;});}
const post=(url,data,method='POST')=>api(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const fmt=(n,l)=>n===null||n===undefined?'—':new Intl.NumberFormat(l==='zh'?'zh-CN':'en-US').format(n);
const fallbackLangs=['TypeScript','Python','Rust','Go','Shell'];
const fallbackTopics=['ai','agents','developer-tools','react','python','llm'];
const COMMON_TIMEZONES=[
  {value:'Asia/Shanghai',zh:'中国标准时间',en:'China Standard Time'},
  {value:'Asia/Tokyo',zh:'日本标准时间',en:'Japan Standard Time'},
  {value:'Asia/Singapore',zh:'新加坡时间',en:'Singapore Time'},
  {value:'Asia/Kolkata',zh:'印度标准时间',en:'India Standard Time'},
  {value:'Europe/London',zh:'英国时间',en:'United Kingdom Time'},
  {value:'Europe/Paris',zh:'中欧时间',en:'Central European Time'},
  {value:'America/New_York',zh:'美国东部时间',en:'Eastern Time (US)'},
  {value:'America/Los_Angeles',zh:'美国太平洋时间',en:'Pacific Time (US)'},
  {value:'Australia/Sydney',zh:'澳大利亚东部时间',en:'Australian Eastern Time'},
  {value:'UTC',zh:'协调世界时',en:'UTC'}
];
const browserTimezone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return 'UTC'}};
const timezoneOptions=(current)=>{
  const value=String(current||'UTC');
  const known=COMMON_TIMEZONES.map(zone=>zone.value);
  const extra=known.includes(value)?[]:[{value,label:value}];
  return [...extra,...COMMON_TIMEZONES.map(zone=>({value:zone.value,label:zone.value}))];
};
const optionList=(values,l)=>values.map(option=>{
  if(typeof option==='string') return {value:option,label:option};
  const value=String(option?.id??option?.value??'');
  return {value,label:option?.[l==='zh'?'zh':'en']??option?.label??value};
}).filter(option=>option.value);
function useFilterOptions(type='github-repo'){
  const [opts,setOpts]=useState({languages:fallbackLangs,topics:fallbackTopics,categories:[],useCases:[]});
  useEffect(()=>{
    fetch(`/api/${type}/filters`).then(r=>r.ok?r.json():null).then(d=>{
      if(!d) return;
      setOpts({
        languages:d.languages?.length?d.languages:fallbackLangs,
        topics:d.topics?.length?d.topics:fallbackTopics,
        categories:d.categories||[],
        useCases:d.useCases||[]
      });
    }).catch(()=>{});
  },[type]);
  return opts;
}
function AccountMenu({viewer,l,page,navigate}){
  const [open,setOpen]=useState(false);
  const rootRef=React.useRef(null);
  const triggerRef=React.useRef(null);
  const panelRef=React.useRef(null);
  const zh=l==='zh';
  useEffect(()=>{
    if(!open)return;
    const close=event=>{if(rootRef.current&&!rootRef.current.contains(event.target))setOpen(false)};
    const key=event=>{if(event.key==='Escape'){setOpen(false);triggerRef.current?.focus()}};
    addEventListener('mousedown',close);addEventListener('keydown',key);
    requestAnimationFrame(()=>panelRef.current?.querySelector('[role="menuitem"]')?.focus());
    return()=>{removeEventListener('mousedown',close);removeEventListener('keydown',key)};
  },[open]);
  useEffect(()=>setOpen(false),[page,l]);
  const go=(event,target)=>{setOpen(false);navigate(event,target)};
  const logout=async()=>{
    setOpen(false);
    try{await post('/api/auth/logout',{});announceAuthChange(null);updatePath(`/${l}/home`)}catch{}
  };
  const moveFocus=event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    const items=[...panelRef.current.querySelectorAll('[role="menuitem"]')];
    const current=items.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(current+1)%items.length:(current-1+items.length)%items.length;
    items[next]?.focus();
  };
  return <div className="account-menu" ref={rootRef}>
    <button ref={triggerRef} type="button" className="account-menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={`${zh?'账户菜单':'Account menu'}: ${viewer.email}`} onClick={()=>setOpen(value=>!value)}><span aria-hidden="true">{viewer.email.slice(0,1).toUpperCase()}</span></button>
    {open&&<div className="account-menu-panel" role="menu" ref={panelRef} onKeyDown={moveFocus}>
      <div className="account-menu-identity"><span>{zh?'已登录':'Signed in'}</span><strong title={viewer.email}>{viewer.email}</strong></div>
      <a role="menuitem" href={`/${l}/account`} onClick={event=>go(event,`/${l}/account`)}>{zh?'账户概览':'Account overview'}</a>
      <a role="menuitem" href={`/${l}/account/watch`} onClick={event=>go(event,`/${l}/account/watch`)}>{zh?'关注列表':'Watchlist'}</a>
      <a role="menuitem" href={`/${l}/account/subscription`} onClick={event=>go(event,`/${l}/account/subscription`)}>{zh?'套餐与账单':'Plan & billing'}</a>
      <a role="menuitem" href={`/${l}/account/delivery`} onClick={event=>go(event,`/${l}/account/delivery`)}>{zh?'邮件推送设置':'Email delivery settings'}</a>
      {viewer.isAdmin&&<a role="menuitem" href={`/${l}/admin`} onClick={event=>go(event,`/${l}/admin`)}>{zh?'网站管理':'Site administration'}</a>}
      <button type="button" role="menuitem" className="account-menu-signout" onClick={logout}>{zh?'退出登录':'Sign out'}</button>
    </div>}
  </div>;
}
function App(){
  const [path,setPath]=useState(location.pathname+location.search);
  const [viewer,setViewer]=useState(undefined);
  const [languageSuggestion,setLanguageSuggestion]=useState(null);
  const [footerChartsQuery,setFooterChartsQuery]=useState('');
  useEffect(()=>{const on=()=>setPath(location.pathname+location.search);addEventListener('popstate',on);return()=>removeEventListener('popstate',on)},[]);
  useEffect(()=>{
    let live=true;
    api('/api/auth/me').then(result=>{if(live)setViewer(result.user||null)}).catch(()=>{if(live)setViewer(null)});
    const update=event=>{
      const user=event.detail?.user||null;
      setViewer(user);
    };
    addEventListener(AUTH_CHANGED_EVENT,update);
    return()=>{live=false;removeEventListener(AUTH_CHANGED_EVENT,update)};
  },[]);
  useEffect(()=>{if(legacyRedirect()) setPath(location.pathname+location.search);},[path]);
  useEffect(()=>{
    let idleTimer;
    const showPageNavigation=()=>{
      document.documentElement.classList.add('is-scrolling');
      clearTimeout(idleTimer);
      idleTimer=setTimeout(()=>document.documentElement.classList.remove('is-scrolling'),1400);
    };
    addEventListener('scroll',showPageNavigation,{passive:true});
    return()=>{
      removeEventListener('scroll',showPageNavigation);
      clearTimeout(idleTimer);
      document.documentElement.classList.remove('is-scrolling');
    };
  },[]);
  const route=parseRoute(),l=route.l,t=copy[l],page=route.page,type=route.type;
  useEffect(()=>{pricingCache.load(l).catch(()=>{});},[l]);
  const rankingPage=page==='ranking'||page==='official';
  const namesForType=boardNames(type||'github-repo');
  const navigate=(e,target,query)=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();const [pathOnly,q]=String(target).split('?');updatePath(pathOnly,query||q||'');};
  const rankingQuery=page==='charts'?location.search.slice(1):'';
  const chartsQuery=page==='trending'||rankingPage?footerChartsQuery:page==='charts'?location.search.slice(1):'';
  const activeType=type||'github-repo';
  useEffect(()=>{
    if(location.hash!=='#subscribe')return;
    const frame=requestAnimationFrame(()=>document.getElementById('subscribe')?.scrollIntoView({behavior:'instant',block:'start'}));
    return()=>cancelAnimationFrame(frame);
  },[path,page]);
  useEffect(()=>{const browserLanguage=navigator.language.toLowerCase();const browserLocale=browserLanguage.startsWith('zh')?'zh':browserLanguage.startsWith('en')?'en':null;setLanguageSuggestion(!localStorage.getItem('locale')&&!sessionStorage.getItem('locale-suggestion-dismissed')&&browserLocale&&browserLocale!==l?browserLocale:null)},[l]);
  useEffect(()=>{document.documentElement.lang=l;document.title=`${page==='charts'?(l==='zh'?'图表分析 · ':'Charts · '):page==='trending'?(l==='zh'?'Trending · ':'Trending · '):rankingPage?(l==='zh'?'榜单 · ':'Rankings · '):''}Trend Top`;document.querySelector('meta[name="description"]')?.remove();const m=document.createElement('meta');m.name='description';m.content=t.sub;document.head.appendChild(m);document.querySelectorAll('link[hreflang]').forEach(x=>x.remove());for(const other of ['zh','en']){const link=document.createElement('link');link.rel='alternate';link.hreflang=other;link.href=location.origin+location.pathname.replace(/^\/(zh|en)/,`/${other}`)+location.search;document.head.appendChild(link)}},[path]);
  const switchLanguage=()=>{
    const other=l==='zh'?'en':'zh';
    localStorage.setItem('locale',other);
    setLanguageSuggestion(null);
    const path=location.pathname.replace(/^\/(zh|en)/,`/${other}`);
    updatePath(path,location.search.slice(1));
  };
  const dismissLanguageSuggestion=()=>{sessionStorage.setItem('locale-suggestion-dismissed','1');setLanguageSuggestion(null)};
  const showViewBar=Boolean(type)&&!['search','method','verify','manage','unsubscribe','account'].includes(page);
  const navigateAccount=(target,replace=false)=>{if(replace){history.replaceState({},'',target);dispatchEvent(new PopStateEvent('popstate'));window.scrollTo(0,0)}else updatePath(target)};
  if(page==='login')return <LoginPage l={l} user={viewer} navigate={navigateAccount}/>;
  return <AuthContext.Provider value={viewer}><header className="site-header"><div className="header-inner"><a className="brand" href={`/${l}/home`} onClick={e=>navigate(e,`/${l}/home`)}>Trend Top</a><HeaderSearch l={l} t={t} navigate={navigate} q={page==='search'?params().get('q')||'':''}/><nav className="header-actions" aria-label={l==='zh'?'站点导航':'Site navigation'}><a className="header-link" href={`/${l}/home`} onClick={e=>navigate(e,`/${l}/home`)} aria-current={page==='home'?'page':undefined}>{l==='zh'?'首页':'Home'}</a><a className="header-link" href={`/${l}/pricing`} onClick={e=>navigate(e,`/${l}/pricing`)} aria-current={page==='pricing'?'page':undefined}>{l==='zh'?'价格':'Pricing'}</a><a className="header-link" aria-current={page==='method'?'page':undefined} href={`/${l}/method`} onClick={e=>navigate(e,`/${l}/method`)}>{t.method}</a>{viewer?<AccountMenu viewer={viewer} l={l} page={page} navigate={navigate}/>:<a className="header-link header-signin" href={loginUrl(l)} onClick={e=>navigate(e,loginUrl(l))}>{l==='zh'?'登录':'Sign in'}</a>}</nav></div>{showViewBar&&<ViewBar l={l} type={type} page={page} query={page==='charts'?location.search.slice(1):chartsQuery} navigate={navigate}/>}</header>
  {languageSuggestion&&<aside className="locale-suggestion" role="status"><span>{languageSuggestion==='zh'?'浏览器语言为中文，是否切换到简体中文？':'Your browser uses English. Switch to English?'}</span><button type="button" className="locale-choice" onClick={switchLanguage}>{languageSuggestion==='zh'?'切换中文':'Switch to English'}</button><button type="button" className="locale-dismiss" onClick={dismissLanguageSuggestion} aria-label={languageSuggestion==='zh'?'关闭语言提示':'Dismiss language suggestion'}>×</button></aside>}
  {page==='digest'?<DigestEntryPage l={l} navigate={navigateAccount}/>:page==='account'?<AccountPage l={l} section={route.id||(params().get('section')==='subscription'?'subscription':'')} key={l+route.id} navigate={navigateAccount}/>:page==='pricing'?<PricingPage l={l} user={viewer} navigate={target=>updatePath(target)}/>:page==='billing'&&route.id==='success'?<BillingResultPage l={l} status="success" navigate={navigateAccount}/>:page==='billing'&&route.id==='cancel'?<BillingResultPage l={l} status="cancel"/>:page==='terms'?<LegalPage l={l} kind="terms"/>:page==='privacy'?<LegalPage l={l} kind="privacy"/>:page==='admin'?<React.Suspense fallback={<main className="simple-page">{t.loading}</main>}><AdminPage l={l}/></React.Suspense>:page==='verify'?<Verify l={l} t={t}/>:page==='manage'||page==='unsubscribe'?<Manage l={l} t={t} unsubscribe={page==='unsubscribe'}/>:page==='method'?<Method l={l} t={t}/>:page==='search'?<SearchPage l={l} t={t} q={params().get('q')||''} typeFilter={params().get('type')||''} navigate={navigate}/>:page==='home'?<><TypeHome l={l} t={t} navigate={navigate}/><SubscribeCallout l={l} t={t} data={{mailReady:true}} board="hot" type="github-repo"/></>:page==='trending'?<><TypeTrending l={l} t={t} type={type} navigate={navigate}/><SubscribeCallout l={l} t={t} data={{mailReady:true}} board="hot" type={type}/></>:page==='category'?<CategoryPage l={l} t={t} type={type} category={route.category} navigate={navigate}/>:page==='compare'?<ComparePage l={l} t={t} type={type} ids={params().get('ids')||''} navigate={navigate}/>:page==='related'?<RelatedPage key={type+route.id} l={l} type={type} id={route.id} navigate={navigate}/>:page==='detail'?<ItemDetail l={l} t={t} type={type} id={route.id} navigate={navigate} viewer={viewer}/>:page==='charts'?<React.Suspense fallback={<main className="simple-page">{l==='zh'?'正在加载图表…':'Loading charts…'}</main>}><AnalyticsPage l={l} names={namesForType} updatePath={updatePath} type={type} key={type}/></React.Suspense>:<Home l={l} t={t} rankingOnly={rankingPage} type={type} officialOnly={page==='official'} initialBoard={params().get('board')||(page==='official'?'official':'hot')} autoBoard={false} onChartsQueryChange={setFooterChartsQuery} key={path}/>}
  <SiteFooter l={l} t={t} onLanguageSwitch={switchLanguage}/></AuthContext.Provider>;
}

const SOCIAL_ICONS={
  email:{zh:'邮件',en:'Email',stroke:['M3 5h18v14H3z','M3 5l9 7 9-7']},
  x:{zh:'X',en:'X',path:'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'},
  facebook:{zh:'Facebook',en:'Facebook',path:'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'},
  telegram:{zh:'Telegram',en:'Telegram',path:'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'}
};
function SocialIcon({name}){
  const icon=SOCIAL_ICONS[name];
  if(!icon)return null;
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">{icon.stroke?icon.stroke.map(d=><path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>):<path d={icon.path} fill="currentColor"/>}</svg>;
}
function LanguageMenu({l,languages,onSwitch}){
  const [open,setOpen]=useState(false);
  const rootRef=React.useRef(null);
  const current=languages.find(([code])=>code===l)||languages[0];
  useEffect(()=>{
    if(!open)return;
    const close=e=>{if(rootRef.current&&!rootRef.current.contains(e.target))setOpen(false)};
    const key=e=>{if(e.key==='Escape')setOpen(false)};
    addEventListener('mousedown',close);addEventListener('keydown',key);
    return()=>{removeEventListener('mousedown',close);removeEventListener('keydown',key)};
  },[open]);
  const choose=code=>{setOpen(false);if(code!==l)onSwitch()};
  return <div className="language-menu" ref={rootRef}>
    <button type="button" className="language-menu-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={l==='zh'?'界面语言':'Site language'} onClick={()=>setOpen(v=>!v)}>
      <span lang={current[0]}>{current[1]}</span>
      <span className="design-select-chevron" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="m4 7 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
    </button>
    {open&&<ul className="language-menu-list" role="listbox" aria-label={l==='zh'?'选择语言':'Choose language'}>{languages.map(([code,label])=><li key={code} role="option" aria-selected={l===code} lang={code} tabIndex={0} onClick={()=>choose(code)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(code)}}}><span>{label}</span>{l===code&&<span className="design-select-check" aria-hidden="true">✓</span>}</li>)}</ul>}
  </div>;
}
function FooterNetwork({l,navigate}){
  const labels={skill:['Skills','Skills'],plugin:['插件','Plugins'],agent:['Agents','Agents'],components:['组件','Components'],website:['网站','Websites'],'github-repo':['仓库','Repositories']};
  const move=event=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const rect=event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--network-x',`${((event.clientX-rect.left)/rect.width-.5)*10}px`);
    event.currentTarget.style.setProperty('--network-y',`${((event.clientY-rect.top)/rect.height-.5)*8}px`);
  };
  const reset=event=>{event.currentTarget.style.setProperty('--network-x','0px');event.currentTarget.style.setProperty('--network-y','0px')};
  return <div className="footer-network" onMouseMove={move} onMouseLeave={reset} aria-label={l==='zh'?'六类开源内容':'Six open-source collections'}>
    <div className="footer-network-core"><span>Trend Top</span><small>{l==='zh'?'六大类型':'six collections'}</small></div>
    <div className="footer-network-nodes">{TYPES.map((type,index)=><a key={type} data-index={index+1} href={typePath(l,type)} onClick={event=>navigate(event,typePath(l,type))}><span>{String(index+1).padStart(2,'0')}</span><strong>{labels[type][l==='zh'?0:1]}</strong></a>)}</div>
  </div>;
}
function SiteFooter({l,t,onLanguageSwitch}){
  const siteSettings=useSiteSettings();
  const navigate=(e,path,query)=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    updatePath(path,query);
  };
  const contactLinks=[];

  for(const [name,url] of Object.entries(siteSettings?.social||{})){if(url&&SOCIAL_ICONS[name])contactLinks.push({name,href:url,title:SOCIAL_ICONS[name][l],external:true})}
  const languages=[['en','English'],['zh','简体中文']];
  return <footer className="footer site-footer">
    <div className="footer-main"><div className="footer-identity"><strong className="footer-wordmark">Trend Top</strong><p className="footer-tagline">{l==='zh'?'发现开源世界的新动向。':'Find what is moving in open source.'}</p><p className="footer-support"><span>{l==='zh'?'客户支持':'Customer support'}</span><SupportEmail/></p>{contactLinks.length>0&&<ul className="footer-social" aria-label={l==='zh'?'联系方式':'Contact'}>{contactLinks.map(link=><li key={link.name}><a href={link.href} title={link.title} aria-label={link.title} {...(link.external?{target:'_blank',rel:'noreferrer'}:{})}><SocialIcon name={link.name}/></a></li>)}</ul>}</div><FooterNetwork l={l} navigate={navigate}/></div>
    <div className="footer-bottom"><div className="footer-bottom-copy"><p>{t.foot}</p><nav className="footer-legal" aria-label={l==='zh'?'法律信息':'Legal'}><a href={`/${l}/privacy`} onClick={e=>navigate(e,`/${l}/privacy`)}>{l==='zh'?'隐私':'Privacy'}</a><a href={`/${l}/terms`} onClick={e=>navigate(e,`/${l}/terms`)}>{l==='zh'?'条款':'Terms'}</a><a href={`/${l}/privacy#cookies`}>{l==='zh'?'Cookie 说明':'Cookies'}</a></nav></div><LanguageMenu l={l} languages={languages} onSwitch={onLanguageSwitch}/></div>
  </footer>;
}

function Home({l,t,rankingOnly,type='github-repo',officialOnly=false,initialBoard,autoBoard,onChartsQueryChange}) {
  const user=React.useContext(AuthContext),proActive=useProStatus(user);
  const [componentView,setComponentView]=useState('ranking');
  const autoPending=React.useRef(autoBoard);
  const subscribeHashPending=React.useRef(location.hash==='#subscribe');
  const deckRef=React.useRef(null);
  const [activeScene,setActiveScene]=useState(0);
  const [ctaVisible,setCtaVisible]=useState(false);
  const q0=params();const names=boardNames(type);const [board,setBoard]=useState(()=>{const next=names[initialBoard]?initialBoard:'hot';return officialOnly&&next==='official'?'hot':next;}),[period,setPeriod]=useState(q0.get('period')||(rankingOnly?'week':'day')),[language,setLanguage]=useState(q0.get('language')||''),[topic,setTopic]=useState(q0.get('topic')||''),[useCase,setUseCase]=useState(normalizeUseCase(q0.get('useCase'))),[age,setAge]=useState(q0.get('age')||''),[q,setQ]=useState(q0.get('q')||''),[page,setPage]=useState(1),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[mode,setMode]=useState(null),[refresh,setRefresh]=useState(0);
  const idx=localeIndex(l);
  const filterOpts=useFilterOptions(type);
  const keepRowsWhilePaging=page>1&&!!data?.items?.length;
  useEffect(()=>{
    if(!subscribeHashPending.current||loading)return;
    subscribeHashPending.current=false;
    const frame=requestAnimationFrame(()=>document.getElementById('subscribe')?.scrollIntoView({behavior:'instant',block:'start'}));
    return()=>cancelAnimationFrame(frame);
  },[loading]);
  useEffect(()=>{
    const deck=deckRef.current;
    if(!deck)return;
    const scenes=[...deck.querySelectorAll('.page-scene')];
    let frame=0;
    const update=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const headerBottom=document.querySelector('.site-header')?.getBoundingClientRect().bottom||0;
        const center=headerBottom+(innerHeight-headerBottom)/2;
        let active=scenes.findIndex(scene=>{const rect=scene.getBoundingClientRect();return rect.top<=center&&rect.bottom>center});
        if(active<0)active=scenes.reduce((index,scene,i)=>scene.getBoundingClientRect().top<=center?i:index,0);
        scenes.forEach((scene,index)=>{scene.classList.toggle('is-active',index===active);if(index===active)scene.classList.add('has-entered')});
        setActiveScene(active);
      });
    };
    addEventListener('scroll',update,{passive:true});
    addEventListener('resize',update,{passive:true});
    update();
    return()=>{removeEventListener('scroll',update);removeEventListener('resize',update);cancelAnimationFrame(frame)};
  },[]);
  useEffect(()=>{
    const targets=[deckRef.current?.querySelector('.subscribe-cta'),document.querySelector('#root>.site-footer')].filter(Boolean);
    if(!targets.length||!('IntersectionObserver' in window))return;
    const visible=new Map();
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>visible.set(entry.target,entry.isIntersecting));
      setCtaVisible([...visible.values()].some(Boolean));
    },{threshold:.1});
    targets.forEach(target=>observer.observe(target));
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');const query=new URLSearchParams({board,period,language,topic,age,q,page:String(page),limit:'10'});if(useCase)query.set('useCase',useCase);if(officialOnly)query.set('official','1');api(`/api/${type}/rankings?${query}`,{signal:controller.signal}).then(d=>{setData(prev=>page>1?{...d,items:[...(prev?.items||[]),...d.items]}:d);setMode(d.source==='demo'?'demo':'live');if(autoPending.current&&board==='hot'&&d.source!=='demo'&&d.dataInsufficient){setBoard('stars');setPage(1)}autoPending.current=false}).catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});if(rankingOnly){const path=typePath(l,type,officialOnly?'official':'ranking'),visible=new URLSearchParams({board,period,language,topic,age,q});if(useCase)visible.set('useCase',useCase);history.replaceState({},'',path+'?'+visible+location.hash);} return()=>controller.abort();},[board,period,language,topic,useCase,age,q,page,l,refresh,type,officialOnly]);
  const loadMore=()=>{setLoading(true);if(error)setRefresh(x=>x+1);else setPage(x=>x+1)};
  const chartQuery=new URLSearchParams({board,period,language,topic,age,q,...(useCase?{useCase}:{})}).toString();
  useEffect(()=>onChartsQueryChange(chartQuery),[chartQuery,onChartsQueryChange]);
  const action=<a className="primary" href={typePath(l,type,'charts',chartQuery)} onClick={e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();updatePath(typePath(l,type,'charts'),chartQuery)}}>{l==='zh'?'查看图表':'View charts'}</a>;
  const goScene=index=>deckRef.current?.querySelectorAll('.page-scene')[index]?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  const navigate=(e,target,query)=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();updatePath(target,query)};
  const topicOptions=optionList(topic&&!filterOpts.topics.includes(topic)?[topic,...filterOpts.topics]:filterOpts.topics,l);
  const boardIds=Object.keys(names);
  const headingCopy=officialOnly&&descriptions.official?descriptions.official[idx]:descriptions[board]?descriptions[board][idx]:(l==='zh'?'按窗口增量排序，前几名由你选。':'Ranked by window growth. You pick from the top results.');
  const searchLabel=l==='zh'?`${t.search} ${typeLabel(type,l)}`:`${t.search} ${typeLabel(type,l)}`;
  return <main className={`page-shell${rankingOnly?' ranking-page':' page-deck'}`} ref={deckRef}>{!rankingOnly&&<><section className="hero page-scene is-active" id="intro" data-scroll-label={l==='zh'?'向下滑动探索 ↓':'Scroll to explore ↓'}><div className="hero-intro"><h1>{l==='zh'?<>{typeLabel(type,l)} 正在增长的条目。</>:t.hero}</h1><p className="hero-copy">{t.sub}</p><div className="hero-actions"><a className="hero-ranking-link" href={typePath(l,type,'ranking')} onClick={e=>navigate(e,typePath(l,type,'ranking'))}>{l==='zh'?'查看榜单':'Explore rankings'}</a></div></div><div className="hero-data"><div className="data-status">{mode===null?t.loading:data?.updatedAt?`${t.updated} ${new Date(data.updatedAt).toLocaleDateString(l==='zh'?'zh-CN':'en-US')}`:''}</div><div className="hero-stat"><b>{data?.total??'—'}</b><span>{typeLabel(type,l)}</span></div></div></section>
  <section className="charts-scene page-scene" id="charts"><React.Suspense fallback={<div className="trend-panel" style={{display:'grid',placeItems:'center'}}>{t.loading}</div>}><TrendPanel l={l} type={type} board={board} period={period} language={language} topic={topic} age={age} q={q} boardLabel={names[board]?names[board][idx]:board} periodLabel={t[period]}/></React.Suspense><div className="charts-scene-action">{action}</div></section><SubscribeCallout l={l} t={t} data={data} board={board} type={type}/></>}
  {rankingOnly&&<div className="content-grid page-scene" id="rankings"><div className="main-column"><div className="section-heading"><div><h2>{typeLabel(type,l)}</h2><p>{headingCopy}</p>{type==='skill'&&<p className="ranking-group-note">{l==='zh'?'每个仓库只占一个位置；展开查看匹配的 Skills。Star 与热度来自关联仓库。':'One result per repository. Expand to explore matching skills; stars and momentum describe the repository.'}</p>}{officialOnly&&<p className="ranking-group-note">{l==='zh'?'官方表示由已识别的作者或厂商发布，不代表安全认证。':'Official identifies a recognized publisher; it is not a security certification.'}</p>}</div><div className="ranking-heading-actions"><span className="section-count">{fmt(data?.total,l)} {data?.grouping==='repository'?(l==='zh'?'个 Skill 结果':data?.total===1?'Skill result':'Skill results'):typeLabel(type,l)}</span><SaveSearchButton l={l} filters={{type,board,period,language,topic,useCase,age,q}} user={user} proActive={proActive}/></div></div>
  <div className="filters filters-primary"><SearchInput value={q} onChange={x=>{setQ(x);setPage(1)}} label={searchLabel} placeholder={l==='zh'?'名称或关键词':'Name or keyword'} clearLabel={l==='zh'?'清除搜索':'Clear search'}/><div className="field"><label htmlFor="board">{t.board}</label><DesignSelect id="board" value={board} onChange={x=>{setBoard(x);setPage(1)}} options={boardIds.map(id=>({value:id,label:id==='stars'?(l==='zh'?'Star 总数':'Stars'):id==='forks'?(l==='zh'?'Fork 总数':'Forks'):names[id][idx]}))}/></div><div className="field"><label htmlFor="period">{t.period}</label><DesignSelect id="period" value={period} onChange={x=>{setPeriod(x);setPage(1)}} options={['day','week','month'].map(x=>({value:x,label:t[x]}))}/></div><div className="field"><label htmlFor="language">{t.language}</label><DesignSelect id="language" value={language} onChange={x=>{setLanguage(x);setPage(1)}} options={[{value:'',label:t.allLanguages},...filterOpts.languages.map(x=>({value:x,label:x}))]}/></div><div className="field"><label htmlFor="topic" title={l==='zh'?'资源涉及的技术或主题，例如 Python、MCP':'Technologies or subjects, such as Python or MCP'}>{t.topic}</label><DesignSelect id="topic" value={topic} onChange={x=>{setTopic(x);setPage(1)}} options={[{value:'',label:t.allTopics},...topicOptions]}/></div><div className="field"><label htmlFor="useCase" title={l==='zh'?'用资源完成的任务，例如数据处理、代码协作':'Tasks you can accomplish, such as data processing or code collaboration'}>{t.useCase}</label><DesignSelect id="useCase" value={useCase} onChange={x=>{setUseCase(x);setPage(1)}} options={[{value:'',label:t.allUseCases},...(filterOpts.useCases||[]).map(item=>({value:item.id,label:item[l==='zh'?'zh':'en']||item.id}))]}/></div><div className="field"><label htmlFor="age">{t.age}</label><DesignSelect id="age" value={age} onChange={x=>{setAge(x);setPage(1)}} options={[{value:'',label:t.allAges},{value:'90',label:t.new90},{value:'30',label:t.new30}]}/></div></div>

  {type==='components'&&<div className="ranking-tools"><div className="component-view-switch"><button className="ghost" type="button" aria-pressed={componentView==='ranking'} onClick={()=>setComponentView('ranking')}>{l==='zh'?'排行':'Ranking'}</button><button className="ghost" type="button" aria-pressed={componentView==='grid'} onClick={()=>setComponentView('grid')}>{l==='zh'?'网格':'Grid'}</button></div></div>}
  {!(type==='components'&&componentView==='grid')&&<div className="list-header"><span>{t.rank} / {typeLabel(type,l)}</span><span className="topic-column-header">{t.topic}</span><span className="language-column-header">{t.language}</span><span>{board==='hot'||board==='ai'||board==='topics'||board==='official'?t.score:board==='forks'?t.forks:board==='stars'?t.stars:t.gain}</span><span>{t.stars}</span><span>{t.gain}</span><span>{t.forks}</span></div>}{loading&&!keepRowsWhilePaging?<div className="skeletons" aria-label={t.loading}>{[1,2,3,4,5].map(x=><div key={x}/>)}</div>:error&&!keepRowsWhilePaging?<div className="state"><p>{t.error}</p><button onClick={()=>setRefresh(x=>x+1)}>{t.retry}</button></div>:data?.items.length?<>{type==='components'&&componentView==='grid'?<ComponentGrid l={l} items={data.items} href={item=>itemPath(l,type,item.slug || item.id)} topicHref={value=>`/${l}/${type}/ranking?${catalogQuery({board,period,language,topic,useCase,age,q,official:officialOnly?'1':''},{topic:value})}`}/>:<div className="repo-list">{data.items.map(r=><RepoRow key={r.id} r={r} l={l} t={t} board={board} type={type} period={period} language={language} topic={topic} useCase={useCase} age={age} q={q} officialOnly={officialOnly}/>)}</div>}{data.items.length<data.total&&<button className="more" type="button" disabled={loading} aria-busy={loading} onClick={loadMore}>{loading?(l==='zh'?'加载中…':'Loading…'):error?t.retry:t.more}</button>}{error&&keepRowsWhilePaging&&<p className="pagination-error" role="status">{t.error}</p>}</>:<div className="state"><p>{data?.dataInsufficient?t.insufficient:t.empty}</p>{data?.dataInsufficient&&<button type="button" onClick={()=>{setBoard('stars');setPage(1)}}>{l==='zh'?'查看已收录项目':'Browse collected projects'}</button>}</div>}</div>
  <SubscribeCallout l={l} t={t} data={data} board={board} type={type}/>
  </div>}
  {!rankingOnly&&<nav className={`page-indicator${ctaVisible?' is-hidden-at-end':''}`} aria-label={l==='zh'?'页面导航':'Page navigation'}>{(l==='zh'?['首页','图表']:['Intro','Charts']).map((label,index)=><button key={label} type="button" className={activeScene===index?'active':''} onClick={()=>goScene(index)} aria-label={label} aria-current={activeScene===index?'page':undefined}><span/></button>)}</nav>}
  </main>;
}


function SubscribeCallout({l,t,data,board,type='github-repo'}){
  const zh=l==='zh';
  const viewer=React.useContext(AuthContext);
  const proActive=useProStatus(viewer);
  const steps=zh?['选择六类开源内容','选择榜单、语言与主题','设定发送时间']:['Choose from six content types','Pick boards, languages, and topics','Set your delivery time'];
  return <section className="subscribe-cta" id="subscribe" aria-labelledby="subscribe-title">
    <div className="subscribe-cta-inner">
      <div className="subscribe-cta-copy">
        <p className="subscribe-cta-kicker">04 / {zh?'每日摘要':'THE DAILY DIGEST'}</p>
        <h2 id="subscribe-title">{zh?'关掉网页，也能跟上变化。':'Keep up, without keeping a tab open.'}</h2>
        <p className="subscribe-cta-description">{zh?'选择你关注的开源内容，每天在方便的时间收到带图表的摘要。':'Follow the open-source content you care about in one concise, chart-rich daily email.'}</p>
      </div>
      <div className="subscribe-cta-panel">
        <p className="subscribe-cta-panel-label">{zh?'由你决定收到什么':'MAKE IT YOURS'}</p>
        <ol className="subscribe-cta-steps">{steps.map((step,index)=><li key={step}><span>{String(index+1).padStart(2,'0')}</span>{step}</li>)}</ol>
        <a className="primary subscribe-cta-button" href={digestEntryPath(l,type,board)} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();updatePath(digestEntryPath(l,type,board));}}>{proActive?(zh?'管理邮件推送':'Manage email delivery'):(zh?'开始使用':'Get started')}<span aria-hidden="true">↗</span></a>
        <p className="subscribe-cta-fineprint">{zh?'Pro 功能；每天最多一封，随时可以暂停或停止邮件推送。':'Included with Pro. At most one email per day; pause or stop emails anytime.'}</p>
      </div>
    </div>
  </section>;
}

function visibleTopics(item){
  const normalize=value=>String(value??'').trim().toLowerCase();
  const seen=new Set();
  return (Array.isArray(item.topics)?item.topics:[]).filter(topic=>{
    const value=String(topic??'').trim();
    const key=normalize(value);
    if(!value||seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function RepoRow({r,l,t,board,type='github-repo',period='week',language='',topic='',useCase='',age='',q='',officialOnly=false}){
  const key=board==='stars'?r.stars:board==='forks'?r.forks:['hot','ai','topics','official'].includes(board)?r.score:r.gain;
  const change=r.gain!==null&&r.prevGain!==null?r.gain-r.prevGain:null;
  const id=r.slug||r.id;
  const topics=visibleTopics(r);
  const orderedTopics=topic&&topics.includes(topic)?[topic,...topics.filter(value=>value!==topic)]:topics;
  const displayTopics=orderedTopics.slice(0,5);
  const navigate=(e,path,query)=>{e.preventDefault();updatePath(path,query);};
  const filterQuery=(overrides={})=>catalogQuery({board,period,language,topic,useCase,age,q,official:officialOnly?'1':''},overrides);
  const filterPath=typePath(l,type,'ranking');
  const topicLink=(value)=>filterQuery({topic:value});
  const languageLink=(value)=>filterQuery({language:value});
  return <article className="repo-row">
    <div className="repo-identity">
      <span className="rank-num">{String(r.rank).padStart(2,'0')}</span>
      <div>
        <a className="repo-name" href={itemPath(l,type,id)} onClick={e=>{e.preventDefault();updatePath(itemPath(l,type,id))}}>{r.skillRepository || r.full_name} <span>↗</span></a>
        <p>{r.description||'—'}</p>
        <TagActions l={l} type={type} item={r} navigate={navigate}/>
      </div>
    </div>
    <div className="repo-topic-column" aria-label={t.topic}>
      <small className="mobile-column-label">{t.topic}</small>
      {displayTopics.length
        ? <div className="repo-topic-list">
            {displayTopics.slice(0,3).map(value=><a className="repo-topic repo-filter-tag" title={value} key={value} href={`${filterPath}?${topicLink(value)}`} onClick={e=>navigate(e,filterPath,topicLink(value))}>{value}</a>)}
            {displayTopics.length>3&&<TopicDialog
              trigger={<button className="repo-topic repo-topic-more" type="button" aria-label={l==='zh'?`查看另外 ${displayTopics.length-3} 个主题`:`View ${displayTopics.length-3} more topics`}>+{displayTopics.length-3}</button>}
              topics={displayTopics.slice(3)}
              title={l==='zh'?'更多主题':'More topics'}
              description={l==='zh'?'选择主题，查看对应排名。':'Choose a topic to see its rankings.'}
              hrefFor={value=>`${filterPath}?${topicLink(value)}`}
              onSelect={value=>updatePath(filterPath,topicLink(value))}
              locale={l}
            />}
          </div>
        : <span className="repo-topic-empty" aria-hidden="true">—</span>}
    </div>
    <div className="repo-language-column" aria-label={t.language}>
      <small className="mobile-column-label">{t.language}</small>
      {r.language?<a className="repo-language repo-filter-tag" href={`${filterPath}?${languageLink(r.language)}`} onClick={e=>navigate(e,filterPath,languageLink(r.language))}>{r.language}</a>:<span className="repo-topic-empty" aria-hidden="true">—</span>}
    </div>
    <div className="metric primary-metric"><small>{board==='stars'?t.stars:board==='forks'?t.forks:['hot','ai','topics','official'].includes(board)?t.score:t.gain}</small><strong>{key===null?(r.anomaly?t.anomaly:t.insufficient):fmt(key,l)}</strong></div>
    <div className="metric"><small>{t.stars}</small><strong>{fmt(r.stars,l)}</strong></div>
    <div className="metric"><small>{t.gain}</small><strong className={r.gain!==null?'positive':''}>{r.gain===null?t.insufficient:`+${fmt(r.gain,l)}`}</strong>{change!==null&&<em className={`period-change ${change>=0?'is-positive':'is-negative'}`}><span className="period-change-arrow" aria-hidden="true">{change>=0?'↑':'↓'}</span><span className="period-change-label">{t.trend}</span><strong>{change>=0?'+':''}{fmt(change,l)}</strong></em>}</div>
    <div className="metric"><small>{t.forks}</small><strong>{fmt(r.forks,l)}</strong></div>
  </article>
}

function SubscribeForm({l,t,currentBoard}){
  const [email,setEmail]=useState('');
  const [selected,setSelected]=useState([currentBoard]);
  const [mailLocale,setMailLocale]=useState(l);
  const [languages,setLanguages]=useState([]);
  const [topics,setTopics]=useState([]);
  const [hour,setHour]=useState(9);
  const [zone,setZone]=useState(browserTimezone);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const idx=localeIndex(l);
  const filterOpts=useFilterOptions();
  const toggle=x=>setSelected(old=>old.includes(x)?old.filter(y=>y!==x):[...old,x]);
  const submit=async e=>{
    e.preventDefault();
    if(!selected.length){setMessage(t.selectBoard);return}
    setBusy(true);setMessage('');
    try{
      await post('/api/subscriptions',{email,boards:selected,locale:mailLocale,language:languages[0]||'',languages,topics,topic:topics[0]||'',sendHour:Number(hour),timezone:zone});
      setMessage(t.pending);
    }catch(e){setMessage(e.message?.includes('already')?(l==='zh'?'该邮箱已有订阅，请使用管理链接。':'This email is already subscribed. Use your management link.'):t.subscribeError)}
    finally{setBusy(false)}
  };
  const topicOptions=optionList(filterOpts.topics,l);
  return <form className="subscribe-form" onSubmit={submit}>
    <div className="field"><label htmlFor="sub-email">{t.email}</label><input id="sub-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div>
    <fieldset><legend>{t.boards}</legend><div className="checks">{Object.keys(names).map(x=><label key={x}><input type="checkbox" checked={selected.includes(x)} onChange={()=>toggle(x)}/>{names[x][idx]}</label>)}</div></fieldset>
    <div className="form-grid">
      <div className="field"><label htmlFor="sub-lang">{t.language}</label><TopicMultiSelect id="sub-lang" value={languages} onChange={setLanguages} options={filterOpts.languages.map(x=>({value:x,label:x}))} placeholder={t.allLanguages} ariaLabel={t.language}/></div>
      <div className="field"><label htmlFor="sub-topic">{t.topic}</label><TopicMultiSelect id="sub-topic" value={topics} onChange={setTopics} options={topicOptions} placeholder={t.allTopics} ariaLabel={t.topic}/></div>
      <div className="field"><label htmlFor="sub-hour">{t.send}</label><DesignSelect id="sub-hour" value={hour} onChange={setHour} options={Array.from({length:24},(_,i)=>({value:String(i),label:`${String(i).padStart(2,'0')}:00`}))}/></div>
      <div className="field"><label htmlFor="sub-zone">{t.timezone}</label><DesignSelect id="sub-zone" value={zone} onChange={setZone} options={timezoneOptions(zone)}/></div>
      <div className="field"><label htmlFor="sub-locale">{t.mailLocale}</label><DesignSelect id="sub-locale" value={mailLocale} onChange={setMailLocale} options={[{value:'zh',label:'简体中文'},{value:'en',label:'English'}]}/></div>
    </div>
    <button className="primary wide" disabled={busy}>{busy?'…':t.sendButton}</button>{message&&<p className="form-message" role="status">{message}</p>}
  </form>;
}

function Verify({l,t}){const [state,setState]=useState('loading');useEffect(()=>{post('/api/verify',{token:params().get('token')}).then(()=>setState('ok')).catch(()=>setState('error'))},[]);return <main className="simple-page"><h1>{state==='ok'?t.verified:state==='error'?t.verifyError:t.loading}</h1><a href={`/${l}/github-repo/ranking`}>{t.list}</a></main>}
function Manage({l,unsubscribe}){
  const user=React.useContext(AuthContext);
  const target=`/${l}/account/delivery${unsubscribe?'?intent=stop':''}`;
  useEffect(()=>{
    if(user===undefined)return;
    location.replace(user?target:loginUrl(l,target));
  },[user,target,l]);
  return <main className="simple-page"><p role="status">{l==='zh'?'正在打开邮件推送设置…':'Opening email delivery settings…'}</p></main>;
}
function Repo({l,t,id}){const [repo,setRepo]=useState(null),[msg,setMsg]=useState(''),[showAllTopics,setShowAllTopics]=useState(false);useEffect(()=>{api(`/api/repos/${encodeURIComponent(id)}`).then(setRepo).catch(()=>setMsg(t.error))},[id]);if(!repo)return <main className="simple-page">{msg||t.loading}</main>;const topicValues=[];const seen=new Set();for(const value of Array.isArray(repo.topics)?repo.topics:[]){const text=String(value??'').trim(),key=text.toLowerCase();if(text&&!seen.has(key)){seen.add(key);topicValues.push(text)}}return <main className="simple-page repo-detail"><a href={`/${l}/ranking`} onClick={e=>{e.preventDefault();updatePath(`/${l}/ranking`)}}>{t.list}</a><h1>{repo.full_name}</h1><p>{t.original}</p><p className="detail-description">{repo.description}</p><div className="detail-metrics"><div><small>{t.stars}</small><strong>{fmt(repo.stars,l)}</strong></div><div><small>{t.forks}</small><strong>{fmt(repo.forks,l)}</strong></div><div><small>{t.language}</small><strong>{repo.language||'—'}</strong></div></div><div className="repo-tags">{topicValues.slice(0,showAllTopics?undefined:6).map(value=><a className="tag-btn detail-topic-tag" key={value} href={`/${l}/github-repo/ranking?topic=${encodeURIComponent(value)}`} onClick={e=>{e.preventDefault();updatePath(`/${l}/github-repo/ranking`,`topic=${encodeURIComponent(value)}`)}}>{value}</a>)}{topicValues.length>6&&<button type="button" className="tag-btn detail-topic-tag detail-topic-more" aria-expanded={showAllTopics} onClick={()=>setShowAllTopics(value=>!value)}>{showAllTopics?(l==='zh'?'收起':'Show less'):`+${topicValues.length-6}`}</button>}</div>{repo.aiEvidence.length>0&&<p><button className="text-button" onClick={async()=>{await post('/api/ai-report',{repoId:repo.id,reason:'misclassified'});setMsg(t.reported)}}>{t.report}</button></p>}{msg&&<p role="status">{msg}</p>}<a className="primary inline" href={repo.url} target="_blank" rel="noopener noreferrer">{t.github} ↗</a></main>}
function Method({l,t}){
  const zh=l==='zh';
  return <main className="simple-page method-page"><div className="method-lead"><h1>{t.method}</h1>
    <p className="method-intro">{zh?'看懂项目的增长、热度与排名。':'See which projects are drawing attention and how that is changing.'}</p></div>
    <div className="method-content"><div className="method-grid">
      <article><h2>{zh?'榜单从哪里来？':'Where do the rankings come from?'}</h2><p>{zh?'站点按 Skill、插件 / MCP、Agent、组件、开源网站和 GitHub 仓库六类分开排行。每一类给出前几名、官方标记和同类重复，推荐是一组选项而不是唯一答案。仓库榜仍来自 GitHub 公开数据。':'The site ranks six types separately: skills, plugins / MCP, agents, components, open-source websites, and GitHub repositories. Each type shows top results, official marks, and duplicates. Recommendations are a set of options, not a single answer. Repository boards still use public GitHub data.'}</p></article>
      <article><h2>{zh?'增长如何理解？':'What does growth mean?'}</h2><p>{zh?'新增 Star 使用 GitHub 的历史统计；Fork 增长由本站定期记录的总数计算。缺少可靠历史时会显示“数据不足”。':'New Stars use GitHub history. Fork growth is calculated from totals recorded over time. When reliable history is missing, we show “Insufficient data.”'}</p></article>
      <article><h2>{zh?'多久更新？':'How often does it update?'}</h2><p>{zh?'项目数据按日更新。每个榜单会显示最近的更新时间；不同时间窗口可能有不同的有效项目数。':'Project data updates daily. Each ranking shows its latest update time, and the number of eligible projects can vary by time window.'}</p></article>
      <article><h2>{zh?'热度分怎么算？':'How is hot score calculated?'}</h2><p>{zh?'热度按类型与时间窗口计算，筛选只改变显示范围，不重新计算分数。热度基于仓库新增 Star、增长率与最近推送。资源展示关联仓库的信号。目录安装量、用量保留来源、单位与窗口，不参与热度混排。独立网站没有关联仓库数据时不打热度分。':'Scores are calculated for each type and time window. Filters select from that ranking without recalculating scores. Hot rankings use repository momentum. Associated resources disclose their repository signal. Directory counts keep their source, unit, and window and never mix into Hot scores. Independent sites without repository momentum have no Hot score.'}</p></article>
      <article><h2>{zh?'如何阅读 AI 榜？':'How is the AI board selected?'}</h2><p>{zh?'根据仓库公开的主题与简介识别 AI 相关项目。若分类不准确，可在项目详情页提交反馈。':'AI-related projects are identified from public repository topics and descriptions. You can report a mismatch on a project page.'}</p></article>
    </div></div><SupportContact l={l}/>
  </main>;
}

if(location.pathname!=='/login'&&!/^\/(zh|en)(\/|$)/.test(location.pathname)){const first=localStorage.getItem('locale')==='zh'?'zh':'en';history.replaceState({},'',`/${first}${location.pathname==='/'?'/home':location.pathname}${location.search}`)}else if(/^\/(zh|en)\/?$/.test(location.pathname)){history.replaceState({},'',`/${lang()}/home${location.search}`)}
createRoot(document.getElementById('root')).render(<SiteSettingsProvider><App/></SiteSettingsProvider>);
