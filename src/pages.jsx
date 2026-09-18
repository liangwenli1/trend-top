import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { SourceBadge } from './source-badge.jsx';
import { TYPES, TYPE_META, typeLabel, typePath, itemPath, trendingCopy } from './catalog.js';
import { loginUrl } from '../shared/account-paths.js';
import { SourceProvenance } from './source-provenance.jsx';
import { ResourceGuide } from './resource-guide.jsx';

const fmt = (n, l) => n === null || n === undefined ? '—' : new Intl.NumberFormat(l === 'zh' ? 'zh-CN' : 'en-US').format(n);
const api = (url,options) => fetch(url,options).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; });

function preservedView(page) {
  if (page === 'charts') return 'charts';
  if (page === 'official') return 'official';
  if (page === 'trending') return '';
  return 'ranking';
}

export function TagActions({ l, type, item, navigate, showMeta = false }) {
  const id = String(item.slug || item.id);
  const compareQuery = `ids=${encodeURIComponent(id)}`;
  const [skillsOpen, setSkillsOpen] = useState(false), [skillQuery, setSkillQuery] = useState('');
  const go = (href, query) => e => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); setSkillsOpen(false); navigate(e, href, query); };
  const skills=item.skillResources || [];
  const skillGroups = [];
  for (const resource of skills) {
    let group = skillGroups.find(entry => entry.name.toLowerCase() === resource.name.toLowerCase());
    if (!group) { group = { name: resource.name, resources: [] }; skillGroups.push(group); }
    group.resources.push(resource);
  }
  return <>
    <div className="repo-tags">
      <SourceBadge l={l} official={Boolean(item.officialEvidence)} evidence={item.officialEvidence}/>
      <a className="tag-btn tag-btn-action" href={typePath(l, type, 'compare', compareQuery)} onClick={go(typePath(l, type, 'compare'), compareQuery)}>{l === 'zh' ? '对比同类' : 'Compare'}</a>
    </div>
    {skills.length > 0 && <Dialog.Root open={skillsOpen} onOpenChange={open => { setSkillsOpen(open); if (!open) setSkillQuery(''); }}><Dialog.Trigger asChild><button type="button" className="primary skill-explore-button">{l === 'zh' ? '查看 ' + item.skillCount + ' 个匹配 Skill' : 'Explore ' + item.skillCount + ' matching ' + (item.skillCount === 1 ? 'skill' : 'skills')}</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content skill-explore-dialog"><Dialog.Close className="dialog-close" aria-label={l === 'zh' ? '关闭' : 'Close'}>×</Dialog.Close><Dialog.Title>{l === 'zh' ? '仓库中的 Skill' : 'Skills in this repository'}</Dialog.Title><Dialog.Description>{item.skillRepository || item.full_name} · {l === 'zh' ? item.skillCount + ' 个匹配 Skill' : item.skillCount + ' matching ' + (item.skillCount === 1 ? 'skill' : 'skills')}</Dialog.Description><label className="skill-explore-search">{l === 'zh' ? '搜索名称或文件路径' : 'Search names or file paths'}<input type="search" value={skillQuery} onChange={e => setSkillQuery(e.target.value)} placeholder={l === 'zh' ? '搜索 Skill' : 'Search skills'}/></label><div className="skill-explore-results"><ul>{skillGroups.filter(group => (group.name + ' ' + group.resources.map(resource => resource.path).join(' ')).toLowerCase().includes(skillQuery.trim().toLowerCase())).map(group => <li className="skill-resource-group" key={group.name}><div className="skill-resource-heading"><strong>{group.name}</strong>{group.resources.length > 1 && <span>{l === 'zh' ? group.resources.length + ' 个路径' : group.resources.length + ' locations'}</span>}</div>{group.resources.map(resource => <a key={resource.id} href={itemPath(l, 'skill', resource.slug || resource.id)} onClick={go(itemPath(l, 'skill', resource.slug || resource.id))}><code>{resource.path}</code><span aria-hidden="true">→</span></a>)}</li>)}</ul>{skillQuery && !skillGroups.some(group => (group.name + ' ' + group.resources.map(resource => resource.path).join(' ')).toLowerCase().includes(skillQuery.trim().toLowerCase())) && <p role="status">{l === 'zh' ? '没有匹配的 Skill。' : 'No matching skills.'}</p>}</div><a className="primary skill-explore-all" href={itemPath(l, type, id)} onClick={go(itemPath(l, type, id))}>{l === 'zh' ? '查看产品全部资源' : 'View all product resources'}<span aria-hidden="true">↗</span></a></Dialog.Content></Dialog.Portal></Dialog.Root>}

  </>;
}

export function BackBtn({ href, onClick, children }) {
  return <a className="back-btn" href={href} onClick={onClick}>{children}</a>;
}

function TypeSwitcher({ l, type, page, query = '', navigate }) {
  const [open, setOpen] = useState(false);
  const view = preservedView(page);
  const q = query;
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!e.target.closest('.type-switch')) setOpen(false); };
    addEventListener('mousedown', close);
    return () => removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="type-switch">
      <button type="button" className="type-switch-btn" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(v => !v)}>
        {typeLabel(type, l)} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="type-switch-menu" role="listbox">
          {TYPES.map(id => (
            <li key={id} role="option" aria-selected={id === type}>
              <a
                href={typePath(l, id, view, q)}
                aria-current={id === type ? 'page' : undefined}
                onClick={e => { setOpen(false); navigate(e, typePath(l, id, view), q); }}
              >
                {TYPE_META[id][l === 'zh' ? 'zh' : 'en']}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ViewBar({ l, type, page, query = '', navigate }) {
  if (!type) return null;
  const current = page === 'charts' ? 'charts' : page === 'trending' ? 'trending' : page === 'official' ? 'official' : 'ranking';
  const views = [
    { id: 'trending', href: typePath(l, type), label: 'Trending' },
    { id: 'ranking', href: typePath(l, type, 'ranking', query), label: l === 'zh' ? '排行' : 'Rankings' },
    { id: 'charts', href: typePath(l, type, 'charts', query), label: l === 'zh' ? '图表' : 'Charts' },
    { id: 'official', href: typePath(l, type, 'official'), label: l === 'zh' ? '官方' : 'Official' }
  ];
  return (
    <nav className="view-bar" aria-label={l === 'zh' ? '类型与视图' : 'Type and views'}>
      <TypeSwitcher l={l} type={type} page={page} query={current === 'trending' || current === 'official' ? '' : query} navigate={navigate} />
      <div className="view-bar-tabs">
        {views.map(item => (
          <a
            key={item.id}
            className="view-bar-link"
            href={item.href}
            aria-current={current === item.id ? 'page' : undefined}
            onClick={e => {
              const [pathOnly, q] = item.href.split('?');
              navigate(e, pathOnly, q || '');
            }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function TypeTrending({ l, t, type, navigate }) {
  const copy = trendingCopy(type, l);
  const [period, setPeriod] = useState('day');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setError('');
    api(`/api/${type}/rankings?board=hot&period=${period}&limit=12`).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [type, period]);
  const items = data?.items || [];
  const featured = items.slice(0, 3);
  const rest = items.slice(3);
  return (
    <main className="page-shell trending-page">
      <header className="trending-lead">
        <div>
          <h1>{copy.title}</h1>
          <p className="hero-copy">{copy.sub}</p>
        </div>
        <div className="trending-lead-meta">
          <div className="data-status">{loading ? t.loading : data?.updatedAt ? `${t.updated} ${new Date(data.updatedAt).toLocaleDateString(l === 'zh' ? 'zh-CN' : 'en-US')}` : ''}</div>
          <div className="hero-stat"><b>{fmt(data?.total, l)}</b><span>{typeLabel(type, l)}</span></div>
        </div>
      </header>
      <div className="trending-periods" role="tablist" aria-label={t.period}>
        {['day', 'week', 'month'].map(id => (
          <button key={id} type="button" className={period === id ? 'is-active' : ''} onClick={() => setPeriod(id)}>{t[id]}</button>
        ))}
      </div>
      {loading ? <div className="skeletons" aria-label={t.loading}>{[1, 2, 3].map(x => <div key={x} />)}</div> : error ? <div className="state"><p>{t.error}</p></div> : !featured.length ? <div className="state">{data?.dataInsufficient ? t.insufficient : t.empty}</div> : (
        <>
          <section className="trending-featured" aria-label={l === 'zh' ? '近窗口前三' : 'Top movers'}>
            {featured.map(item => {
              const id = String(item.slug || item.id);
              return (
                <article className="trending-card" key={item.id}>
                  <span className="rank-num">{String(item.rank).padStart(2, '0')}</span>
                  <a className="repo-name" href={itemPath(l, type, id)} onClick={e => { e.preventDefault(); navigate(e, itemPath(l, type, id)); }}>{item.skillRepository || item.full_name} <span>↗</span></a>
                  <p>{item.description || '—'}</p>
                  <div className="trending-card-metrics">
                    <div><small>{t.gain}</small><strong className="positive">{item.gain == null ? t.insufficient : `+${fmt(item.gain, l)}`}</strong></div>
                    <div><small>{t.score}</small><strong>{fmt(item.score, l)}</strong></div>
                    <div><small>{t.stars}</small><strong>{fmt(item.stars, l)}</strong></div>
                  </div>
                  <TagActions l={l} type={type} item={item} navigate={navigate} showMeta={type === 'github-repo'} />
                </article>
              );
            })}
          </section>
          {rest.length > 0 && (
            <section className="trending-rest">
              <div className="section-heading"><div><h2>{l === 'zh' ? '同样在动' : 'Also moving'}</h2><p>{l === 'zh' ? '完整排行和筛选在 Rankings。' : 'Full filters live on Rankings.'}</p></div>
                <a className="hero-ranking-link" href={typePath(l, type, 'ranking')} onClick={e => navigate(e, typePath(l, type, 'ranking'))}>{l === 'zh' ? '查看排行' : 'Open rankings'}</a>
              </div>
              <div className="repo-list">
                {rest.map(item => {
                  const id = String(item.slug || item.id);
                  return (
                    <article className="repo-row" key={item.id}>
                      <div className="repo-identity">
                        <span className="rank-num">{String(item.rank).padStart(2, '0')}</span>
                        <div>
                          <a className="repo-name" href={itemPath(l, type, id)} onClick={e => { e.preventDefault(); navigate(e, itemPath(l, type, id)); }}>{item.full_name} <span>↗</span></a>
                          <p>{item.description || '—'}</p>
                          <TagActions l={l} type={type} item={item} navigate={navigate} showMeta={type === 'github-repo'} />
                        </div>
                      </div>
                      <div className="metric primary-metric"><small>{t.gain}</small><strong className={item.gain != null ? 'positive' : ''}>{item.gain == null ? t.insufficient : `+${fmt(item.gain, l)}`}</strong></div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

const HOME_TYPE_COPY = {
  skill: { zh: '可复用的指令与工作流。', en: 'Reusable instructions and workflows.' },
  plugin: { zh: '插件与 MCP 服务，按用途筛选。', en: 'Plugins and MCP servers, grouped by purpose.' },
  agent: { zh: '编程、研究与浏览器 Agent。', en: 'Agents for coding, research, and the browser.' },
  components: { zh: '可直接使用的界面组件。', en: 'Interface components you can put to work.' },
  website: { zh: '开源工具站、目录与资源。', en: 'Open-source tools, directories, and resources.' },
  'github-repo': { zh: '关注近期增势，而非只有总 Star。', en: 'Recent momentum, beyond all-time Star totals.' }
};

function HomeGrowthChart({ chart, l, loading, error }) {
  const zh = l === 'zh';
  const growthLabel = chart?.growthBasis === 'star_created'
    ? (zh ? '累计新增 Star · 近 7 天' : 'Cumulative new Stars · 7 days')
    : (zh ? '累计 Star 净增 · 近 7 天' : 'Cumulative net Star gain · 7 days');
  const points = chart?.points || [];
  const ready = !chart?.insufficient && points.length > 1 && points.every(point => Number.isFinite(point.gain));
  if (!ready) return <div className="home-chart-state" role="status">{loading ? (zh ? '正在读取增长数据…' : 'Loading growth data…') : error ? (zh ? '暂时无法读取增长数据。' : 'Growth data is temporarily unavailable.') : (zh ? '历史数据积累后会显示增长曲线。' : 'The growth curve appears when enough history is available.')}</div>;

  const max = Math.max(1, ...points.map(point => point.gain));
  const coordinates = points.map((point, index) => ({
    x: 18 + index * 604 / (points.length - 1),
    y: 205 - point.gain / max * 170
  }));
  const line = coordinates.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L622 205 L18 205 Z`;
  const last = coordinates[coordinates.length - 1];
  const finalGain = points.at(-1).gain;
  return <figure className="home-growth-figure">
    <figcaption className="home-growth-value"><strong>{finalGain > 0 ? '+' : ''}{fmt(finalGain, l)}</strong><span>{growthLabel}</span></figcaption>
    <div className="home-growth-plot">
      <div className="home-growth-scale" aria-hidden="true"><span>{fmt(max, l)}</span><span>0</span></div>
      <svg viewBox="0 0 640 230" preserveAspectRatio="none" aria-hidden="true">
        <path className="home-growth-grid" d="M18 35 H622 M18 120 H622 M18 205 H622" />
        <path className="home-growth-area" d={area} />
        <path className="home-growth-line" d={line} pathLength="1" />
        <circle className="home-growth-endpoint" cx={last.x} cy={last.y} r="5" />
      </svg>
    </div>
    <div className="home-growth-dates"><span>{points[0].date.slice(5)}</span><span>{points.at(-1).date.slice(5)}</span></div>
    <table className="sr-only"><caption>{growthLabel}</caption><thead><tr><th>{zh ? '日期' : 'Date'}</th><th>{zh ? 'Star 变化' : 'Star change'}</th></tr></thead><tbody>{points.map(point => <tr key={point.date}><td>{point.date}</td><td>{fmt(point.gain, l)}</td></tr>)}</tbody></table>
  </figure>;
}

export function TypeHome({ l, t, navigate }) {
  const [data, setData] = useState(null);
  const [chart, setChart] = useState(null);
  const [chartError, setChartError] = useState(false);
  const zh = l === 'zh';
  useEffect(() => {
    let active = true;
    api('/api/types').then(result => { if (active) setData(result); }).catch(() => { if (active) setData({ source: 'unavailable', types: TYPES.map(id => ({ id, ...TYPE_META[id], count: null })) }); });
    api('/api/github-repo/charts?board=hot&period=week').then(result => { if (active) setChart(result); }).catch(() => { if (active) setChartError(true); });
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
      <p className="home-proof-footnote">{zh ? '图表来自仓库热门榜。' : 'From the repository Hot board.'}</p>
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

export function CategoryPage({ l, t, type, category, navigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/api/${type}/categories/${encodeURIComponent(category)}`).then(setData).catch(e => setError(e.message));
  }, [type, category]);
  if (!data && !error) return <main className="simple-page">{t.loading}</main>;
  if (error) return <main className="simple-page">{t.error}</main>;
  const label = data.label?.[l === 'zh' ? 'zh' : 'en'] || category;
  const ranking = data.ranking?.items || [];
  const recommended = data.recommend || [];
  const detailHref = item => itemPath(l, type, item.slug || item.id);
  const compareQuery = item => `ids=${encodeURIComponent(item.slug || item.id)}`;
  const compareHref = item => typePath(l, type, 'compare', compareQuery(item));
  return (
    <main className="simple-page catalog-category-page">
      <header className="catalog-page-header">
        <BackBtn href={typePath(l, type, 'ranking')} onClick={e => navigate(e, typePath(l, type, 'ranking'))}>{l === 'zh' ? '返回排行' : 'Back to rankings'}</BackBtn>
        <p className="catalog-kicker">{typeLabel(type, l)} <span aria-hidden="true">/</span> {l === 'zh' ? '同类发现' : 'Explore a category'}</p>
        <div className="catalog-heading-line"><div><h1>{label}</h1><p>{l === 'zh' ? '先看值得关注的选择，再浏览这一类的完整排行。' : 'Explore a few notable options, then browse the full ranking in this category.'}</p></div><span className="catalog-count"><strong>{ranking.length}</strong>{l === 'zh' ? '个项目' : 'projects'}</span></div>
      </header>

      {recommended.length > 0 && <section className="category-featured" aria-labelledby="category-featured-title">
        <div className="catalog-section-heading"><div><span className="catalog-section-index">01 / {l === 'zh' ? '精选' : 'Selected'}</span><h2 id="category-featured-title">{l === 'zh' ? '先看这些' : 'A good place to start'}</h2></div><p>{l === 'zh' ? '同类中的不同选择' : 'Distinct options within this category'}</p></div>
        <div className="category-featured-grid">{recommended.map((item, index) => <article className="category-feature-card" key={item.id}>
          <div className="category-card-top"><span className="category-card-number">{String(index + 1).padStart(2, '0')}</span>{item.official && <SourceBadge l={l} official evidence={item.officialEvidence}/>}</div>
          <h3><a href={detailHref(item)} onClick={e => navigate(e, detailHref(item))}>{item.full_name} <span aria-hidden="true">↗</span></a></h3>
          <p className="category-card-description">{item.description}</p>
          {(item.recommendNote?.[l] || item.recommendNote?.en) && <p className="category-card-note">{item.recommendNote?.[l] || item.recommendNote?.en}</p>}
          <div className="category-card-bottom"><div><small>{t.stars}</small><strong>{fmt(item.stars, l)}</strong></div><a className="catalog-button" href={compareHref(item)} onClick={e => navigate(e, typePath(l, type, 'compare'), compareQuery(item))}>{l === 'zh' ? '对比同类' : 'Compare peers'} <span aria-hidden="true">↗</span></a></div>
        </article>)}</div>
      </section>}

      <section className="category-ranking" aria-labelledby="category-ranking-title">
        <div className="catalog-section-heading"><div><span className="catalog-section-index">{recommended.length ? '02' : '01'} / {l === 'zh' ? '排行' : 'Ranking'}</span><h2 id="category-ranking-title">{l === 'zh' ? '完整排行' : 'Full ranking'}</h2></div><p>{l === 'zh' ? `${ranking.length} 个项目` : `${ranking.length} projects`}</p></div>
        <div className="category-ranking-list">{ranking.map((item, index) => <article className="category-rank-row" key={item.id}>
          <span className="category-rank-number">{String(item.rank || index + 1).padStart(2, '0')}</span>
          <div className="category-rank-identity"><h3><a href={detailHref(item)} onClick={e => navigate(e, detailHref(item))}>{item.full_name} <span aria-hidden="true">↗</span></a></h3><p>{item.description}</p><div className="category-rank-tags"><SourceBadge l={l} official={item.official} evidence={item.officialEvidence}/>{item.language && <span>{item.language}</span>}{(item.topics || []).slice(0, 2).map(topic => <span key={topic}>{topic}</span>)}</div></div>
          <div className="category-rank-stat"><small>{t.stars}</small><strong>{fmt(item.stars, l)}</strong></div>
          <div className="category-rank-stat"><small>{t.gain}</small><strong>{item.gain == null ? t.insufficient : `+${fmt(item.gain, l)}`}</strong></div>
          <a className="category-rank-action" href={compareHref(item)} onClick={e => navigate(e, typePath(l, type, 'compare'), compareQuery(item))}>{l === 'zh' ? '对比' : 'Compare'} <span aria-hidden="true">↗</span></a>
        </article>)}</div>
      </section>
    </main>
  );
}

export function ComparePage({ l, t, type, ids, navigate }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api(`/api/${type}/compare?ids=${encodeURIComponent(ids)}`).then(setData).catch(() => setData({ items: [] }));
  }, [type, ids]);
  if (!data) return <main className="simple-page">{t.loading}</main>;
  const items = data.items || [];
  const label = items[0]?.categoryLabel?.[l === 'zh' ? 'zh' : 'en'] || items[0]?.category;
  const categoryHref = items[0]?.category ? typePath(l, type, `c/${items[0].category}`) : typePath(l, type, 'ranking');
  const detailHref = item => itemPath(l, type, item.slug || item.id);
  return (
    <main className="simple-page catalog-compare-page">
      <header className="catalog-page-header">
        <BackBtn href={categoryHref} onClick={e => navigate(e, categoryHref)}>{l === 'zh' ? '返回同类' : 'Back to category'}</BackBtn>
        <p className="catalog-kicker">{typeLabel(type, l)}{label ? <> <span aria-hidden="true">/</span> {label}</> : null}</p>
        <div className="catalog-heading-line"><div><h1>{l === 'zh' ? '把选择放在一起。' : 'See the options side by side.'}</h1><p>{l === 'zh' ? '比较来源、活跃度和增长，再打开详情做决定。' : 'Compare source, activity, and growth before opening the details.'}</p></div><span className="catalog-count"><strong>{items.length}</strong>{l === 'zh' ? '个选项' : 'options'}</span></div>
      </header>
      {items.length === 0 ? <div className="catalog-empty">{l === 'zh' ? '没有找到可对比的项目。' : 'No items were found for this comparison.'}</div> : <>
        {items.length < 2 && <p className="compare-context">{l === 'zh' ? '目前没有更多同类项目可比较。' : 'There are no additional peers in this category yet.'}</p>}
        <section className="compare-results" aria-labelledby="compare-results-title">
          <div className="catalog-section-heading"><div><span className="catalog-section-index">01 / {l === 'zh' ? '对比' : 'Comparison'}</span><h2 id="compare-results-title">{l === 'zh' ? '关键差异' : 'At a glance'}</h2></div><p>{l === 'zh' ? '数据不足时不推测增长' : 'Missing growth history is shown as unavailable'}</p></div>
          <div className="compare-card-grid">{items.map((item, index) => <article className="compare-option-card" key={item.id}>
            <div className="compare-option-top"><span>{l === 'zh' ? '选项' : 'Option'} {String(index + 1).padStart(2, '0')}</span><SourceBadge l={l} official={item.official} evidence={item.officialEvidence}/></div>
            <h3><a href={detailHref(item)} onClick={e => navigate(e, detailHref(item))}>{item.full_name} <span aria-hidden="true">↗</span></a></h3>
            <p className="compare-option-description">{item.description}</p>
            <dl className="compare-metrics">
              <div><dt>{t.stars}</dt><dd>{fmt(item.stars, l)}</dd></div>
              <div><dt>{t.gain}</dt><dd>{item.gain == null ? <span className="compare-unavailable">{t.insufficient}</span> : `+${fmt(item.gain, l)}`}</dd></div>
              <div><dt>{t.forks}</dt><dd>{fmt(item.forks, l)}</dd></div>
              {item.usage != null && <div><dt>{item.usageKind === 'downloads' ? (l === 'zh' ? '下载' : 'Downloads') : item.usageKind === 'usage' ? (l === 'zh' ? '用量' : 'Usage') : (l === 'zh' ? '安装量' : 'Installs')}</dt><dd>{fmt(item.usage, l)}</dd></div>}
              {item.compare?.protocol && <div><dt>{l === 'zh' ? '协议' : 'Protocol'}</dt><dd>{item.compare.protocol}</dd></div>}
              {item.compare?.runtime && <div><dt>{l === 'zh' ? '形态' : 'Runtime'}</dt><dd>{item.compare.runtime}</dd></div>}
              {item.compare?.transport && <div><dt>{l === 'zh' ? '传输' : 'Transport'}</dt><dd>{item.compare.transport}</dd></div>}
              {item.compare?.identity && <div><dt>{l === 'zh' ? '标识' : 'Identity'}</dt><dd>{item.compare.identity}</dd></div>}
              {item.compare?.hosts && <div><dt>{l === 'zh' ? '适用' : 'Works with'}</dt><dd>{item.compare.hosts}</dd></div>}
              {item.compare?.listed && <div><dt>{l === 'zh' ? '目录' : 'Directory'}</dt><dd>{item.compare.listed}</dd></div>}
              {item.compare?.language && <div><dt>{l === 'zh' ? '语言' : 'Language'}</dt><dd>{item.compare.language}</dd></div>}
              <div><dt>{l === 'zh' ? '距上次更新' : 'Last updated'}</dt><dd>{item.pushDays == null ? '—' : item.pushDays === 0 ? (l === 'zh' ? '今天' : 'Today') : l === 'zh' ? `${fmt(item.pushDays, l)} 天前` : `${fmt(item.pushDays, l)}d ago`}</dd></div>
            </dl>
            <div className="compare-option-foot"><p>{(item.recommendNote?.[l] || item.recommendNote?.en) || (item.officialEvidence ? `${l === 'zh' ? '官方依据' : 'Official source'}: ${item.officialEvidence}` : (l === 'zh' ? '社区来源，没有官方依据。' : 'Community source; no official evidence.'))}</p><div className="compare-option-links"><a href={detailHref(item)} onClick={e => navigate(e, detailHref(item))}>{l === 'zh' ? '查看详情' : 'View details'} <span aria-hidden="true">↗</span></a>{(item.compare?.source || item.url) && <a href={item.compare?.source || item.url} target="_blank" rel="noopener noreferrer">{l === 'zh' ? '打开来源' : 'Open source'} <span aria-hidden="true">↗</span></a>}</div></div>
          </article>)}</div>
        </section>
        <a className="compare-more-link" href={categoryHref} onClick={e => navigate(e, categoryHref)}>{l === 'zh' ? `浏览 ${label || ''} 完整排行` : `Explore the full ${label || ''} ranking`} <span aria-hidden="true">↗</span></a>
      </>}
    </main>
  );
}

export function HeaderSearch({ l, t, navigate, q = '' }) {
  const [value, setValue] = useState(q);
  useEffect(() => { setValue(q); }, [q]);
  return (
    <form className="header-search" role="search" onSubmit={e => {
      e.preventDefault();
      const next = value.trim();
      if (!next) return;
      navigate({ preventDefault() {}, button: 0 }, `/${l}/search`, `q=${encodeURIComponent(next)}`);
    }}>
      <span aria-hidden="true">⌕</span>
      <input
        type="search"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={l === 'zh' ? '搜索 Skill、插件、Agent、仓库…' : 'Search skills, plugins, agents, repos…'}
        aria-label={l === 'zh' ? '搜索' : 'Search'}
        autoComplete="off"
      />
      {value && <button type="button" className="header-search-clear" aria-label={l === 'zh' ? '清除' : 'Clear'} onClick={() => setValue('')}>×</button>}
    </form>
  );
}

export function SearchPage({ l, t, q, typeFilter = '', navigate }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!q) { setData({ items: [] }); return; }
    const controller = new AbortController();
    const params = new URLSearchParams({ q });
    if (typeFilter) params.set('type', typeFilter);
    fetch(`/api/search?${params}`, { signal: controller.signal })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; })
      .then(setData)
      .catch(e => { if (e.name !== 'AbortError') setData({ items: [] }); });
    return () => controller.abort();
  }, [q, typeFilter]);
  const items = data?.items || [];
  const groups = !typeFilter?[{id:'all',items}]:TYPES.map(id => ({ id, items: items.filter(item => item.type === id) })).filter(group => group.items.length);
  const setFilter = id => navigate({ preventDefault() {}, button: 0 }, `/${l}/search`, `q=${encodeURIComponent(q)}${id ? `&type=${id}` : ''}`);
  return (
    <main className="search-page">
      <BackBtn href={`/${l}/home`} onClick={e => { e.preventDefault(); navigate(e, `/${l}/home`); }}>{l === 'zh' ? '返回首页' : 'Back to home'}</BackBtn>
      <div className="search-chips" role="tablist" aria-label={l === 'zh' ? '类型' : 'Types'}>
        <button type="button" className={!typeFilter ? 'is-active' : ''} onClick={() => setFilter('')}>{l === 'zh' ? '全部' : 'All'}</button>
        {TYPES.map(id => (
          <button key={id} type="button" className={typeFilter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{typeLabel(id, l)}</button>
        ))}
      </div>
      {!q && <p className="search-hint">{l === 'zh' ? '输入后按回车搜索。点 Logo 或「返回首页」可回首页。' : 'Press Enter to search. Use the logo or Back to home to return.'}</p>}
      {q && data && !items.length && <p className="state">{t.empty}</p>}
      {groups.map(group => (
        <section className="search-group" key={group.id}>
          <div className="search-group-head">
            <h2>{group.id==='all'?(l==='zh'?'项目':'Projects'):typeLabel(group.id,l)}</h2>
            <span>{l === 'zh' ? `${group.items.length} 条` : `${group.items.length} results`}</span>
          </div>
          <div className="search-cards">
            {group.items.map(item => (
              <article className="search-card" key={`${item.type}-${item.id}`}>
                <span className="search-card-kicker">{item.official ? 'Official' : typeLabel(item.type, l)}</span>
                <a className="repo-name" href={itemPath(l, item.type, item.slug || item.id)} onClick={e => { e.preventDefault(); navigate(e, itemPath(l, item.type, item.slug || item.id)); }}>{item.full_name}</a>
                <p>{item.description || '—'}</p>
                <TagActions l={l} type={item.type} item={item} navigate={navigate} />
                {!typeFilter&&item.resources?.length>1&&<div className="product-resources">{item.resources.slice(0,6).map(resource=><a className="tag-btn" key={resource.type+resource.id} href={itemPath(l,resource.type,resource.slug || resource.id)} onClick={event=>{event.preventDefault();navigate(event,itemPath(l,resource.type,resource.slug || resource.id))}}>{typeLabel(resource.type,l)}{resource.type==='skill'?' · '+resource.full_name.split(' / ').pop():''}</a>)}</div>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

export function ItemDetail({ l, t, type, id, navigate, viewer }) {
  const [item, setItem] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const controller=new AbortController();setItem(null);setMsg('');
    api(`/api/${type}/items/${encodeURIComponent(id)}`,{signal:controller.signal}).then(setItem).catch(error=>{if(error.name!=='AbortError')setMsg(t.error)});
    return()=>controller.abort();
  }, [type, id]);
  if (!item) return <main className="simple-page">{msg || t.loading}</main>;
  const note = l === 'zh' ? item.recommendNote?.zh : item.recommendNote?.en;
  const topicValues = [];
  const topicKeys = new Set();
  for (const value of (Array.isArray(item.topics) ? item.topics : [])) {
    const text = String(value ?? '').trim();
    const key = text.toLowerCase();
    if (text && !topicKeys.has(key)) {
      topicKeys.add(key);
      topicValues.push(text);
    }
  }
  const topicHref = value => typePath(l, type, 'ranking', `topic=${encodeURIComponent(value)}`);
  const githubHref = item.sourceRepoUrl || (/github\.com/i.test(item.url || '') ? item.url : null);
  const siteHref = item.websiteUrl && item.websiteUrl !== githubHref ? item.websiteUrl : (type === 'website' ? (item.url || item.websiteUrl) : null);
  const usageLabel = item.usageKind === 'downloads' ? (l === 'zh' ? '下载' : 'Downloads') : item.usageKind === 'usage' ? (l === 'zh' ? '用量' : 'Usage') : (l === 'zh' ? '安装量' : 'Installs');
  const associatedMetrics = item.provenance?.metrics.some(metric => metric.kind === 'stars' && metric.scope === 'associated-repository');
  const showRepositoryMetrics = associatedMetrics || type === 'github-repo' || item.mode === 'demo';
  return (
    <main className="simple-page repo-detail">
      <BackBtn href={typePath(l, type, 'ranking')} onClick={e => { e.preventDefault(); navigate(e, typePath(l, type, 'ranking')); }}>{l === 'zh' ? '返回排行' : 'Back to rankings'}</BackBtn>
      <p className="eyebrow">{typeLabel(type, l)}</p>
      <h1>{item.full_name}</h1>
      <p className="detail-description">{item.description}</p>
      <div className="repo-tags">
        {item.officialEvidence && <SourceBadge l={l} official evidence={item.officialEvidence}/>}
        {item.useCase && item.useCase !== 'other' && <a className="tag-btn" href={typePath(l, type, 'ranking', `useCase=${encodeURIComponent(item.useCase)}`)} onClick={e => { e.preventDefault(); navigate(e, typePath(l, type, 'ranking'), `useCase=${encodeURIComponent(item.useCase)}`); }}>{item.useCaseLabel?.[l === 'zh' ? 'zh' : 'en'] || item.useCase}</a>}
        {topicValues.filter(value => !['uncategorized', 'other'].includes(value.toLowerCase())).slice(0, 5).map(value => <a className="tag-btn detail-topic-tag" key={value} href={topicHref(value)} onClick={e => { e.preventDefault(); navigate(e, topicHref(value)); }}>{value}</a>)}
      </div>
      <div className="repo-tags detail-actions">
        <a className="tag-btn tag-btn-action" href={typePath(l, type, 'compare', `ids=${encodeURIComponent(item.slug || item.id)}`)} onClick={e => { e.preventDefault(); navigate(e, typePath(l, type, 'compare'), `ids=${encodeURIComponent(item.slug || item.id)}`); }}>{l === 'zh' ? '对比同类' : 'Compare'}</a>
        <WatchButton l={l} type={type} item={item} viewer={viewer} navigate={navigate} />
      </div>
      {item.officialEvidence && <p>{l === 'zh' ? '官方依据：' : 'Official evidence: '}{item.officialEvidence}</p>}
      {!item.officialEvidence && <p>{l === 'zh' ? '没有官方依据，按社区来源展示。' : 'No official evidence; shown as a community source.'}</p>}
      {note && <p>{l === 'zh' ? '和相邻选项的差别：' : 'How it differs: '}{note}</p>}
      {type === 'website' && !item.stars && item.gain == null && item.usage == null ? <p className="detail-data-pending">{l === 'zh' ? '独立网站还没有热度或用量数据。' : 'This site does not have momentum or usage data yet.'}</p> : <div className="detail-metrics">
        {showRepositoryMetrics && <><div><small>{associatedMetrics ? (l === 'zh' ? '关联仓库 Star' : 'Repository stars') : t.stars}</small><strong>{fmt(item.stars, l)}</strong></div>
        <div><small>{l === 'zh' ? '近 7 天新增 Star' : 'New stars in 7 days'}</small><strong>{item.gain == null ? t.insufficient : `${item.gain >= 0 ? '+' : ''}${fmt(item.gain, l)}`}</strong></div>
        <div><small>{associatedMetrics ? (l === 'zh' ? '关联仓库 Fork' : 'Repository forks') : t.forks}</small><strong>{fmt(item.forks, l)}</strong></div></>}
        {item.usage != null && <div><small>{usageLabel}</small><strong>{fmt(item.usage, l)}</strong></div>}
      </div>}
      <div className="detail-source-actions">
        {siteHref && <a className="primary inline" href={siteHref} target="_blank" rel="noopener noreferrer">{l === 'zh' ? '访问网站' : 'Visit website'} ↗</a>}
        {githubHref && githubHref !== siteHref && <a className={siteHref ? 'ghost inline' : 'primary inline'} href={githubHref} target="_blank" rel="noopener noreferrer">{t.github} ↗</a>}
      </div>
      <SourceProvenance l={l} provenance={item.provenance}/>
      <ResourceGuide l={l} item={item}/>
      {item.resources?.length>1&&<section className="resource-family"><h2>{l==='zh'?'同一产品的资源':'Resources in this product'}</h2><details><summary>{l==='zh'?`查看 ${item.resources.length} 个关联资源`:`View ${item.resources.length} related resources`}</summary><div className="resource-family-list">{item.resources.map(resource=><a className="resource-family-link" key={resource.type+resource.id} href={itemPath(l,resource.type,resource.slug || resource.id)} onClick={event=>{event.preventDefault();navigate(event,itemPath(l,resource.type,resource.slug || resource.id))}}><span>{typeLabel(resource.type,l)}</span><strong>{resource.full_name.split(' / ').pop()}</strong>{resource.resourcePath && <code>{resource.resourcePath}</code>}</a>)}</div></details></section>}
      {(item.similar || []).length>0&&<section className="related-section"><div className="related-heading"><h2>{l==='zh'?'相关项目':'Related projects'}</h2><span>{item.relatedCount ?? item.similarCount}</span></div><RelatedCards l={l} items={item.similar.slice(0,6)} navigate={navigate}/>{(item.relatedCount ?? item.similarCount)>6&&<a className="ghost inline" href={'/'+l+'/'+type+'/related/'+encodeURIComponent(item.slug || item.id)} onClick={event=>{event.preventDefault();navigate(event,'/'+l+'/'+type+'/related/'+encodeURIComponent(item.slug || item.id))}}>{l==='zh'?'查看全部相关项目':'View all related projects'}</a>}</section>}
    </main>
  );
}

function WatchButton({ l, type, item, viewer, navigate }) {
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = String(item.slug || item.id);
  const detailPath = itemPath(l, type, id);
  useEffect(() => {
    setError('');
    if (!viewer) { setWatching(false); return; }
    const controller = new AbortController();
    fetch(`/api/watches/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async r => {
      const data = await r.json().catch(() => ({}));
      if (r.ok) setWatching(Boolean(data.watching));
    }).catch(error => { if (error.name !== 'AbortError') setWatching(false); });
    return () => controller.abort();
  }, [viewer, type, id]);
  const click = async event => {
    event.preventDefault();
    if (!viewer) { navigate(event, loginUrl(l, detailPath)); return; }
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/watches', {
        method: watching ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id })
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { navigate(event, loginUrl(l, detailPath)); return; }
      if (response.status === 403) { navigate(event, `/${l}/pricing`); return; }
      if (!response.ok) throw new Error(data.error || 'Watch failed');
      setWatching(Boolean(data.watching));
    } catch (err) {
      setError(err.message === 'Watch limit reached'
        ? (l === 'zh' ? '最多关注 100 个项目，请先取消部分关注。' : 'You can watch 100 projects. Unwatch a project to add another.')
        : (l === 'zh' ? '操作失败，请重试。' : 'Could not update your watchlist. Try again.'));
    } finally { setBusy(false); }
  };
  return <><button type="button" className="tag-btn tag-btn-action" disabled={busy} onClick={click}>{watching ? (l === 'zh' ? '已关注' : 'Watching') : (l === 'zh' ? '关注' : 'Watch')}</button>{error && <span role="alert">{error}</span>}</>;
}

function RelatedCards({l,items,navigate}) {
  return <div className="related-cards">{items.map(item=><article className="related-card" key={item.type+item.id}><a className="repo-name" href={itemPath(l,item.type,item.slug || item.id)} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(event,itemPath(l,item.type,item.slug || item.id))}}>{item.full_name}</a><p>{item.description || '—'}</p>{item.relatedReasons&&<small className="related-reason">{item.relatedReasons.topics.length?(l==='zh'?'共同主题：':'Shared topics: ')+item.relatedReasons.topics.join(','):item.relatedReasons.purpose?(l==='zh'?'相近用途':'Similar purpose'):(l==='zh'?'相同专门分类':'Same specific category')}</small>}</article>)}</div>;
}
export function RelatedPage({l,type,id,navigate}) {
  const [data,setData]=useState(null),[page,setPage]=useState(1),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setError('');setData(null);
    api('/api/'+type+'/items/'+encodeURIComponent(id)+'/similar?page='+page+'&limit=12',{signal:controller.signal}).then(setData).catch(error=>{if(error.name!=='AbortError')setError(error.message)});
    return()=>controller.abort();
  },[type,id,page,retry]);
  return <main className="simple-page related-page"><BackBtn href={itemPath(l,type,id)} onClick={event=>{event.preventDefault();navigate(event,itemPath(l,type,id))}}>{l==='zh'?'返回项目详情':'Back to project'}</BackBtn><h1>{l==='zh'?'相关项目':'Related projects'}</h1>{!data?<p role="status">{error || (l==='zh'?'加载中…':'Loading…')}</p>:<><p>{data.total} {l==='zh'?'个相关项目':'related projects'}</p><RelatedCards l={l} items={data.items} navigate={navigate}/><nav className="related-pagination" aria-label={l==='zh'?'分页':'Pagination'}><button className="ghost" disabled={page<=1} onClick={()=>{setPage(value=>value-1);window.scrollTo(0,0)}}>{l==='zh'?'上一页':'Previous'}</button><span>{page} / {Math.max(1,Math.ceil(data.total/12))}</span><button className="ghost" disabled={page*12>=data.total} onClick={()=>{setPage(value=>value+1);window.scrollTo(0,0)}}>{l==='zh'?'下一页':'Next'}</button></nav></>}{error&&<button type="button" onClick={()=>setRetry(value=>value+1)}>{l==='zh'?'重试':'Retry'}</button>}</main>;
}
