import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SearchInput,SubscribeDialog,DesignSelect,TopicMultiSelect,TopicDialog} from './components.jsx';
import {AccountSubscribeForm,AccountPage,AUTH_CHANGED_EVENT} from './subscription.jsx';
import {TYPES, boardNames, typeLabel, typePath, itemPath} from './catalog.js';
import {ViewBar, TypeHome, TypeTrending, CategoryPage, ComparePage, SearchPage, ItemDetail, HeaderSearch, TagActions} from './pages.jsx';
import {PricingPage,BillingResultPage,LegalPage} from './billing-ui.jsx';
import {AdminPage} from './admin-page.jsx';
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
  zh:{nav:'开源项目发现',hero:'发现正在增长的开源项目。',sub:'按热度、增长和主题，发现好项目。',demo:'演示数据',live:'GitHub 公开数据',discover:'探索榜单',subscribe:'订阅每日摘要',mailPending:'每日邮件摘要暂未开放',method:'关于榜单',source:'数据来源',updated:'更新于',window:'统计窗口',timezone:'统计时区',coverage:'有效样本覆盖',search:'搜索',searchHint:'名称、简介或主题',board:'排序',period:'时间窗口',day:'日',week:'周',month:'月',language:'编程语言',allLanguages:'全部语言',topic:'主题',allTopics:'全部主题',age:'项目年龄',allAges:'不限',new90:'90 天内',new30:'30 天内',rank:'排名',repo:'仓库',stars:'Star 总数',gain:'新增 Star',forks:'Fork 总数',trend:'对比上期',score:'热度分',insufficient:'数据不足',anomaly:'异常增长待核实',details:'项目详情',github:'查看 GitHub',more:'加载更多',empty:'当前筛选下没有项目',loading:'正在加载榜单…',error:'加载失败，请重试。',retry:'重试',how:'如何计算',formula:'热度分：45% 对数增星、20% 平滑增长率、15% 对数 Fork 增量、20% 最近推送时间。按当前筛选样本归一化；异常增量不计分。',notice:'增量需有完整的起止快照；缺失时显示数据不足。按 UTC 每日约 02:00 采样，窗口边界容差 6 小时。',noFresh:'采样可能延迟，请查看时间戳。',stale:'数据超过 36 小时未更新',email:'邮箱地址',boards:'关注榜单',send:'发送时间',mailLocale:'邮件语言',sendButton:'发送验证邮件',pending:'验证邮件已发送。请先验证邮箱。',subscribeError:'订阅失败，请检查输入或邮件服务。',selectBoard:'至少选择一个榜单',selectTime:'每日当地时间',manage:'管理订阅',pause:'暂停',resume:'恢复',cancel:'取消订阅',save:'保存设置',verified:'邮箱已验证，订阅已启用。',verifyError:'验证链接无效。',manageError:'管理链接无效。',cancelled:'已取消订阅。',report:'报告 AI 分类错误',reported:'已提交纠错报告',original:'仓库原文简介',sample:'这里展示的是演示数据。',foot:'探索 Skill、插件、Agent、组件、网站与开源仓库。',languageSwitch:'English',theme:'切换明暗主题',list:'返回榜单'},
  en:{nav:'Open-source discovery',hero:'Find what is growing in open source.',sub:'Explore projects by momentum, growth, and topic.',demo:'Demo data',live:'GitHub public data',discover:'Explore rankings',subscribe:'Get the daily digest',mailPending:'Daily email digest is not available yet',method:'About',source:'Data source',updated:'Updated',window:'Window',timezone:'Statistics timezone',coverage:'Valid sample coverage',search:'Search',searchHint:'Name, description, or topic',board:'Sort',period:'Time window',day:'Day',week:'Week',month:'Month',language:'Language',allLanguages:'All languages',topic:'Topic',allTopics:'All topics',age:'Project age',allAges:'Any age',new90:'Within 90 days',new30:'Within 30 days',rank:'Rank',repo:'Repository',stars:'Total stars',gain:'New stars',forks:'Total forks',trend:'Vs previous',score:'Hot score',insufficient:'Insufficient data',anomaly:'Unusual growth under review',details:'Project details',github:'View on GitHub',more:'Load more',empty:'No projects match these filters',loading:'Loading rankings…',error:'Could not load rankings. Try again.',retry:'Retry',how:'How it works',formula:'Hot score: 45% log star gain, 20% smoothed growth rate, 15% log fork gain, 20% recent push. Inputs are normalized within the filtered set; anomalous gains do not score.',notice:'Gains need complete boundary snapshots; missing pairs show insufficient data. Samples run near 02:00 UTC daily, with a 6-hour boundary tolerance.',noFresh:'Sampling may be delayed; check the timestamp.',stale:'Data has not updated for over 36 hours',email:'Email address',boards:'Boards to follow',send:'Send time',mailLocale:'Email language',sendButton:'Send verification email',pending:'Verification email sent. Verify your address to activate.',subscribeError:'Subscription failed. Check the form or mail service.',selectBoard:'Choose at least one board',selectTime:'Local time each day',manage:'Manage subscription',pause:'Pause',resume:'Resume',cancel:'Unsubscribe',save:'Save settings',verified:'Email verified. Your subscription is active.',verifyError:'Invalid verification link.',manageError:'Invalid management link.',cancelled:'Subscription cancelled.',report:'Report AI misclassification',reported:'Correction report submitted',original:'Original repository description',sample:'This page is showing demo data.',foot:'Explore skills, plugins, agents, components, websites, and repositories.',languageSwitch:'简体中文',theme:'Toggle light and dark theme',list:'Back to rankings'}
};
const params=()=>new URLSearchParams(location.search);
const parts=()=>location.pathname.split('/').filter(Boolean);
const lang=()=>parts()[0]==='zh'?'zh':'en';
const localeIndex=l=>l==='zh'?0:1;
function parseRoute(){
  const p=parts();
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
  const [opts,setOpts]=useState({languages:fallbackLangs,topics:fallbackTopics,categories:[]});
  useEffect(()=>{
    fetch(`/api/${type}/filters`).then(r=>r.ok?r.json():null).then(d=>{
      if(!d) return;
      setOpts({
        languages:d.languages?.length?d.languages:fallbackLangs,
        topics:d.topics?.length?d.topics:fallbackTopics,
        categories:d.categories||[]
      });
    }).catch(()=>{});
  },[type]);
  return opts;
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
      if(user&&sessionStorage.getItem('billing-next-plan')){sessionStorage.removeItem('billing-next-plan');updatePath(`/${lang()}/pricing`)}
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
  const rankingPage=page==='ranking'||page==='official';
  const namesForType=boardNames(type||'github-repo');
  const navigate=(e,target,query)=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();const [pathOnly,q]=String(target).split('?');updatePath(pathOnly,query||q||'');};
  const rankingQuery=page==='charts'?location.search.slice(1):'';
  const chartsQuery=page==='trending'||rankingPage?footerChartsQuery:page==='charts'?location.search.slice(1):'';
  const activeType=type||'github-repo';
  const subscribePath=`/${l}/home#subscribe`;
  const openSubscribe=e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    const target=document.getElementById('subscribe');
    if(target&&page==='home'){
      history.pushState({},'',subscribePath);
      target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    }else updatePath(`/${l}/home#subscribe`);
  };
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
  return <><header className="site-header"><div className="header-inner"><a className="brand" href={`/${l}/home`} onClick={e=>navigate(e,`/${l}/home`)}>Trend Top</a><HeaderSearch l={l} t={t} navigate={navigate} q={page==='search'?params().get('q')||'':''}/><nav className="header-actions" aria-label={l==='zh'?'站点导航':'Site navigation'}><a className="header-link" href={`/${l}/home`} onClick={e=>navigate(e,`/${l}/home`)} aria-current={page==='home'?'page':undefined}>{l==='zh'?'首页':'Home'}</a><a className="header-link" href={subscribePath} onClick={openSubscribe}>{l==='zh'?'订阅':'Subscribe'}</a><a className="header-link" href={`/${l}/pricing`} onClick={e=>navigate(e,`/${l}/pricing`)} aria-current={page==='pricing'?'page':undefined}>{l==='zh'?'价格':'Pricing'}</a><a className="header-link" aria-current={page==='method'?'page':undefined} href={`/${l}/method`} onClick={e=>navigate(e,`/${l}/method`)}>{t.method}</a>{viewer?.isAdmin&&<a className="header-link" href={`/${l}/admin`} onClick={e=>navigate(e,`/${l}/admin`)} aria-current={page==='admin'?'page':undefined}>Admin</a>}{viewer?<a className="header-avatar" href={`/${l}/account`} onClick={e=>navigate(e,`/${l}/account`)} aria-current={page==='account'?'page':undefined} title={viewer.email} aria-label={`${l==='zh'?'账户':'Account'}: ${viewer.email}`}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20.5c0-3.6 3.6-6 8-6s8 2.4 8 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></a>:<a className="header-link header-signin" href={`/${l}/account`} onClick={e=>navigate(e,`/${l}/account`)} aria-current={page==='account'?'page':undefined}>{l==='zh'?'登录':'Sign in'}</a>}</nav></div>{showViewBar&&<ViewBar l={l} type={type} page={page} query={page==='charts'?location.search.slice(1):chartsQuery} navigate={navigate}/>}</header>
  {languageSuggestion&&<aside className="locale-suggestion" role="status"><span>{languageSuggestion==='zh'?'浏览器语言为中文，是否切换到简体中文？':'Your browser uses English. Switch to English?'}</span><button type="button" className="locale-choice" onClick={switchLanguage}>{languageSuggestion==='zh'?'切换中文':'Switch to English'}</button><button type="button" className="locale-dismiss" onClick={dismissLanguageSuggestion} aria-label={languageSuggestion==='zh'?'关闭语言提示':'Dismiss language suggestion'}>×</button></aside>}
  {page==='account'?<AccountPage l={l}/>:page==='pricing'?<PricingPage l={l} user={viewer} navigate={target=>updatePath(target)}/>:page==='billing'&&route.id==='success'?<BillingResultPage l={l} status="success"/>:page==='billing'&&route.id==='cancel'?<BillingResultPage l={l} status="cancel"/>:page==='terms'?<LegalPage l={l} kind="terms"/>:page==='privacy'?<LegalPage l={l} kind="privacy"/>:page==='admin'?<AdminPage l={l}/>:page==='verify'?<Verify l={l} t={t}/>:page==='manage'||page==='unsubscribe'?<Manage l={l} t={t} unsubscribe={page==='unsubscribe'}/>:page==='method'?<Method l={l} t={t}/>:page==='search'?<SearchPage l={l} t={t} q={params().get('q')||''} typeFilter={params().get('type')||''} navigate={navigate}/>:page==='home'?<><TypeHome l={l} t={t} navigate={navigate}/><SubscribeCallout l={l} t={t} data={{mailReady:true}} board="hot" type="github-repo"/></>:page==='trending'?<><TypeTrending l={l} t={t} type={type} navigate={navigate}/><SubscribeCallout l={l} t={t} data={{mailReady:true}} board="hot" type={type}/></>:page==='category'?<CategoryPage l={l} t={t} type={type} category={route.category} navigate={navigate}/>:page==='compare'?<ComparePage l={l} t={t} type={type} ids={params().get('ids')||''} navigate={navigate}/>:page==='detail'?<ItemDetail l={l} t={t} type={type} id={route.id} navigate={navigate}/>:page==='charts'?<React.Suspense fallback={<main className="simple-page">{t.loading}</main>}><AnalyticsPage l={l} names={namesForType} updatePath={updatePath} type={type} key={type}/></React.Suspense>:<Home l={l} t={t} rankingOnly={rankingPage} type={type} officialOnly={page==='official'} initialBoard={params().get('board')||(page==='official'?'official':'hot')} autoBoard={false} onChartsQueryChange={setFooterChartsQuery} key={path}/>}
  <SiteFooter l={l} t={t} onLanguageSwitch={switchLanguage}/></>;
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
function SiteFooter({l,t,onLanguageSwitch}){
  const [siteSettings,setSiteSettings]=useState(null);
  useEffect(()=>{fetch('/api/site-settings').then(response=>response.ok?response.json():null).then(setSiteSettings).catch(()=>{})},[]);
  const navigate=(e,path,query)=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    updatePath(path,query);
  };
  const contactLinks=[];
  if(siteSettings?.contact?.email)contactLinks.push({name:'email',href:`mailto:${siteSettings.contact.email}`,title:`${SOCIAL_ICONS.email[l]}: ${siteSettings.contact.email}`});
  for(const [name,url] of Object.entries(siteSettings?.social||{})){if(url&&SOCIAL_ICONS[name])contactLinks.push({name,href:url,title:SOCIAL_ICONS[name][l],external:true})}
  const languages=[['en','English'],['zh','简体中文']];
  return <footer className="footer site-footer">
    <div className="footer-main"><div className="footer-identity"><strong className="footer-wordmark">Trend Top</strong><p className="footer-tagline">{l==='zh'?'发现开源世界的新动向。':'Find what is moving in open source.'}</p>{contactLinks.length>0&&<ul className="footer-social" aria-label={l==='zh'?'联系方式':'Contact'}>{contactLinks.map(link=><li key={link.name}><a href={link.href} title={link.title} aria-label={link.title} {...(link.external?{target:'_blank',rel:'noreferrer'}:{})}><SocialIcon name={link.name}/></a></li>)}</ul>}</div></div>
    <div className="footer-bottom"><div className="footer-bottom-copy"><p>{t.foot}</p><nav className="footer-legal" aria-label={l==='zh'?'法律信息':'Legal'}><a href={`/${l}/privacy`} onClick={e=>navigate(e,`/${l}/privacy`)}>{l==='zh'?'隐私':'Privacy'}</a><a href={`/${l}/terms`} onClick={e=>navigate(e,`/${l}/terms`)}>{l==='zh'?'条款':'Terms'}</a></nav></div><LanguageMenu l={l} languages={languages} onSwitch={onLanguageSwitch}/></div>
  </footer>;
}

function Home({l,t,rankingOnly,type='github-repo',officialOnly=false,initialBoard,autoBoard,onChartsQueryChange}) {
  const autoPending=React.useRef(autoBoard);
  const subscribeHashPending=React.useRef(location.hash==='#subscribe');
  const deckRef=React.useRef(null);
  const [activeScene,setActiveScene]=useState(0);
  const [ctaVisible,setCtaVisible]=useState(false);
  const q0=params();const names=boardNames(type);const [board,setBoard]=useState(()=>{const next=names[initialBoard]?initialBoard:'hot';return officialOnly&&next==='official'?'hot':next;}),[period,setPeriod]=useState(q0.get('period')||(rankingOnly?'week':'day')),[language,setLanguage]=useState(q0.get('language')||''),[topic,setTopic]=useState(q0.get('topic')||''),[age,setAge]=useState(q0.get('age')||''),[q,setQ]=useState(q0.get('q')||''),[page,setPage]=useState(1),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[mode,setMode]=useState(null),[refresh,setRefresh]=useState(0);
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
  useEffect(()=>{setLoading(true);setError('');const query=new URLSearchParams({board,period,language,topic,age,q,page:String(page),limit:'10'});if(officialOnly)query.set('official','1');api(`/api/${type}/rankings?${query}`).then(d=>{setData(prev=>page>1?{...d,items:[...(prev?.items||[]),...d.items]}:d);setMode(d.source==='demo'?'demo':'live');if(autoPending.current&&board==='hot'&&d.source!=='demo'&&d.dataInsufficient){setBoard('stars');setPage(1)}autoPending.current=false}).catch(e=>setError(e.message)).finally(()=>setLoading(false));if(rankingOnly){const path=typePath(l,type,officialOnly?'official':'ranking'),visible=new URLSearchParams({board,period,language,topic,age,q});history.replaceState({},'',path+'?'+visible+location.hash);} },[board,period,language,topic,age,q,page,l,refresh,type,officialOnly]);
  const loadMore=()=>{setLoading(true);if(error)setRefresh(x=>x+1);else setPage(x=>x+1)};
  const chartQuery=new URLSearchParams({board,period,language,topic,age,q}).toString();
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
  {rankingOnly&&<div className="content-grid page-scene" id="rankings"><div className="main-column"><div className="section-heading"><div><h2>{typeLabel(type,l)}</h2><p>{headingCopy}</p></div><span className="section-count">{fmt(data?.total,l)} {typeLabel(type,l)}</span></div>
  <div className="filters"><SearchInput value={q} onChange={x=>{setQ(x);setPage(1)}} label={searchLabel} placeholder={t.searchHint} clearLabel={l==='zh'?'清除搜索':'Clear search'}/><div className="field"><label htmlFor="board">{t.board}</label><DesignSelect id="board" value={board} onChange={x=>{setBoard(x);setPage(1)}} options={boardIds.map(id=>({value:id,label:names[id][idx]}))}/></div><div className="field"><label htmlFor="period">{t.period}</label><DesignSelect id="period" value={period} onChange={x=>{setPeriod(x);setPage(1)}} options={['day','week','month'].map(x=>({value:x,label:t[x]}))}/></div><div className="field"><label htmlFor="language">{t.language}</label><DesignSelect id="language" value={language} onChange={x=>{setLanguage(x);setPage(1)}} options={[{value:'',label:t.allLanguages},...filterOpts.languages.map(x=>({value:x,label:x}))]}/></div><div className="field"><label htmlFor="topic">{t.topic}</label><DesignSelect id="topic" value={topic} onChange={x=>{setTopic(x);setPage(1)}} options={[{value:'',label:t.allTopics},...topicOptions]}/></div><div className="field"><label htmlFor="age">{t.age}</label><DesignSelect id="age" value={age} onChange={x=>{setAge(x);setPage(1)}} options={[{value:'',label:t.allAges},{value:'90',label:t.new90},{value:'30',label:t.new30}]}/></div></div>
  <div className="list-header"><span>{t.rank} / {typeLabel(type,l)}</span><span className="topic-column-header">{t.topic}</span><span className="language-column-header">{t.language}</span><span>{board==='hot'||board==='ai'||board==='topics'||board==='official'?t.score:board==='forks'?t.forks:board==='stars'?t.stars:t.gain}</span><span>{t.stars}</span><span>{t.gain}</span><span>{t.forks}</span></div>{loading&&!keepRowsWhilePaging?<div className="skeletons" aria-label={t.loading}>{[1,2,3,4,5].map(x=><div key={x}/>)}</div>:error&&!keepRowsWhilePaging?<div className="state"><p>{t.error}</p><button onClick={()=>setRefresh(x=>x+1)}>{t.retry}</button></div>:data?.items.length?<><div className="repo-list">{data.items.map(r=><RepoRow key={r.id} r={r} l={l} t={t} board={board} type={type} period={period} language={language} topic={topic} age={age} q={q} officialOnly={officialOnly}/>)}</div>{data.items.length<data.total&&<button className="more" type="button" disabled={loading} aria-busy={loading} onClick={loadMore}>{loading?(l==='zh'?'加载中…':'Loading…'):error?t.retry:t.more}</button>}{error&&keepRowsWhilePaging&&<p className="pagination-error" role="status">{t.error}</p>}</>:<div className="state">{data?.dataInsufficient?t.insufficient:t.empty}</div>}</div>
  <SubscribeCallout l={l} t={t} data={data} board={board} type={type}/>
  </div>}
  {!rankingOnly&&<nav className={`page-indicator${ctaVisible?' is-hidden-at-end':''}`} aria-label={l==='zh'?'页面导航':'Page navigation'}>{(l==='zh'?['首页','图表']:['Intro','Charts']).map((label,index)=><button key={label} type="button" className={activeScene===index?'active':''} onClick={()=>goScene(index)} aria-label={label} aria-current={activeScene===index?'page':undefined}><span/></button>)}</nav>}
  </main>;
}


function SubscribeCallout({l,t,data,board,type='github-repo'}){
  const zh=l==='zh';
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
        <SubscribeDialog trigger={<button className="primary subscribe-cta-button" type="button">{zh?'设置每日摘要':'Set up your digest'} <span aria-hidden="true">↗</span></button>} title={zh?'设置每日摘要':'Set up your daily digest'} description={data?.mailReady?(zh?'注册并验证邮箱后，可以随时登录管理订阅。':'Register and verify your email, then manage your digest from your account.'):t.mailPending}>{data?.mailReady?<AccountSubscribeForm l={l} currentBoard={board} currentType={type}/>:null}</SubscribeDialog>
        <p className="subscribe-cta-fineprint">{zh?'Pro 功能；每天最多一封，随时可以暂停或退订。':'Included with Pro. At most one email per day; pause or unsubscribe anytime.'}</p>
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

function RepoRow({r,l,t,board,type='github-repo',period='week',language='',topic='',age='',q='',officialOnly=false}){
  const key=board==='stars'?r.stars:board==='forks'?r.forks:['hot','ai','topics','official'].includes(board)?r.score:r.gain;
  const change=r.gain!==null&&r.prevGain!==null?r.gain-r.prevGain:null;
  const id=r.slug||r.id;
  const topics=visibleTopics(r);
  const orderedTopics=topic&&topics.includes(topic)?[topic,...topics.filter(value=>value!==topic)]:topics;
  const displayTopics=orderedTopics.slice(0,5);
  const navigate=(e,path,query)=>{e.preventDefault();updatePath(path,query);};
  const filterQuery=(overrides={})=>{
    const next=new URLSearchParams();
    if(board) next.set('board',board);
    if(period) next.set('period',period);
    if(age) next.set('age',age);
    if(q) next.set('q',q);
    if(officialOnly) next.set('official','1');
    if(overrides.language) next.set('language',overrides.language);
    if(overrides.topic) next.set('topic',overrides.topic);
    return next.toString();
  };
  const filterPath=typePath(l,type,'ranking');
  const topicLink=(value)=>filterQuery({topic:value});
  const languageLink=(value)=>filterQuery({language:value});
  return <article className="repo-row">
    <div className="repo-identity">
      <span className="rank-num">{String(r.rank).padStart(2,'0')}</span>
      <div>
        <a className="repo-name" href={itemPath(l,type,id)} onClick={e=>{e.preventDefault();updatePath(itemPath(l,type,id))}}>{r.full_name} <span>↗</span></a>
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
function Manage({l,t,unsubscribe}){
  const [item,setItem]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState('');
  const tok=params().get('token');
  const filterOpts=useFilterOptions();
  useEffect(()=>{api(`/api/manage?token=${encodeURIComponent(tok||'')}`).then(async v=>{
    if(unsubscribe){await post('/api/unsubscribe',{token:tok});setItem({...v,status:'cancelled'});setMessage(t.cancelled)}else setItem(v);
  }).catch(()=>setError(t.manageError))},[tok]);
  const action=async status=>{try{if(status==='cancelled') await post('/api/unsubscribe',{token:tok});else await post('/api/manage',{token:tok,status},'PATCH');setItem(x=>({...x,status}));setMessage(status==='cancelled'?t.cancelled:status==='paused'?t.pause:t.resume)}catch(e){setError(e.message)}};
  const save=async e=>{e.preventDefault();try{await post('/api/manage',{token:tok,boards:item.boards,sendHour:Number(item.sendHour),timezone:item.timezone,locale:item.locale,language:(item.languages||[])[0]||item.language||'',languages:item.languages||[],topics:item.topics||[],topic:(item.topics||[])[0]||item.topic||''},'PATCH');setMessage(t.save)}catch(e){setError(e.message)}};
  if(error)return <main className="simple-page"><h1>{error}</h1></main>;
  if(!item)return <main className="simple-page">{t.loading}</main>;
  const manageTopics=Array.isArray(item.topics)?item.topics:(item.topic?[item.topic]:[]);
  const manageLanguages=Array.isArray(item.languages)?item.languages:(item.language?String(item.language).split(',').map(x=>x.trim()).filter(Boolean):[]);
  const topicOptions=optionList(filterOpts.topics,l);
  return <main className="simple-page"><h1>{t.manage}</h1><p>{item.email} · {item.status==='active'?(l==='zh'?'已启用':'Active'):item.status==='paused'?(l==='zh'?'已暂停':'Paused'):t.cancelled}</p>{unsubscribe?<p role="status">{t.cancelled}</p>:<form onSubmit={save} className="subscribe-form"><fieldset><legend>{t.boards}</legend><div className="checks">{Object.keys(names).map(x=><label key={x}><input type="checkbox" checked={item.boards.includes(x)} onChange={()=>setItem(v=>({...v,boards:v.boards.includes(x)?v.boards.filter(y=>y!==x):[...v.boards,x]}))}/>{names[x][localeIndex(l)]}</label>)}</div></fieldset><div className="form-grid"><div className="field"><label htmlFor="manage-language">{t.language}</label><TopicMultiSelect id="manage-language" value={manageLanguages} onChange={x=>setItem({...item,languages:x,language:x[0]||''})} options={optionList(filterOpts.languages,l)} placeholder={t.allLanguages} ariaLabel={t.language}/></div><div className="field"><label htmlFor="manage-topic">{t.topic}</label><TopicMultiSelect id="manage-topic" value={manageTopics} onChange={x=>setItem({...item,topics:x})} options={topicOptions} placeholder={t.allTopics} ariaLabel={t.topic}/></div><div className="field"><label htmlFor="manage-hour">{t.send}</label><DesignSelect id="manage-hour" value={item.sendHour} onChange={x=>setItem({...item,sendHour:x})} options={Array.from({length:24},(_,i)=>({value:String(i),label:`${String(i).padStart(2,'0')}:00`}))}/></div><div className="field"><label htmlFor="manage-zone">{t.timezone}</label><DesignSelect id="manage-zone" value={item.timezone||browserTimezone()} onChange={x=>setItem({...item,timezone:x})} options={timezoneOptions(item.timezone||browserTimezone())}/></div><div className="field"><label htmlFor="manage-locale">{t.mailLocale}</label><DesignSelect id="manage-locale" value={item.locale} onChange={x=>setItem({...item,locale:x})} options={[{value:'zh',label:'简体中文'},{value:'en',label:'English'}]}/></div></div><div className="manage-actions"><button className="primary">{t.save}</button>{item.status==='active'?<button type="button" className="ghost" onClick={()=>action('paused')}>{t.pause}</button>:item.status==='paused'?<button type="button" className="ghost" onClick={()=>action('active')}>{t.resume}</button>:null}<button type="button" className="danger" onClick={()=>action('cancelled')}>{t.cancel}</button></div></form>}{message&&<p role="status">{message}</p>}</main>;
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
      <article><h2>{zh?'如何阅读 AI 榜？':'How is the AI board selected?'}</h2><p>{zh?'根据仓库公开的主题与简介识别 AI 相关项目。若分类不准确，可在项目详情页提交反馈。':'AI-related projects are identified from public repository topics and descriptions. You can report a mismatch on a project page.'}</p></article>
    </div></div>
  </main>;
}

if(!/^\/(zh|en)(\/|$)/.test(location.pathname)){const first=localStorage.getItem('locale')==='zh'?'zh':'en';history.replaceState({},'',`/${first}${location.pathname==='/'?'/home':location.pathname}${location.search}`)}else if(/^\/(zh|en)\/?$/.test(location.pathname)){history.replaceState({},'',`/${lang()}/home${location.search}`)}
createRoot(document.getElementById('root')).render(<App/>);
