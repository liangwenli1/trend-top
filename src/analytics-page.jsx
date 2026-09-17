import {DesignSelect} from './components.jsx';
import {itemPath} from './catalog.js';
import {USE_CASES} from '../shared/taxonomy.js';
import {scatterSamples,starTiles,dayBuckets} from '../shared/chart-view.js';
import React,{useEffect,useMemo,useState} from 'react';
import {Area,AreaChart,Bar,BarChart,CartesianGrid,Cell,Legend,Pie,PieChart,ResponsiveContainer,Scatter,ScatterChart,Tooltip,Treemap,XAxis,YAxis} from 'recharts';

const palette=['#315fd9','#151515','#606060','#898989','#aaaaaa','#d1d1d1','#e4e4e4'];
const words={
  en:{back:'Back to rankings',title:'Explore the data.',intro:'More ways to see which open-source items are moving.',board:'Board',period:'Time window',sample:'Items in this view',updated:'Updated',source:'Public source data',demo:'Demo data',loading:'Loading charts…',error:'Charts could not be loaded.',retry:'Try again',empty:'No items match these filters.',historyEmpty:'Not enough daily history for this view yet.',comparisonEmpty:'Previous-period history is not available yet.',filter:'Active filters',clear:'Clear filters',leader:'Leading item',cumulative:'Cumulative new Stars',cumulativeNote:'Daily total for the leading item',daily:'Daily new Stars',dailyNote:'Daily additions for the leading item',topGrowth:'Fastest growing items',topGrowthNote:'New Stars in the selected period · top 10 of the displayed sample',languages:'Language mix',languagesNote:'Share of the items in this view',scatter:'Stars and Forks',scatterNote:'Each point is one item · axes show total counts',treemap:'Where the Stars are',treemapNote:'Total Stars across the 12 largest items in this view',comparison:'Current vs previous period',comparisonNote:'New Stars for items with both periods available',topics:'Popular topics',topicsNote:'Most frequent source topics in this view',ages:'Item age',agesNote:'Number of items by time since creation',activity:'Last updated',activityNote:'Items grouped by time since their latest recorded update',projects:'items',stars:'Stars',forks:'Forks',newStars:'New Stars',previous:'Previous',current:'Current',other:'Other',unknown:'Unknown',metricEmpty:'No measured values are available for this chart.',filterNames:{language:'Language',topic:'Topic',useCase:'Use case',age:'Item age',q:'Search',official:'Official'},ageLabels:['0–30d','31–90d','91–365d','1–3y','3y+'],activityLabels:['≤1d','2–7d','8–30d','31–90d','90d+'],sceneNames:['Overview','Momentum','Item mix','Star distribution','Comparisons','Item profile'],topNote:'Charts use the first {count} {unit} from this board, not the full catalog. Trends require complete daily history.'},
  zh:{back:'返回榜单',title:'从数据里发现趋势。',intro:'用更多视角，看清哪些开源条目正在增长。',board:'榜单',period:'时间窗口',sample:'当前视图条目',updated:'更新于',source:'公开来源数据',demo:'演示数据',loading:'正在加载图表…',error:'图表加载失败。',retry:'重试',empty:'当前筛选没有条目。',historyEmpty:'当前视图暂无足够的每日历史数据。',comparisonEmpty:'暂无可用的上一周期数据。',filter:'已启用筛选',clear:'清除筛选',leader:'领跑条目',cumulative:'累计新增 Star',cumulativeNote:'领跑条目每日累计值',daily:'每日新增 Star',dailyNote:'领跑条目每天获得的 Star',topGrowth:'增长最快的条目',topGrowthNote:'所选周期新增 Star · 当前样本前 10 名',languages:'语言分布',languagesNote:'当前视图中条目的语言占比',scatter:'Star 与 Fork',scatterNote:'每个点代表一个条目 · 坐标为累计数量',treemap:'Star 集中在哪些条目',treemapNote:'当前视图 Star 总数最高的 12 个条目',comparison:'本期与上期对比',comparisonNote:'具有完整两期数据的条目新增 Star',topics:'热门主题',topicsNote:'当前视图中出现最多的来源主题',ages:'条目年龄',agesNote:'按创建时间分组的条目数量',activity:'最近更新',activityNote:'按距最近一次记录更新时间分组',projects:'条目',stars:'Star',forks:'Fork',newStars:'新增 Star',previous:'上期',current:'本期',other:'其他',unknown:'未知',metricEmpty:'当前图表暂无可用的实测数据。',filterNames:{language:'编程语言',topic:'主题',useCase:'用途',age:'条目年龄',q:'搜索',official:'官方来源'},ageLabels:['0–30天','31–90天','91–365天','1–3年','3年以上'],activityLabels:['≤1天','2–7天','8–30天','31–90天','90天以上'],sceneNames:['总览','增长动向','条目构成','Star 分布','周期对比','条目画像'],topNote:'图表使用该榜单前 {count} 个条目，不代表完整目录。趋势图仅展示历史数据完整的条目。'}
};
const num=(value,l)=>new Intl.NumberFormat(l==='zh'?'zh-CN':'en-US').format(value??0);
const itemUnit=(count,l,t)=>l==='en'&&count===1?'item':t.projects;
const short=value=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(value??0);
const tooltipStyle={background:'#fff',border:'1px solid #dedede',borderRadius:0,color:'#111',fontSize:16,boxShadow:'0 10px 30px #0001'};
const compactName=name=>String(name).split('/').pop();
function ChartFrame({title,note,children,wide=false}){return <article className={`analytics-card${wide?' analytics-card-wide':''}`}><div className="analytics-card-title"><h2>{title}</h2><p>{note}</p></div>{children}</article>}
function Empty({children}){return <div className="analytics-empty">{children}</div>}
function Axis({yName}){return <><CartesianGrid vertical={false} stroke="#e9e9e9"/><XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fill:'#777',fontSize:15}} axisLine={false} tickLine={false} minTickGap={25}/><YAxis tickFormatter={short} tick={{fill:'#777',fontSize:15}} axisLine={false} tickLine={false} width={58} name={yName}/></>}
function Tile(props){const {x,y,width,height,name,index,value}=props;if(!width||!height)return null;const shade=index%palette.length,dark=shade<3;const titleSize=width>=240?20:width>=160?17:14;const valueSize=width>=240?17:width>=160?15:13;const fullName=compactName(name);const maxChars=Math.max(3,Math.floor((width-22)/(titleSize*.56)));const label=fullName.length>maxChars?`${fullName.slice(0,maxChars-1)}…`:fullName;return <g><title>{name}: {short(value)} Stars</title><rect x={x} y={y} width={width} height={height} fill={palette[shade]} stroke="#fff" strokeWidth={3} rx={7}/>{width>95&&height>42&&<text x={x+11} y={y+titleSize+5} fill={dark?'#fff':'#111'} fontSize={titleSize} fontWeight={650}>{label}</text>}{width>95&&height>60&&<text x={x+11} y={y+titleSize+valueSize+9} fill={dark?'#ffffffe8':'#262626'} fontSize={valueSize} fontWeight={550} fontVariant="tabular-nums">{short(value)} ★</text>}</g>}
function ProjectTooltip({active,payload,l,t}){if(!active||!payload?.length)return null;const item=payload[0].payload;return <div className="analytics-tooltip"><strong>{item.full_name||item.name}</strong><span>{t.stars}: {num(item.stars,l)}</span><span>{t.forks}: {num(item.forks,l)}</span></div>}
function LanguageTooltip({active,payload,l,t,total}){if(!active||!payload?.length)return null;const item=payload[0].payload;return <div className="analytics-tooltip analytics-language-tooltip"><strong>{item.name==='Other'?t.other:item.name}</strong><span>{num(item.count,l)} {itemUnit(item.count,l,t)}{total>0&&` · ${new Intl.NumberFormat(l==='zh'?'zh-CN':'en-US',{style:'percent',maximumFractionDigits:1}).format(item.count/total)}`}</span></div>}

export function AnalyticsPage({l,names,updatePath,type='github-repo'}){
  const init=new URLSearchParams(location.search);
  const [board,setBoard]=useState(names[init.get('board')]?init.get('board'):'hot');
  const [period,setPeriod]=useState(['day','week','month'].includes(init.get('period'))?init.get('period'):'week');
  const [filters,setFilters]=useState({language:init.get('language')||'',topic:init.get('topic')||'',useCase:init.get('useCase')||'',age:init.get('age')||'',q:init.get('q')||'',official:init.get('official')||''});
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[revision,setRevision]=useState(0);
  const [activeScene,setActiveScene]=useState(0);
  const t=words[l],index=l==='zh'?0:1;
  useEffect(()=>{
    const controller=new AbortController();
    const query=new URLSearchParams({board,period,...filters});
    history.replaceState({},'',`/${l}/${type}/charts?${query}`);window.dispatchEvent(new PopStateEvent('popstate'));
    setLoading(true);setError(false);
    const chartQuery=new URLSearchParams(query);chartQuery.set('includeRanking','1');
    fetch(`/api/${type}/charts?${chartQuery}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('charts');return response.json()}).then(chart=>setData({chart,ranking:chart.ranking})).catch(e=>{if(e.name!=='AbortError')setError(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[board,period,filters,l,revision,type]);
  const chart=data?.chart, ranking=data?.ranking, items=ranking?.items||[];
  const series=chart?.points||[];
  const daily=useMemo(()=>series.slice(1).map((p,i)=>({date:p.date,value:p.gain===null||series[i].gain===null?null:p.gain-series[i].gain})),[chart]);
  const growth=useMemo(()=>items.filter(r=>r.gain!==null&&!r.anomaly).sort((a,b)=>b.gain-a.gain).slice(0,10),[ranking]);
  const languages=chart?.languages||[];
  const scatter=useMemo(()=>scatterSamples(items),[ranking]);
  const tiles=useMemo(()=>starTiles(items),[ranking]);
  const compare=useMemo(()=>items.filter(r=>r.gain!==null&&r.prevGain!==null&&!r.anomaly).sort((a,b)=>b.gain-a.gain).slice(0,8).map(r=>({name:compactName(r.full_name),full_name:r.full_name,current:r.gain,previous:r.prevGain})),[ranking]);
  const topics=useMemo(()=>{const counts=new Map();items.forEach(r=>(r.topics||[]).forEach(topic=>counts.set(topic,(counts.get(topic)||0)+1)));return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>({name,count}))},[ranking]);
  const ages=useMemo(()=>dayBuckets(items,'ageDays',[30,90,365,1095],t.ageLabels,t.unknown),[ranking,l]);
  const activity=useMemo(()=>dayBuckets(items,'pushDays',[1,7,30,90],t.activityLabels,t.unknown),[ranking,l]);
  const leaderItem=items.find(item=>item.full_name===chart?.leader);
  const activeFilters=Object.entries(filters).filter(([,value])=>value);
  const historyReady=!chart?.insufficient&&series.length>1;
  const hasCharts=!loading&&!error&&items.length>0;
  useEffect(()=>{
    if(!hasCharts)return;
    const scenes=[...document.querySelectorAll('.analytics-page .analytics-scene')];
    let frame=0;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const center=77+(innerHeight-77)/2;
      let active=scenes.findIndex(scene=>{const rect=scene.getBoundingClientRect();return rect.top<=center&&rect.bottom>center});
      if(active<0)active=scenes.reduce((last,scene,i)=>scene.getBoundingClientRect().top<=center?i:last,0);
      scenes.forEach((scene,i)=>{if(i===active)scene.classList.add('is-visible')});
      setActiveScene(active);
    })};
    addEventListener('scroll',update,{passive:true});addEventListener('resize',update,{passive:true});update();
    return()=>{removeEventListener('scroll',update);removeEventListener('resize',update);cancelAnimationFrame(frame)};
  },[hasCharts]);
  useEffect(()=>{
    if(!hasCharts)return;
    const desktop=matchMedia('(min-width: 901px)');
    const scenes=[...document.querySelectorAll('.analytics-page .analytics-scene')];
    let lastTurn=0;
    const onWheel=e=>{
      if(!desktop.matches||e.ctrlKey||e.shiftKey||Math.abs(e.deltaY)<20||(e.target instanceof Element&&e.target.closest('select,input,textarea,[role="listbox"],dialog')))return;
      const center=77+(innerHeight-77)/2;
      let current=scenes.findIndex(scene=>{const rect=scene.getBoundingClientRect();return rect.top<=center&&rect.bottom>center});
      if(current<0)current=scenes.reduce((last,scene,i)=>scene.getBoundingClientRect().top<=center?i:last,0);
      if(current===scenes.length-1&&e.deltaY<0&&scenes.at(-1).getBoundingClientRect().bottom<innerHeight-8){
        e.preventDefault();scenes.at(-1).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});lastTurn=Date.now();return;
      }
      const next=Math.max(0,Math.min(scenes.length-1,current+Math.sign(e.deltaY)));
      if(next===current)return;
      e.preventDefault();
      if(Date.now()-lastTurn<950)return;
      if(next!==current){lastTurn=Date.now();scenes[next].scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}
    };
    addEventListener('wheel',onWheel,{passive:false});
    return()=>removeEventListener('wheel',onWheel);
  },[hasCharts]);
  const goScene=i=>document.getElementById(`chart-page-${i+1}`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  return <main className="analytics-page"><section className="analytics-scene analytics-scene-lead is-visible" id="chart-page-1"><div className="analytics-top"><div className="analytics-lead"><div><h1>{t.title}</h1><p className="analytics-intro">{t.intro}</p></div><div className="analytics-stat"><strong>{loading?'—':num(ranking?.items.length,l)}</strong><span>{t.sample}</span></div></div><div className="analytics-controls"><label>{t.board}<DesignSelect id="chart-board" value={board} onChange={setBoard} options={Object.entries(names).map(([id,label])=>({value:id,label:label[index]}))}/></label><label>{t.period}<DesignSelect id="chart-period" value={period} onChange={setPeriod} options={[{value:'day',label:l==='zh'?'日':'Day'},{value:'week',label:l==='zh'?'周':'Week'},{value:'month',label:l==='zh'?'月':'Month'}]}/></label>{activeFilters.length>0&&<div className="analytics-active-filters"><span>{t.filter}: {activeFilters.map(([key,value])=>`${t.filterNames[key]||key} · ${key==='useCase'?(USE_CASES[value]?.[l]||value):key==='official'?(l==='zh'?'仅官方':'Only official'):value}`).join(' / ')}</span><button type="button" onClick={()=>setFilters({language:'',topic:'',useCase:'',age:'',q:'',official:''})}>{t.clear}</button></div>}</div></div>
  {error?<div className="analytics-state" role="alert">{t.error} <button type="button" onClick={()=>setRevision(v=>v+1)}>{t.retry}</button></div>:loading?<div className="analytics-loading" role="status">{t.loading}</div>:items.length===0?<div className="analytics-state">{t.empty}</div>:<><div className="analytics-meta"><span>{t.topNote.replace('{count}',num(items.length,l)).replace('{unit}',itemUnit(items.length,l,t))}</span>{ranking?.updatedAt&&<span>{t.updated} {new Date(ranking.updatedAt).toLocaleDateString(l==='zh'?'zh-CN':'en-US')}</span>}</div><div className="analytics-scene-body analytics-single">
    <ChartFrame title={t.cumulative} note={t.cumulativeNote} wide><>{leaderItem&&<a className="analytics-leader" href={itemPath(l,type,leaderItem.slug||leaderItem.id)}><small>{t.leader}</small><strong>{chart.leader} ↗</strong></a>}{historyReady?<div className="analytics-plot analytics-plot-wide" role="img" aria-label={`${t.cumulative}: ${chart.leader}`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{top:12,right:12,bottom:0,left:0}}><Axis/><Tooltip formatter={v=>[num(v,l),t.newStars]} contentStyle={tooltipStyle}/><Area type="monotone" dataKey="gain" stroke="#315fd9" fill="#315fd921" strokeWidth={3} dot={series.length<10?{r:3,fill:'#315fd9'}:false} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>:<Empty>{t.historyEmpty}</Empty>}</></ChartFrame>
  </div></>}</section>
  {hasCharts&&<>
  <section className="analytics-scene" id="chart-page-2"><div className="analytics-scene-label"><span>02 / 06</span><strong>{t.sceneNames[1]}</strong></div><div className="analytics-scene-body analytics-pair">
    <ChartFrame title={t.daily} note={t.dailyNote}><>{historyReady&&daily.some(x=>x.value!==null)?<div className="analytics-plot" role="img" aria-label={t.daily}><ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{top:12,right:8,bottom:0,left:0}}><Axis/><Tooltip formatter={v=>[num(v,l),t.newStars]} contentStyle={tooltipStyle}/><Bar dataKey="value" fill="#315fd9" maxBarSize={44} radius={[4,4,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>:<Empty>{t.historyEmpty}</Empty>}</></ChartFrame>
    <ChartFrame title={t.topGrowth} note={t.topGrowthNote}><>{growth.length?<ol className="analytics-rank-bars">{growth.map((r,i)=><li key={r.id}><div><span>{String(i+1).padStart(2,'0')}</span><a href={r.url} target="_blank" rel="noopener noreferrer">{r.full_name}</a><strong>+{num(r.gain,l)}</strong></div><i style={{width:`${Math.max(2,r.gain/Math.max(1,growth[0].gain)*100)}%`}}/></li>)}</ol>:<Empty>{t.historyEmpty}</Empty>}</></ChartFrame>
  </div></section>
  <section className="analytics-scene" id="chart-page-3"><div className="analytics-scene-label"><span>03 / 06</span><strong>{t.sceneNames[2]}</strong></div><div className="analytics-scene-body analytics-pair">
    <ChartFrame title={t.languages} note={t.languagesNote}><>{languages.length?<div className="analytics-donut-wrap"><div className="analytics-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={languages} dataKey="count" nameKey="name" innerRadius="57%" outerRadius="88%" stroke="#fff" strokeWidth={3} isAnimationActive={false}>{languages.map((r,i)=><Cell key={r.name} fill={palette[i%palette.length]}/>)}</Pie><Tooltip content={props=><LanguageTooltip {...props} l={l} t={t} total={items.length}/>} position={{x:8,y:8}} wrapperStyle={{pointerEvents:'none'}}/></PieChart></ResponsiveContainer><div className="analytics-donut-center"><strong>{items.length}</strong><span>{itemUnit(items.length,l,t)}</span></div></div><ul className="analytics-legend">{languages.map((r,i)=><li key={r.name}><i style={{background:palette[i%palette.length]}}/><span>{r.name==='Other'?t.other:r.name}</span><strong>{num(r.count,l)}</strong></li>)}</ul></div>:<Empty>{t.empty}</Empty>}</></ChartFrame>
    <ChartFrame title={t.scatter} note={t.scatterNote}>{scatter.length?<div className="analytics-plot" role="img" aria-label={t.scatter}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:14,right:14,bottom:10,left:0}}><CartesianGrid stroke="#e9e9e9"/><XAxis type="number" dataKey="stars" name={t.stars} tickFormatter={short} tick={{fill:'#777',fontSize:13}} domain={[0,'dataMax']} axisLine={false} tickLine={false}/><YAxis type="number" dataKey="forks" name={t.forks} tickFormatter={short} tick={{fill:'#777',fontSize:13}} width={52} axisLine={false} tickLine={false}/><Tooltip cursor={{strokeDasharray:'3 3'}} content={props=><ProjectTooltip {...props} l={l} t={t}/>}/><Scatter data={scatter} fill="#315fd9" isAnimationActive={false}/></ScatterChart></ResponsiveContainer></div>:<Empty>{t.metricEmpty}</Empty>}</ChartFrame>
  </div></section>
  <section className="analytics-scene" id="chart-page-4"><div className="analytics-scene-label"><span>04 / 06</span><strong>{t.sceneNames[3]}</strong></div><div className="analytics-scene-body analytics-single">
    <ChartFrame title={t.treemap} note={t.treemapNote} wide>{tiles.length?<div className="analytics-plot analytics-plot-treemap" role="img" aria-label={t.treemap}><ResponsiveContainer width="100%" height="100%"><Treemap data={tiles} dataKey="size" nameKey="name" aspectRatio={1.8} content={<Tile/>} isAnimationActive={false}><Tooltip formatter={v=>[num(v,l),t.stars]} contentStyle={tooltipStyle}/></Treemap></ResponsiveContainer></div>:<Empty>{t.metricEmpty}</Empty>}<div className="analytics-tile-links">{tiles.slice(0,4).map(r=><a href={r.url} target="_blank" rel="noopener noreferrer" key={r.name}>{r.name} ↗</a>)}</div></ChartFrame>
  </div></section>
  <section className="analytics-scene" id="chart-page-5"><div className="analytics-scene-label"><span>05 / 06</span><strong>{t.sceneNames[4]}</strong></div><div className="analytics-scene-body analytics-pair">
    <ChartFrame title={t.comparison} note={t.comparisonNote}><>{compare.length?<div className="analytics-plot" role="img" aria-label={t.comparison}><ResponsiveContainer width="100%" height="100%"><BarChart data={compare} layout="vertical" margin={{top:5,right:12,bottom:0,left:6}}><CartesianGrid horizontal={false} stroke="#e9e9e9"/><XAxis type="number" tickFormatter={short} tick={{fill:'#777',fontSize:12}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" width={100} tick={{fill:'#555',fontSize:12}} axisLine={false} tickLine={false}/><Tooltip formatter={(v,name)=>[num(v,l),name===t.current?t.current:t.previous]} contentStyle={tooltipStyle}/><Legend verticalAlign="top" height={30}/><Bar name={t.current} dataKey="current" fill="#315fd9" maxBarSize={14} isAnimationActive={false}/><Bar name={t.previous} dataKey="previous" fill="#b8b8b8" maxBarSize={14} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>:<Empty>{t.comparisonEmpty}</Empty>}</></ChartFrame>
    <ChartFrame title={t.topics} note={t.topicsNote}><>{topics.length?<ol className="analytics-topic-bars">{topics.map((r,i)=><li key={r.name}><span>{r.name}</span><div><i style={{width:`${r.count/Math.max(1,topics[0].count)*100}%`,background:palette[i%palette.length]}}/></div><strong>{num(r.count,l)}</strong></li>)}</ol>:<Empty>{t.empty}</Empty>}</></ChartFrame>
  </div></section>
  <section className="analytics-scene" id="chart-page-6"><div className="analytics-scene-label"><span>06 / 06</span><strong>{t.sceneNames[5]}</strong></div><div className="analytics-scene-body analytics-pair">
    <ChartFrame title={t.ages} note={t.agesNote}><div className="analytics-plot" role="img" aria-label={t.ages}><ResponsiveContainer width="100%" height="100%"><BarChart data={ages} margin={{top:12,right:10,bottom:0,left:0}}><CartesianGrid vertical={false} stroke="#e9e9e9"/><XAxis dataKey="name" tick={{fill:'#777',fontSize:12}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:'#777',fontSize:12}} axisLine={false} tickLine={false} width={35}/><Tooltip formatter={v=>[num(v,l),t.projects]} contentStyle={tooltipStyle}/><Bar dataKey="count" fill="#151515" radius={[4,4,0,0]} maxBarSize={55} isAnimationActive={false}/></BarChart></ResponsiveContainer></div></ChartFrame>
    <ChartFrame title={t.activity} note={t.activityNote}><div className="analytics-plot" role="img" aria-label={t.activity}><ResponsiveContainer width="100%" height="100%"><BarChart data={activity} margin={{top:12,right:10,bottom:0,left:0}}><CartesianGrid vertical={false} stroke="#e9e9e9"/><XAxis dataKey="name" tick={{fill:'#777',fontSize:12}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:'#777',fontSize:12}} axisLine={false} tickLine={false} width={35}/><Tooltip formatter={v=>[num(v,l),t.projects]} contentStyle={tooltipStyle}/><Bar dataKey="count" fill="#315fd9" radius={[4,4,0,0]} maxBarSize={55} isAnimationActive={false}/></BarChart></ResponsiveContainer></div></ChartFrame>
  </div></section>
  </>}
  {hasCharts&&activeScene>0&&<button className="analytics-filter-shortcut" type="button" onClick={()=>goScene(0)}>{l==='zh'?'返回筛选 ↑':'Filters ↑'}</button>}
  {hasCharts&&<nav className="analytics-page-nav" aria-label={l==='zh'?'图表页面导航':'Chart page navigation'}>{t.sceneNames.map((label,i)=><button key={label} type="button" className={activeScene===i?'active':''} onClick={()=>goScene(i)} aria-label={`${i+1} / 6 · ${label}`} title={label} aria-current={activeScene===i?'page':undefined}><span/></button>)}</nav>}
  </main>;
}
