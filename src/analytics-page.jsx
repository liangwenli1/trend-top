import {DesignSelect} from './components.jsx';
import React,{useEffect,useMemo,useState} from 'react';
import {Area,AreaChart,Bar,BarChart,CartesianGrid,Cell,Legend,Pie,PieChart,ResponsiveContainer,Scatter,ScatterChart,Tooltip,Treemap,XAxis,YAxis} from 'recharts';

const palette=['#315fd9','#151515','#606060','#898989','#aaaaaa','#d1d1d1','#e4e4e4'];
const words={
  en:{back:'Back to rankings',title:'Explore the data.',intro:'More ways to see which open-source projects are moving.',board:'Board',period:'Time window',sample:'Projects in this view',updated:'Updated',source:'Public GitHub data',demo:'Demo data',loading:'Loading charts…',error:'Charts could not be loaded.',retry:'Try again',empty:'No projects match these filters.',historyEmpty:'Not enough daily history for this view yet.',comparisonEmpty:'Previous-period history is not available yet.',filter:'Active filters',clear:'Clear filters',leader:'Leading project',cumulative:'Cumulative new Stars',cumulativeNote:'Daily total for the leading project',daily:'Daily new Stars',dailyNote:'Daily additions for the leading project',topGrowth:'Fastest growing projects',topGrowthNote:'New Stars in the selected period · top 10 of the displayed sample',languages:'Language mix',languagesNote:'Share of the projects in this view',scatter:'Stars and Forks',scatterNote:'Each point is one project · axes show total counts',treemap:'Where the Stars are',treemapNote:'Total Stars across the 12 largest projects in this view',comparison:'Current vs previous period',comparisonNote:'New Stars for projects with both periods available',topics:'Popular topics',topicsNote:'Most frequent GitHub topics in this view',ages:'Project age',agesNote:'Number of projects by time since creation',activity:'Last pushed',activityNote:'Projects grouped by time since their latest GitHub push',projects:'projects',stars:'Stars',forks:'Forks',newStars:'New Stars',previous:'Previous',current:'Current',other:'Other',ageLabels:['0–30d','31–90d','91–365d','1–3y','3y+'],activityLabels:['≤1d','2–7d','8–30d','31–90d','90d+'],sceneNames:['Overview','Momentum','Project mix','Star distribution','Comparisons','Project profile'],topNote:'Charts use the first {count} projects from this board, not all of GitHub. Trends require complete daily history.'},
  zh:{back:'返回榜单',title:'从数据里发现趋势。',intro:'用更多视角，看清哪些开源项目正在增长。',board:'榜单',period:'时间窗口',sample:'当前视图项目',updated:'更新于',source:'GitHub 公开数据',demo:'演示数据',loading:'正在加载图表…',error:'图表加载失败。',retry:'重试',empty:'当前筛选没有项目。',historyEmpty:'当前视图暂无足够的每日历史数据。',comparisonEmpty:'暂无可用的上一周期数据。',filter:'已启用筛选',clear:'清除筛选',leader:'领跑项目',cumulative:'累计新增 Star',cumulativeNote:'领跑项目每日累计值',daily:'每日新增 Star',dailyNote:'领跑项目每天获得的 Star',topGrowth:'增长最快的项目',topGrowthNote:'所选周期新增 Star · 当前样本前 10 名',languages:'语言分布',languagesNote:'当前视图中项目的语言占比',scatter:'Star 与 Fork',scatterNote:'每个点代表一个项目 · 坐标为累计数量',treemap:'Star 集中在哪些项目',treemapNote:'当前视图 Star 总数最高的 12 个项目',comparison:'本期与上期对比',comparisonNote:'具有完整两期数据的项目新增 Star',topics:'热门主题',topicsNote:'当前视图中出现最多的 GitHub 主题',ages:'项目年龄',agesNote:'按创建时间分组的项目数量',activity:'最近推送时间',activityNote:'按距 GitHub 最近一次推送的时间分组',projects:'项目',stars:'Star',forks:'Fork',newStars:'新增 Star',previous:'上期',current:'本期',other:'其他',ageLabels:['0–30天','31–90天','91–365天','1–3年','3年以上'],activityLabels:['≤1天','2–7天','8–30天','31–90天','90天以上'],sceneNames:['总览','增长动向','项目构成','Star 分布','周期对比','项目画像'],topNote:'图表使用该榜单前 {count} 个项目，不代表整个 GitHub。趋势图仅展示历史数据完整的项目。'}
};
const num=(value,l)=>new Intl.NumberFormat(l==='zh'?'zh-CN':'en-US').format(value??0);
const short=value=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(value??0);
const tooltipStyle={background:'#fff',border:'1px solid #dedede',borderRadius:10,color:'#111',fontSize:16,boxShadow:'0 10px 30px #0001'};
const repoUrl=name=>`https://github.com/${String(name).split('/').map(encodeURIComponent).join('/')}`;
const compactName=name=>String(name).split('/').pop();
function ChartFrame({title,note,children,wide=false}){return <article className={`analytics-card${wide?' analytics-card-wide':''}`}><div className="analytics-card-title"><h2>{title}</h2><p>{note}</p></div>{children}</article>}
function Empty({children}){return <div className="analytics-empty">{children}</div>}
function Axis({yName}){return <><CartesianGrid vertical={false} stroke="#e9e9e9"/><XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fill:'#777',fontSize:15}} axisLine={false} tickLine={false} minTickGap={25}/><YAxis tickFormatter={short} tick={{fill:'#777',fontSize:15}} axisLine={false} tickLine={false} width={58} name={yName}/></>}
function Tile(props){const {x,y,width,height,name,index,value}=props;if(!width||!height)return null;const shade=index%palette.length,dark=shade<3;const titleSize=width>=240?20:width>=160?17:14;const valueSize=width>=240?17:width>=160?15:13;const fullName=compactName(name);const maxChars=Math.max(3,Math.floor((width-22)/(titleSize*.56)));const label=fullName.length>maxChars?`${fullName.slice(0,maxChars-1)}…`:fullName;return <g><title>{name}: {short(value)} Stars</title><rect x={x} y={y} width={width} height={height} fill={palette[shade]} stroke="#fff" strokeWidth={3} rx={7}/>{width>95&&height>42&&<text x={x+11} y={y+titleSize+5} fill={dark?'#fff':'#111'} fontSize={titleSize} fontWeight={650}>{label}</text>}{width>95&&height>60&&<text x={x+11} y={y+titleSize+valueSize+9} fill={dark?'#ffffffe8':'#262626'} fontSize={valueSize} fontWeight={550} fontVariant="tabular-nums">{short(value)} ★</text>}</g>}
function ProjectTooltip({active,payload,l,t}){if(!active||!payload?.length)return null;const item=payload[0].payload;return <div className="analytics-tooltip"><strong>{item.full_name||item.name}</strong><span>{t.stars}: {num(item.stars,l)}</span><span>{t.forks}: {num(item.forks,l)}</span></div>}

export function AnalyticsPage({l,names,updatePath,type='github-repo'}){
  const init=new URLSearchParams(location.search);
  const [board,setBoard]=useState(names[init.get('board')]?init.get('board'):'hot');
  const [period,setPeriod]=useState(['day','week','month'].includes(init.get('period'))?init.get('period'):'week');
  const [filters,setFilters]=useState({language:init.get('language')||'',topic:init.get('topic')||'',age:init.get('age')||'',q:init.get('q')||''});
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[revision,setRevision]=useState(0);
  const [activeScene,setActiveScene]=useState(0);
  const t=words[l],index=l==='zh'?0:1;
  useEffect(()=>{
    const controller=new AbortController();
    const query=new URLSearchParams({board,period,...filters});
    history.replaceState({},'',`/${l}/${type}/charts?${query}`);window.dispatchEvent(new PopStateEvent('popstate'));
    setLoading(true);setError(false);
    Promise.all([fetch(`/api/${type}/charts?${query}`,{signal:controller.signal}),fetch(`/api/${type}/rankings?${query}&page=1&limit=50`,{signal:controller.signal})]).then(async responses=>{if(responses.some(r=>!r.ok))throw Error('charts');return Promise.all(responses.map(r=>r.json()))}).then(([chart,ranking])=>setData({chart,ranking})).catch(e=>{if(e.name!=='AbortError')setError(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[board,period,filters,l,revision,type]);
  const chart=data?.chart, ranking=data?.ranking, items=ranking?.items||[];
  const series=chart?.points||[];
  const daily=useMemo(()=>series.slice(1).map((p,i)=>({date:p.date,value:p.gain===null||series[i].gain===null?null:p.gain-series[i].gain})),[chart]);
  const growth=useMemo(()=>items.filter(r=>r.gain!==null&&!r.anomaly).sort((a,b)=>b.gain-a.gain).slice(0,10),[ranking]);
  const languages=chart?.languages||[];
  const scatter=useMemo(()=>items.map(r=>({...r,stars:Number(r.stars)||0,forks:Number(r.forks)||0})),[ranking]);
  const tiles=useMemo(()=>[...items].sort((a,b)=>b.stars-a.stars).slice(0,12).map(r=>({name:r.full_name,size:Math.max(1,r.stars),value:r.stars,url:r.url})),[ranking]);
  const compare=useMemo(()=>items.filter(r=>r.gain!==null&&r.prevGain!==null&&!r.anomaly).sort((a,b)=>b.gain-a.gain).slice(0,8).map(r=>({name:compactName(r.full_name),full_name:r.full_name,current:r.gain,previous:r.prevGain})),[ranking]);
  const topics=useMemo(()=>{const counts=new Map();items.forEach(r=>(r.topics||[]).forEach(topic=>counts.set(topic,(counts.get(topic)||0)+1)));return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>({name,count}))},[ranking]);
  const ages=useMemo(()=>{const counts=[0,0,0,0,0];items.forEach(r=>{const d=Number(r.ageDays)||0;counts[d<=30?0:d<=90?1:d<=365?2:d<=1095?3:4]++});return t.ageLabels.map((name,i)=>({name,count:counts[i]}))},[ranking,l]);
  const activity=useMemo(()=>{const counts=[0,0,0,0,0];items.forEach(r=>{const d=Number(r.pushDays)||0;counts[d<=1?0:d<=7?1:d<=30?2:d<=90?3:4]++});return t.activityLabels.map((name,i)=>({name,count:counts[i]}))},[ranking,l]);
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
  return <main className="analytics-page"><section className="analytics-scene analytics-scene-lead is-visible" id="chart-page-1"><div className="analytics-top"><div className="analytics-lead"><div><h1>{t.title}</h1><p className="analytics-intro">{t.intro}</p></div><div className="analytics-stat"><strong>{loading?'—':num(ranking?.items.length,l)}</strong><span>{t.sample}</span></div></div><div className="analytics-controls"><label>{t.board}<DesignSelect id="chart-board" value={board} onChange={setBoard} options={Object.entries(names).map(([id,label])=>({value:id,label:label[index]}))}/></label><label>{t.period}<DesignSelect id="chart-period" value={period} onChange={setPeriod} options={[{value:'day',label:l==='zh'?'日':'Day'},{value:'week',label:l==='zh'?'周':'Week'},{value:'month',label:l==='zh'?'月':'Month'}]}/></label>{activeFilters.length>0&&<div className="analytics-active-filters"><span>{t.filter}: {activeFilters.map(([key,value])=>`${key} · ${value}`).join(' / ')}</span><button type="button" onClick={()=>setFilters({language:'',topic:'',age:'',q:''})}>{t.clear}</button></div>}</div></div>
  {error?<div className="analytics-state" role="alert">{t.error} <button type="button" onClick={()=>setRevision(v=>v+1)}>{t.retry}</button></div>:loading?<div className="analytics-loading" role="status">{t.loading}</div>:items.length===0?<div className="analytics-state">{t.empty}</div>:<><div className="analytics-meta"><span>{t.topNote.replace('{count}',num(items.length,l))}</span>{ranking?.updatedAt&&<span>{t.updated} {new Date(ranking.updatedAt).toLocaleDateString(l==='zh'?'zh-CN':'en-US')}</span>}</div><div className="analytics-scene-body analytics-single">
    <ChartFrame title={t.cumulative} note={t.cumulativeNote} wide><>{chart?.leader&&<a className="analytics-leader" href={repoUrl(chart.leader)} target="_blank" rel="noopener noreferrer"><small>{t.leader}</small><strong>{chart.leader} ↗</strong></a>}{historyReady?<div className="analytics-plot analytics-plot-wide" role="img" aria-label={`${t.cumulative}: ${chart.leader}`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{top:12,right:12,bottom:0,left:0}}><Axis/><Tooltip formatter={v=>[num(v,l),t.newStars]} contentStyle={tooltipStyle}/><Area type="monotone" dataKey="gain" stroke="#315fd9" fill="#315fd921" strokeWidth={3} dot={series.length<10?{r:3,fill:'#315fd9'}:false} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>:<Empty>{t.historyEmpty}</Empty>}</></ChartFrame>
  </div></>}</section>
  {hasCharts&&<>
  <section className="analytics-scene" id="chart-page-2"><div className="analytics-scene-label"><span>02 / 06</span><strong>{t.sceneNames[1]}</strong></div><div className="analytics-scene-body analytics-pair">
    <ChartFrame title={t.daily} note={t.dailyNote}><>{historyReady&&daily.some(x=>x.value!==null)?<div className="analytics-plot" role="img" aria-label={t.daily}><ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{top:12,right:8,bottom:0,left:0}}><Axis/><Tooltip formatter={v=>[num(v,l),t.newStars]} contentStyle={tooltipStyle}/><Bar dataKey="value" fill="#315fd9" maxBarSize={44} radius={[4,4,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>:<Empty>{t.historyEmpty}</Empty>}</></ChartFrame>
    <ChartFrame title={t.topGrowth} note={t.topGrowthNote}><>{growth.length?<ol className="analytics-rank-bars">{growth.map((r,i)=><li key={r.id}><div><span>{String(i+1).padStart(2,'0')}</span><a href={r.url} target="_blank" rel="noopener noreferrer">{r.full_name}</a><strong>+{num(r.gain,l)}</strong></div><i style={{width:`${Math.max(2,r.gain/Math.max(1,growth[0].gain)*100)}%`}}/></li>)}</ol>:<Empty>{t.historyEmpty}</Empty>}</></ChartFrame>
  </div></section>
  <section className="analytics-scene" id="chart-page-3"><div className="analytics-scene-label"><span>03 / 06</span><strong>{t.sceneNames[2]}</strong></div><div className="analytics-scene-body analytics-pair">
    <ChartFrame title={t.languages} note={t.languagesNote}><>{languages.length?<div className="analytics-donut-wrap"><div className="analytics-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={languages} dataKey="count" nameKey="name" innerRadius="57%" outerRadius="88%" stroke="#fff" strokeWidth={3} isAnimationActive={false}>{languages.map((r,i)=><Cell key={r.name} fill={palette[i%palette.length]}/>)}</Pie><Tooltip formatter={v=>[num(v,l),t.projects]} contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer><div className="analytics-donut-center"><strong>{items.length}</strong><span>{t.projects}</span></div></div><ul className="analytics-legend">{languages.map((r,i)=><li key={r.name}><i style={{background:palette[i%palette.length]}}/><span>{r.name==='Other'?t.other:r.name}</span><strong>{num(r.count,l)}</strong></li>)}</ul></div>:<Empty>{t.empty}</Empty>}</></ChartFrame>
    <ChartFrame title={t.scatter} note={t.scatterNote}><div className="analytics-plot" role="img" aria-label={t.scatter}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:14,right:14,bottom:10,left:0}}><CartesianGrid stroke="#e9e9e9"/><XAxis type="number" dataKey="stars" name={t.stars} tickFormatter={short} tick={{fill:'#777',fontSize:13}} domain={[0,'dataMax']} axisLine={false} tickLine={false}/><YAxis type="number" dataKey="forks" name={t.forks} tickFormatter={short} tick={{fill:'#777',fontSize:13}} width={52} axisLine={false} tickLine={false}/><Tooltip cursor={{strokeDasharray:'3 3'}} content={props=><ProjectTooltip {...props} l={l} t={t}/>}/><Scatter data={scatter} fill="#315fd9" isAnimationActive={false}/></ScatterChart></ResponsiveContainer></div></ChartFrame>
  </div></section>
  <section className="analytics-scene" id="chart-page-4"><div className="analytics-scene-label"><span>04 / 06</span><strong>{t.sceneNames[3]}</strong></div><div className="analytics-scene-body analytics-single">
    <ChartFrame title={t.treemap} note={t.treemapNote} wide><div className="analytics-plot analytics-plot-treemap" role="img" aria-label={t.treemap}><ResponsiveContainer width="100%" height="100%"><Treemap data={tiles} dataKey="size" nameKey="name" aspectRatio={1.8} content={<Tile/>} isAnimationActive={false}><Tooltip formatter={v=>[num(v,l),t.stars]} contentStyle={tooltipStyle}/></Treemap></ResponsiveContainer></div><div className="analytics-tile-links">{tiles.slice(0,4).map(r=><a href={r.url} target="_blank" rel="noopener noreferrer" key={r.name}>{r.name} ↗</a>)}</div></ChartFrame>
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
