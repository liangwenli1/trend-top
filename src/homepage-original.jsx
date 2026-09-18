import React, {useEffect,useRef,useState} from 'react';
import {TYPES,TYPE_META,typePath,itemPath,typeLabel} from './catalog.js';
import {HomeGrowthChart} from './home-growth.jsx';
import {WorthCloserLook} from './homepage.jsx';
import {SourceBadge} from './source-badge.jsx';
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

function MovementList({ items, l, navigate, empty }) {
  const go = path => event => navigate(event, path);
  if (!items?.length) return <div className="home-chart-state" role="status">{empty}</div>;
  return <ol className="home-move-list">{items.map(item => <li key={item.id}>
    <div className="home-move-identity">
      <a href={itemPath(l, item.type, item.slug)} onClick={go(itemPath(l, item.type, item.slug))} title={item.full_name}>{item.full_name}</a>
      <SourceBadge l={l} official={item.official} evidence={item.officialEvidence}/>
    </div>
    <strong>{item.gain == null ? '—' : `${item.gain > 0 ? '+' : ''}${fmt(item.gain, l)}`}</strong>
  </li>)}</ol>;
}

function HomeMovement({ l, navigate }) {
  const zh = l === 'zh';
  const [type, setType] = useState(null);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    const params = type ? `?type=${encodeURIComponent(type)}` : '';
    fetch('/api/home/movement' + params, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Content unavailable');
      return response.json();
    }).then(value => {
      if (!controller.signal.aborted) setPayload(value);
    }).catch(err => { if (err.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [type]);
  const go = path => event => navigate(event, path);
  const selected = type || payload?.type || 'github-repo';
  const peers = payload?.peers || [];
  const maxGain = Math.max(1, ...peers.map(item => item.gain || 0));
  const leader = payload?.leader;
  const useCase = leader?.useCaseLabel?.[zh ? 'zh' : 'en'];
  const loading = !payload && !error;
  return <section className="home-proof home-reveal" aria-labelledby="home-proof-title">
    <div className="home-section-heading"><p className="home-kicker">02 / {zh ? '看见变化' : 'See the movement'}</p><h2 id="home-proof-title">{zh ? '不只看总量，更看最近谁在增长。' : 'Look beyond totals. See what is moving now.'}</h2><p>{zh ? '选一个类型，看近 7 天谁在涨，以及同一用途里还有哪些选项。' : 'Pick a collection to see what gained stars in the last 7 days, and which options share the same use case.'}</p></div>
    <div className="discovery-type-filters home-proof-types" role="group" aria-label={zh ? '选择资源类型' : 'Choose a resource type'}>
      {TYPES.map(id => <button key={id} type="button" aria-pressed={selected === id} onClick={() => setType(id)}>{typeLabel(id, l)}</button>)}
    </div>
    <div className="home-proof-grid">
      <div className="home-proof-chart">
        <div className="home-proof-card-title"><span>{zh ? `${typeLabel(selected, l)} · 近 7 天` : `${typeLabel(selected, l)} · 7 days`}</span><span>{zh ? '累计新增 Star' : 'Cumulative new Stars'}</span></div>
        <HomeGrowthChart chart={payload?.chart} l={l} loading={loading} error={error} />
        {leader && <p className="home-proof-caption"><SourceBadge l={l} official={leader.official} evidence={leader.officialEvidence}/>{useCase ? <span>{useCase}</span> : null}<a href={itemPath(l, leader.type, leader.slug)} onClick={go(itemPath(l, leader.type, leader.slug))}>{leader.full_name} ↗</a></p>}
      </div>
      <div className="home-proof-rank">
        <div className="home-proof-card-title"><span>{useCase || (zh ? '同类选项' : 'Same-purpose options')}</span><span>{zh ? '近 7 天' : 'Last 7 days'}</span></div>
        {peers.length ? <ol className="home-rank-bars">{peers.map((item, index) => <li key={item.id}>
          <div className="home-rank-row"><span>{String(index + 1).padStart(2, '0')}</span><div className="home-rank-identity"><a href={itemPath(l, item.type, item.slug)} onClick={go(itemPath(l, item.type, item.slug))} title={item.full_name}>{item.full_name}</a><SourceBadge l={l} official={item.official} evidence={item.officialEvidence}/></div><strong>{item.gain > 0 ? '+' : ''}{fmt(item.gain, l)}</strong></div>
          <div className="home-rank-track" aria-hidden="true"><i style={{ width: `${Math.max(0, (item.gain || 0) / maxGain * 100)}%` }} /></div>
        </li>)}</ol> : <div className="home-chart-state" role="status">{error ? (zh ? '暂时无法读取同类项目。' : 'Peer projects are temporarily unavailable.') : loading ? (zh ? '正在读取同类项目…' : 'Loading peer projects…') : (zh ? '当前没有可对比的同类项目。' : 'No comparable projects in this use case.')}</div>}
        <a className="home-proof-link" href={typePath(l, selected, 'ranking')} onClick={go(typePath(l, selected, 'ranking'))}>{zh ? '查看完整排行' : 'Open full ranking'} <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <div className="home-daily-grid">
      <div className="home-daily-card">
        <div className="home-proof-card-title"><span>{zh ? '新进热榜' : 'New on Hot'}</span><span>{zh ? '30 天内' : 'Last 30 days'}</span></div>
        <MovementList items={payload?.newcomers} l={l} navigate={navigate} empty={loading ? (zh ? '正在读取新项目…' : 'Loading new projects…') : (zh ? '这一类暂时没有新进项目。' : 'No new projects in this collection yet.')}/>
      </div>
      <div className="home-daily-card">
        <div className="home-proof-card-title"><span>{zh ? '涨幅最大' : 'Biggest movers'}</span><span>{zh ? '近 7 天' : 'Last 7 days'}</span></div>
        <MovementList items={payload?.movers} l={l} navigate={navigate} empty={loading ? (zh ? '正在读取涨幅…' : 'Loading movers…') : (zh ? '这一类还没有可比较的增量。' : 'No comparable gains in this collection yet.')}/>
        <a className="home-proof-link home-daily-link" href={typePath(l, selected, 'charts')} onClick={go(typePath(l, selected, 'charts'))}>{zh ? '查看图表' : 'Explore charts'} <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <p className="home-proof-footnote">{zh ? '按类型的近 7 天 Hot 榜。右侧是同一用途的选项，不是跨类型总榜。新进热榜看项目年龄。' : 'From each collection’s 7-day Hot board. Options on the right share a use case; this is not a cross-type ranking. New on Hot uses project age.'}</p>
  </section>;
}

export function RestoredHome({ l, t, navigate }) {
  const initialAnchorHandled = useRef(false);
  const [data, setData] = useState(null);
  const zh = l === 'zh';
  useEffect(() => {
    let active = true;
    api('/api/types').then(result => { if (active) setData(result); }).catch(() => { if (active) setData({ source: 'unavailable', types: TYPES.map(id => ({ id, ...TYPE_META[id], count: null })) }); });
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

    <HomeMovement l={l} navigate={navigate}/>

    <section className="home-process home-reveal" aria-labelledby="home-process-title">
      <div className="home-section-heading"><p className="home-kicker">03 / {zh ? '更好地选择' : 'Make a better choice'}</p><h2 id="home-process-title">{zh ? '从发现到决定，少走几步。' : 'From discovery to decision, with less noise.'}</h2></div>
      <div className="home-process-grid">
        {[
          { n: '01', title: zh ? '找正在增长的' : 'Find what is rising', body: zh ? '按类型查看 Trending、排行和增长图表，先了解最近的变化。' : 'Browse Trending, rankings, and growth charts within the type you care about.' },
          { n: '02', title: zh ? '核对来源与同类' : 'Check source and context', body: zh ? '官方标记和同类项目并排呈现，辨认来源，也看清有哪些替代选择。' : 'Official marks and similar items help you verify the source and see alternatives.' },
          { n: '03', title: zh ? '选择并持续追踪' : 'Choose and keep up', body: zh ? '打开详情、比较选项；想持续关注时，再订阅每日摘要。' : 'Open details, compare options, and follow changes with the daily digest.' }
        ].map(step => <article key={step.n}><span className="home-step-number">{step.n}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}
      </div>
    </section>

    <section className="home-types home-reveal" id="types" aria-labelledby="home-types-title">
      <div className="home-section-heading"><p className="home-kicker">04 / {zh ? '开始探索' : 'Start exploring'}</p><h2 id="home-types-title">{zh ? '选一个方向，往里看。' : 'Start with a type.'}</h2><p>{zh ? '六类分开排行。每一类都有趋势、名次、图表和官方来源。' : 'Six separate collections. Each has trends, rankings, charts, and official sources.'}</p></div>
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
