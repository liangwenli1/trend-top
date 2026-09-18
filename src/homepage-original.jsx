import React, {useEffect,useRef,useState} from 'react';
import {TYPES,TYPE_META,typePath,itemPath} from './catalog.js';
import {HomeGrowthChart,HomeDailyChart} from './home-growth.jsx';
import {WorthCloserLook} from './homepage.jsx';
const fmt=(n,l)=>n==null?'—':new Intl.NumberFormat(l==='zh'?'zh-CN':'en-US').format(n);
const api=url=>fetch(url).then(r=>{if(!r.ok)throw new Error('Content unavailable');return r.json()});

const HOME_TYPE_COPY = {
  skill: { zh: '可复用的指令与工作流。', en: 'Reusable instructions and workflows.' },
  plugin: { zh: '插件与 MCP 服务，按用途筛选。', en: 'Plugins and MCP servers, grouped by purpose.' },
  agent: { zh: '编程、研究与浏览器 Agent。', en: 'Agents for coding, research, and the browser.' },
  components: { zh: '可直接使用的界面组件。', en: 'Interface components you can put to work.' },
  website: { zh: '开源工具站、目录与资源。', en: 'Open-source tools, directories, and resources.' },
  'github-repo': { zh: '关注近期增势，而非只有总 Star。', en: 'Recent momentum, beyond all-time Star totals.' }
};

export function RestoredHome({ l, t, navigate }) {
  const initialAnchorHandled = useRef(false);
  const [data, setData] = useState(null);
  const [chart, setChart] = useState(null);
  const [chartError, setChartError] = useState(false);
  const [pluginChart, setPluginChart] = useState(null);
  const [pluginChartError, setPluginChartError] = useState(false);
  const zh = l === 'zh';
  useEffect(() => {
    let active = true;
    api('/api/types').then(result => { if (active) setData(result); }).catch(() => { if (active) setData({ source: 'unavailable', types: TYPES.map(id => ({ id, ...TYPE_META[id], count: null })) }); });
    api('/api/github-repo/charts?board=hot&period=week').then(result => { if (active) setChart(result); }).catch(() => { if (active) setChartError(true); });
    api('/api/plugin/charts?board=hot&period=week').then(result => { if (active) setPluginChart(result); }).catch(() => { if (active) setPluginChartError(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const nodes = document.querySelectorAll('.type-home .home-reveal');
    if (!('IntersectionObserver' in window)) { nodes.forEach(node => node.classList.add('is-in')); return; }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-in'); observer.unobserve(entry.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!data || initialAnchorHandled.current) return;
    initialAnchorHandled.current = true;
    const id = location.hash.slice(1);
    if (!['types','recent'].includes(id)) return;
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({block:'start',behavior:'instant'}));
    return () => cancelAnimationFrame(frame);
  }, [data]);

  const types = data?.types?.length ? data.types : TYPES.map(id => ({ id, ...TYPE_META[id], count: null }));
  const total = data?.types?.reduce((sum, item) => sum + (item.count || 0), 0);
  const maxCount = Math.max(1, ...types.map(item => item.count || 0));
  const sourceLabel = !data ? (zh ? '正在读取数据…' : 'Loading data…') : data.source === 'unavailable' ? (zh ? '数据暂不可用' : 'Data unavailable') : (zh ? '当前收录' : 'Current catalog');
  const bars = chart?.bars?.slice(0, 4) || [];
  const maxGain = Math.max(1, ...bars.map(item => item.value || 0));
  const go = path => event => navigate(event, path);

  return <main className="page-shell type-home">
    <section className="home-hero home-reveal" id="intro" aria-labelledby="home-title">
      <div className="home-hero-copy">
        <p className="home-kicker">Trend Top / {zh ? '开源发现' : 'Open-source discovery'}</p>
        <h1 id="home-title">{zh ? <>开源变化很快。<br />看清，再选择。</> : <>Open source moves fast.<br />See clearly. Choose well.</>}</h1>
        <p className="home-intro">{zh ? 'Skill、插件、Agent、组件、网站和仓库不断涌现。Trend Top 把近期增长、官方来源与同类选择放在一起，让你少翻目录，多做判断。' : 'Skills, plugins, agents, components, sites, and repositories keep changing. Trend Top brings recent momentum, official sources, and comparable options into one place.'}</p>
        <div className="home-hero-actions">
          <a className="primary" href="#types">{zh ? '探索六大类型' : 'Explore six collections'}<span aria-hidden="true">↗</span></a>
          <a className="home-text-link" href={`/${l}/method`} onClick={go(`/${l}/method`)}>{zh ? '了解榜单方法' : 'How rankings work'}</a>
        </div>
      </div>
      <aside className="home-landscape" aria-label={zh ? '六类收录分布' : 'Distribution across six collections'}>
        <div className="home-landscape-top"><span>{zh ? '收录概览' : 'Collection snapshot'}</span><span className="home-source">{sourceLabel}</span></div>
        <div className="home-landscape-total"><strong>{fmt(total, l)}</strong><span>{zh ? '条收录内容，分为六类' : 'items across six collections'}</span></div>
        <ul className="home-count-bars">
          {types.map(item => <li key={item.id}>
            <span className="home-count-label">{item[zh ? 'zh' : 'en']}</span>
            <span className="home-count-track" aria-hidden="true"><i style={{ width: `${(item.count || 0) / maxCount * 100}%` }} /></span>
            <strong>{fmt(item.count, l)}</strong>
          </li>)}
        </ul>
        <p className="home-landscape-note">{zh ? '按类型分别统计；具体数据以各榜单为准。' : 'Counted by type. See each board for its underlying data.'}</p>
      </aside>
    </section>

    <WorthCloserLook l={l} navigate={navigate}/>

    <section className="home-proof home-reveal" aria-labelledby="home-proof-title">
      <div className="home-section-heading"><p className="home-kicker">01 / {zh ? '看见变化' : 'See the movement'}</p><h2 id="home-proof-title">{zh ? '不只看总量，更看最近谁在增长。' : 'Look beyond totals. See what is moving now.'}</h2><p>{zh ? '以仓库榜为例，增长曲线和同榜项目的增量放在一起，快速看出趋势与差异。' : 'A sample from the repository board pairs a growth curve with the projects beside it, so the direction and the differences are easy to read.'}</p></div>
      <div className="home-proof-grid">
        <div className="home-proof-chart">
          <div className="home-proof-card-title"><span>{zh ? '仓库增长' : 'Repository growth'}</span><span>{zh ? '近 7 天' : 'Last 7 days'}</span></div>
          <HomeGrowthChart chart={chart} l={l} loading={!chart && !chartError} error={chartError} />
          {chart?.leader && <p className="home-proof-caption">{zh ? '领跑项目' : 'Leading project'} <a href={itemPath(l, 'github-repo', chart.bars?.[0]?.id || chart.leader)} onClick={go(itemPath(l, 'github-repo', chart.bars?.[0]?.id || chart.leader))}>{chart.leader} ↗</a></p>}
        </div>
        <div className="home-proof-rank">
          <div className="home-proof-card-title"><span>{zh ? '同榜项目对比' : 'Projects on the same board'}</span><span>{zh ? '近 7 天' : 'Last 7 days'}</span></div>
          {bars.length ? <ol className="home-rank-bars">{bars.map((item, index) => <li key={item.id}>
            <div className="home-rank-row"><span>{String(index + 1).padStart(2, '0')}</span><a href={itemPath(l, 'github-repo', item.id)} onClick={go(itemPath(l, 'github-repo', item.id))} title={item.name}>{item.name}</a><strong>{item.value > 0 ? '+' : ''}{fmt(item.value, l)}</strong></div>
            <div className="home-rank-track" aria-hidden="true"><i style={{ width: `${Math.max(0, item.value / maxGain * 100)}%` }} /></div>
          </li>)}</ol> : <div className="home-chart-state" role="status">{chartError ? (zh ? '暂时无法读取榜单。' : 'The board is temporarily unavailable.') : chart ? (zh ? '当前没有可对比的项目。' : 'No comparable projects in this view.') : (zh ? '正在读取榜单…' : 'Loading the board…')}</div>}
          <a className="home-proof-link" href={typePath(l, 'github-repo', 'charts')} onClick={go(typePath(l, 'github-repo', 'charts'))}>{zh ? '查看完整图表' : 'Explore all charts'} <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <div className="home-daily-grid">
        <div className="home-daily-card"><div className="home-proof-card-title"><span>{zh ? '仓库 · 每日变化' : 'Repositories · Daily movement'}</span><span>{chart?.leader || ''}</span></div><HomeDailyChart chart={chart} l={l} loading={!chart && !chartError} error={chartError}/></div>
        <div className="home-daily-card"><div className="home-proof-card-title"><span>{zh ? '插件 / MCP · 每日变化' : 'Plugins / MCP · Daily movement'}</span><span>{pluginChart?.leader || ''}</span></div><HomeDailyChart chart={pluginChart} l={l} loading={!pluginChart && !pluginChartError} error={pluginChartError}/><a className="home-proof-link home-daily-link" href={typePath(l, 'plugin', 'charts')} onClick={go(typePath(l, 'plugin', 'charts'))}>{zh ? '查看插件图表' : 'Explore plugin charts'} <span aria-hidden="true">↗</span></a></div>
      </div>
      <p className="home-proof-footnote">{zh ? '图表来自各类型热门榜；插件指标为关联仓库的 Star 变化。' : 'From each collection’s Hot board; plugin metrics reflect associated repository Star changes.'}</p>
    </section>

    <section className="home-process home-reveal" aria-labelledby="home-process-title">
      <div className="home-section-heading"><p className="home-kicker">02 / {zh ? '更好地选择' : 'Make a better choice'}</p><h2 id="home-process-title">{zh ? '从发现到决定，少走几步。' : 'From discovery to decision, with less noise.'}</h2></div>
      <div className="home-process-grid">
        {[
          { n: '01', title: zh ? '找正在增长的' : 'Find what is rising', body: zh ? '按类型查看 Trending、排行和增长图表，先了解最近的变化。' : 'Browse Trending, rankings, and growth charts within the type you care about.' },
          { n: '02', title: zh ? '核对来源与同类' : 'Check source and context', body: zh ? '官方标记和同类项目并排呈现，辨认来源，也看清有哪些替代选择。' : 'Official marks and similar items help you verify the source and see alternatives.' },
          { n: '03', title: zh ? '选择并持续追踪' : 'Choose and keep up', body: zh ? '打开详情、比较选项；想持续关注时，再订阅每日摘要。' : 'Open details, compare options, and follow changes with the daily digest.' }
        ].map(step => <article key={step.n}><span className="home-step-number">{step.n}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}
      </div>
    </section>

    <section className="home-types home-reveal" id="types" aria-labelledby="home-types-title">
      <div className="home-section-heading"><p className="home-kicker">03 / {zh ? '开始探索' : 'Start exploring'}</p><h2 id="home-types-title">{zh ? '选一个方向，往里看。' : 'Start with a type.'}</h2><p>{zh ? '六类分开排行。每一类都有趋势、名次、图表和官方来源。' : 'Six separate collections. Each has trends, rankings, charts, and official sources.'}</p></div>
      <div className="type-card-grid">
        {types.map((item, index) => <article className="type-card" key={item.id}>
          <div className="type-card-top"><span className="type-card-index">{String(index + 1).padStart(2, '0')} / 06</span><span className="type-card-count">{fmt(item.count, l)} {zh ? '条' : 'items'}</span></div>
          <h3><a href={typePath(l, item.id)} onClick={go(typePath(l, item.id))}>{item[zh ? 'zh' : 'en']}</a></h3>
          <p className="type-card-copy">{HOME_TYPE_COPY[item.id][zh ? 'zh' : 'en']}</p>
          <div className="type-card-links">
            <a href={typePath(l, item.id)} onClick={go(typePath(l, item.id))}>Trending</a>
            <a href={typePath(l, item.id, 'ranking')} onClick={go(typePath(l, item.id, 'ranking'))}>{zh ? '排行' : 'Rankings'}</a>
            <a href={typePath(l, item.id, 'charts')} onClick={go(typePath(l, item.id, 'charts'))}>{zh ? '图表' : 'Charts'}</a>
            <a href={typePath(l, item.id, 'official')} onClick={go(typePath(l, item.id, 'official'))}>{zh ? '官方' : 'Official'}</a>
          </div>
        </article>)}
      </div>
    </section>
  </main>;
}
