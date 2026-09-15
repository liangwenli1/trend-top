import React,{useEffect,useMemo,useState} from 'react';
import {Bar,BarChart,CartesianGrid,Cell,Line,LineChart,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';

const copy={
  zh:{heading:'增长一览',context:'所选榜单与周期',demo:'演示数据',live:'GitHub 公开数据',growth:'累计新增 Star',daily:'每日新增 Star',dailyNet:'每日 Star 净变化',top:'榜单前五增星',topStars:'前五名 Star 总数',topForks:'前五名 Fork 总数',language:'语言分布',sample:'当前榜单前 {count} 个项目',leader:'领跑项目',noHistory:'暂无足够历史数据',noItems:'当前筛选没有项目',day:'日期',stars:'Star',projects:'项目',other:'其他',updated:'更新于',net:'净增',total:'总数'},
  en:{heading:'Growth at a glance',context:'Selected board and period',demo:'Demo data',live:'Public GitHub data',growth:'Cumulative new Stars',daily:'Daily new Stars',dailyNet:'Daily net Star change',top:'Star growth among the top five',topStars:'Top five total Stars',topForks:'Top five total Forks',language:'Language mix',sample:'Top {count} projects on this board',leader:'Leading project',noHistory:'Not enough history yet',noItems:'No projects match these filters',day:'Date',stars:'Stars',projects:'Projects',other:'Other',updated:'Updated',net:'Net gain',total:'Total'}
};
const shades=['#315fd9','#555555','#888888','#aaaaaa','#cccccc','#e5e5e5'];
const format=(value,l)=>new Intl.NumberFormat(l==='zh'?'zh-CN':'en-US').format(value);
const short=(value,l)=>new Intl.NumberFormat(l==='zh'?'zh-CN':'en-US',{notation:'compact',maximumFractionDigits:1}).format(value);
const repoUrl=name=>`https://github.com/${name.split('/').map(encodeURIComponent).join('/')}`;
const tipStyle={background:'#fff',border:'1px solid #e5e5e5',borderRadius:8,color:'#111',fontSize:14,boxShadow:'none'};
function Empty({children}){return <div className="chart-empty">{children}</div>}
function LeadingProject({name,t}){return name?<div className="chart-project"><span className="chart-project-label">{t.leader}</span><a className="chart-project-link" href={repoUrl(name)} target="_blank" rel="noopener noreferrer" title={`${name} · GitHub`}>{name}</a></div>:null}
function LanguageTooltip({active,payload,l,t}){if(!active||!payload?.length)return null;const item=payload[0].payload;return <div className="analytics-tooltip analytics-language-tooltip"><strong>{item.name==='Other'?t.other:item.name}</strong><span>{format(item.count,l)}</span></div>}
function Axis({l}){return <><CartesianGrid vertical={false} stroke="#e5e5e5"/><XAxis dataKey="date" tickFormatter={value=>value.slice(5)} tick={{fill:'#737373',fontSize:15}} axisLine={false} tickLine={false} minTickGap={24}/><YAxis tickFormatter={value=>short(value,l)} tick={{fill:'#737373',fontSize:15}} axisLine={false} tickLine={false} width={58}/></>}
function DataTable({title,points,keyName,l,t}){
  return <table className="sr-only"><caption>{title}</caption><thead><tr><th>{t.day}</th><th>{t.stars}</th></tr></thead><tbody>{points.map(point=><tr key={point.date}><td>{point.date}</td><td>{point[keyName]===null?'—':format(point[keyName],l)}</td></tr>)}</tbody></table>;
}

export function TrendPanel({l,type='github-repo',board,period,language,topic,age,q,boardLabel,periodLabel}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
  const t=copy[l];
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError(false);
    const query=new URLSearchParams({board,period,language,topic,age,q});
    fetch(`/api/${type}/charts?${query}`,{signal:controller.signal}).then(response=>{if(!response.ok)throw Error('chart');return response.json()}).then(setData).catch(err=>{if(err.name!=='AbortError')setError(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[type,board,period,language,topic,age,q]);
  const points=data?.points||[];
  const daily=useMemo(()=>points.slice(1).map((point,index)=>({date:point.date,value:point.gain===null||points[index].gain===null?null:point.gain-points[index].gain})),[data]);
  const bars=data?.bars||[];
  const languages=data?.languages||[];
  const max=Math.max(1,...bars.map(item=>Math.max(0,item.value)));
  const historyReady=!loading&&!error&&!data?.insufficient;
  const dayTitle=data?.growthBasis==='star_created'?t.daily:t.dailyNet;
  const topTitle=data?.metric==='stars'?t.topStars:data?.metric==='forks'?t.topForks:t.top;
  return <section className="trend-panel" aria-label={t.heading}>
    <div className="visuals-heading"><div><h2>{t.heading}</h2><p>{boardLabel} · {periodLabel}</p></div></div>
    <div className="chart-grid">
      <article className="chart-card chart-card-with-project"><div className="chart-card-head"><h3>{t.growth}</h3></div>
        {historyReady?<><LeadingProject name={data.leader} t={t}/><div className="chart-container" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{top:10,right:8,bottom:0,left:0}}><Axis l={l}/><Tooltip formatter={value=>[format(value,l),t.stars]} contentStyle={tipStyle}/><Line type="linear" dataKey="gain" stroke="#315fd9" strokeWidth={2.5} connectNulls={false} dot={points.length<=8?{r:3,fill:'#315fd9'}:false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div><DataTable title={t.growth} points={points} keyName="gain" l={l} t={t}/></>:<Empty>{t.noHistory}</Empty>}
      </article>
      <article className="chart-card chart-card-with-project"><div className="chart-card-head"><h3>{dayTitle}</h3></div>
        {historyReady&&daily.some(point=>point.value!==null)?<><LeadingProject name={data.leader} t={t}/><div className="chart-container" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{top:10,right:8,bottom:0,left:0}}><Axis l={l}/><Tooltip formatter={value=>[format(value,l),t.stars]} contentStyle={tipStyle}/><Bar dataKey="value" fill="#315fd9" radius={[3,3,0,0]} isAnimationActive={false} maxBarSize={38}/></BarChart></ResponsiveContainer></div><DataTable title={dayTitle} points={daily} keyName="value" l={l} t={t}/></>:<Empty>{t.noHistory}</Empty>}
      </article>
      <article className="chart-card"><div className="chart-card-head"><h3>{topTitle}</h3></div>
        {loading?<Empty>…</Empty>:bars.length?<ol className="trend-bars">{bars.map(item=><li key={item.id}><div className="trend-bar-label"><span className="trend-bar-name" title={item.name}><small>{String(item.rank).padStart(2,'0')}</small><a className="trend-project-link" href={repoUrl(item.name)} target="_blank" rel="noopener noreferrer">{item.name}</a></span><strong>{data.metric==='gain'&&item.value>0?'+':''}{format(item.value,l)}</strong></div><div className="trend-track" aria-hidden="true"><span style={{width:`${Math.max(2,Math.max(0,item.value)/max*100)}%`}}/></div></li>)}</ol>:<Empty>{t.noItems}</Empty>}
      </article>
      <article className="chart-card"><div className="chart-card-head"><h3>{t.language}</h3></div>
        {loading?<Empty>…</Empty>:languages.length?<><div className="language-chart"><div className="donut-container" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={languages} dataKey="count" nameKey="name" innerRadius="57%" outerRadius="88%" paddingAngle={1} stroke="#fff" strokeWidth={2} isAnimationActive={false}>{languages.map((item,index)=><Cell key={item.name} fill={shades[index%shades.length]}/>)}</Pie><Tooltip content={props=><LanguageTooltip {...props} l={l} t={t}/>} position={{x:6,y:6}} wrapperStyle={{pointerEvents:'none'}}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{data.languageSampleCount}</strong><span>{t.projects}</span></div></div><ul className="language-legend">{languages.map((item,index)=><li key={item.name}><i style={{background:shades[index%shades.length]}}/><span>{item.name==='Other'?t.other:item.name}</span><strong>{format(item.count,l)}</strong></li>)}</ul></div><p className="chart-caption">{t.sample.replace('{count}',format(data.languageSampleCount,l))}</p></>:<Empty>{t.noItems}</Empty>}
      </article>
    </div>
    {data?.updatedAt&&<p className="visuals-updated">{t.updated} {new Date(data.updatedAt).toLocaleDateString(l==='zh'?'zh-CN':'en-US')}</p>}
  </section>;
}
