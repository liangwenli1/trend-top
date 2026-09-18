import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { EnvelopeSimple } from '@phosphor-icons/react';
import { TYPES, TYPE_META, typePath, typeLabel, itemPath } from './catalog.js';
import { SourceBadge } from './source-badge.jsx';
import { HomeGrowthChart } from './home-growth.jsx';

const descriptions = {
  skill: ['可复用的 AI 指令与工作流', 'Reusable AI instructions and workflows'],
  plugin: ['连接工具、服务与数据', 'Connect tools, services, and data'],
  agent: ['编程、研究与任务执行', 'Coding, research, and task execution'],
  components: ['可使用的界面组件', 'Interface components you can use'],
  website: ['工具站、目录与资源', 'Tools, directories, and resources'],
  'github-repo': ['开源项目与源码', 'Open-source projects and code']
};
const read = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Content unavailable');
  return response.json();
};
const number = (value, l) => new Intl.NumberFormat(l === 'zh' ? 'zh-CN' : 'en-US').format(value);
const day = value => value?.slice(0, 10);

export function HomeEvidence({ item, l }) {
  const zh = l === 'zh';
  const selection = item.selection === 'type-hot' ? (zh ? '来自该类型的近 7 天 Hot 榜' : 'From this collection’s 7-day Hot board') : (zh ? '来自已收录目录；近期热度数据不足' : 'From the catalog; recent momentum is unavailable');
  return <div className="discovery-evidence"><p>{selection}</p>{item.gain != null && <p className="discovery-gain"><strong>{item.gain > 0 ? '+' : ''}{number(item.gain, l)}</strong><span>{item.metricScope === 'associated-repository' ? (zh ? '关联仓库 · ' : 'Associated repository · ') : ''}{item.growthBasis === 'star_created' ? (zh ? '近 7 天新增 Star' : 'New Stars · 7 days') : (zh ? '近 7 天 Star 净增' : 'Net Star gain · 7 days')}</span></p>}{item.updatedAt && <small>{item.stale ? (zh ? '上次有效数据' : 'Last available sample') : (zh ? '数据截至' : 'Sampled through')} {day(item.updatedAt)}</small>}</div>;
}

export function DigestPreviewButton({ l }) {
  const [open, setOpen] = useState(false), [preview, setPreview] = useState(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const zh = l === 'zh';
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setPreview(null); setError(false);
    read(`/api/home/digest-preview?locale=${l}`, controller.signal).then(value => { if (!controller.signal.aborted) setPreview(value); }).catch(err => { if (err.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [open, l, retry]);
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button type="button" className="home-outline-button"><EnvelopeSimple size={18} aria-hidden="true"/>{zh ? '查看示例邮件' : 'Preview the email'}</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content digest-preview-dialog"><Dialog.Close className="dialog-close" aria-label={zh ? '关闭' : 'Close'}>×</Dialog.Close><Dialog.Title>{zh ? '每日摘要会是什么样？' : 'What does the digest look like?'}</Dialog.Title><Dialog.Description>{zh ? '公开目录的格式预览；实际邮件按你的偏好生成。' : 'A format preview from the public catalog. Your email follows your preferences.'}</Dialog.Description>{preview ? <iframe title={zh ? '示例摘要邮件' : 'Sample digest email'} srcDoc={preview.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="digest-preview-frame"/> : <div className="discovery-state" role="status">{error ? <><p>{zh ? '暂时无法加载示例邮件。' : 'The preview is temporarily unavailable.'}</p><button className="primary" onClick={() => setRetry(value => value + 1)}>{zh ? '重试' : 'Retry'}</button></> : (zh ? '正在加载示例邮件…' : 'Loading the sample email…')}</div>}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function DiscoveryHome({ l, navigate }) {
  const zh = l === 'zh';
  const [data, setData] = useState(null), [introData, setIntroData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [type, setType] = useState(''), [useCase, setUseCase] = useState(''), [retry, setRetry] = useState(0);
  const initialAnchorHandled = useRef(false);
  const [chart, setChart] = useState(null), [chartError, setChartError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false); setData(null);
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (useCase) params.set('useCase', useCase);
    read(`/api/home${params.size ? '?' + params : ''}`, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setData(value); if (!type && !useCase) setIntroData(value);
    }).catch(err => { if (err.name !== 'AbortError') setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [type, useCase, retry]);
  useEffect(() => {
    const controller = new AbortController();
    read('/api/github-repo/charts?board=hot&period=week', controller.signal).then(value => { if (!controller.signal.aborted) setChart(value); }).catch(err => { if (err.name !== 'AbortError') setChartError(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (initialAnchorHandled.current || (!introData && !error)) return;
    initialAnchorHandled.current = true;
    const id = window.location.hash.slice(1);
    if (!['types', 'recent'].includes(id)) return;
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [introData, error]);
  const go = href => event => navigate(event, href);
  const types = introData?.types || TYPES.map(id => ({ id, ...TYPE_META[id], count: null }));
  const spotlight = introData?.items?.[0];
  const bars = chart?.bars?.slice(0, 3) || [];
  const growth = chart?.growthBasis === 'star_created' ? (zh ? '近 7 天新增 Star' : 'New Stars · 7 days') : (zh ? '近 7 天 Star 净增' : 'Net Star gain · 7 days');
  return <main className="page-shell type-home discovery-home">
    <section className="discovery-hero" aria-labelledby="home-title">
      <div className="discovery-hero-copy"><p className="home-kicker">TREND TOP / {zh ? '开源发现' : 'OPEN-SOURCE DISCOVERY'}</p><h1 id="home-title">{zh ? <>发现值得用的开源项目。<br/>看清变化，再做选择。</> : <>Find open source worth using.<br/>See what’s changing.</>}</h1><p className="discovery-intro">{zh ? '从 Skill、MCP 到 Agent 和仓库，查看近期变化、核对来源、比较同类。' : 'Explore skills, MCPs, agents, and more. Check recent movement, verify sources, and compare options.'}</p>
        <div className="discovery-hero-actions"><a className="primary" href="#recent">{zh ? '探索近期项目' : 'Explore recent projects'}</a></div>
      </div>
      <aside className="discovery-spotlight" aria-label={zh ? '先看一个项目' : 'A project to start with'}><div className="discovery-spotlight-heading"><span>{zh ? '先看一个' : 'START HERE'}</span><span>{introData?.source === 'demo' ? (zh ? '演示数据' : 'DEMO DATA') : '7 DAYS'}</span></div>{spotlight ? <><span className="discovery-type-label">{typeLabel(spotlight.type, l)}</span><h2><a href={itemPath(l, spotlight.type, spotlight.slug)} onClick={go(itemPath(l, spotlight.type, spotlight.slug))}>{spotlight.full_name}</a></h2><p>{spotlight.description}</p><HomeEvidence item={spotlight} l={l}/><div className="discovery-spotlight-foot"><SourceBadge l={l} official={Boolean(spotlight.officialEvidence)} evidence={spotlight.officialEvidence}/><a href={itemPath(l, spotlight.type, spotlight.slug)} onClick={go(itemPath(l, spotlight.type, spotlight.slug))}>{zh ? '了解项目' : 'View project'}</a></div></> : <p role="status">{error ? (zh ? '内容暂不可用；可以搜索或按类型浏览。' : 'Content unavailable. Search or browse a collection.') : introData ? (zh ? '先选择下面的类型，看看已收录项目。' : 'Choose a collection below to explore the catalog.') : (zh ? '正在读取近期项目…' : 'Loading a recent project…')}</p>}</aside>
    </section>

    <nav id="types" className="discovery-collections" aria-label={zh ? '六类开源资源' : 'Six open-source collections'}>{types.map(item => <a key={item.id} href={typePath(l, item.id)} onClick={go(typePath(l, item.id))}><div><strong>{item[zh ? 'zh' : 'en']}</strong><span>{item.count == null ? '—' : number(item.count, l)} {zh ? '条收录' : 'items'}</span></div><p>{descriptions[item.id][zh ? 0 : 1]}</p></a>)}</nav>

    <section className="discovery-section" id="recent" aria-labelledby="recent-title"><div className="discovery-section-heading"><div><p className="home-kicker">01 / {zh ? '开始探索' : 'DISCOVER'}</p><h2 id="recent-title">{zh ? '近期值得看。' : 'Worth a closer look.'}</h2><p>{zh ? '从各类型近 7 天 Hot 榜发现项目；不同类型分别比较，同产品聚合。' : 'Discover projects from each collection’s 7-day Hot board. Types are compared separately; duplicate products are merged.'}</p></div><a className="home-method-link" href={`/${l}/method`} onClick={go(`/${l}/method`)}>{zh ? '榜单方法' : 'Ranking method'}</a></div>
      <div className="discovery-type-filters" role="group" aria-label={zh ? '选择资源类型' : 'Choose a resource type'}>{[['', zh ? '全部' : 'All'], ...TYPES.map(id => [id, typeLabel(id, l)])].map(([id, label]) => <button key={id} type="button" aria-pressed={type === id} onClick={() => setType(id)}>{label}</button>)}</div>
      {introData?.tasks?.length > 0 && <div className="discovery-task-filters" role="group" aria-label={zh ? '按任务发现' : 'Discover by task'}><span>{zh ? '想完成什么？' : 'What are you working on?'}</span>{introData.tasks.map(task => <button key={task.id} type="button" aria-pressed={useCase === task.id} onClick={() => setUseCase(current => current === task.id ? '' : task.id)}>{task[zh ? 'zh' : 'en']}</button>)}{useCase && <button className="discovery-clear" type="button" onClick={() => setUseCase('')}>{zh ? '清除任务' : 'Clear task'}</button>}</div>}
      <div className="discovery-results" aria-busy={loading}>{loading ? <div className="discovery-skeletons" role="status" aria-label={zh ? '正在读取项目' : 'Loading projects'}>{[1, 2, 3].map(id => <div key={id}/>)}</div> : error ? <div className="discovery-state" role="status"><p>{zh ? '暂时无法读取项目。搜索和类型入口仍可使用。' : 'Projects are temporarily unavailable. Search and collection links remain available.'}</p><button type="button" className="primary" onClick={() => setRetry(value => value + 1)}>{zh ? '重试' : 'Retry'}</button></div> : data?.items.length ? <div className="discovery-card-grid">{data.items.map(item => <article className="discovery-card" key={item.productFamily}><div className="discovery-card-top"><span className="discovery-type-label">{typeLabel(item.type, l)}</span><SourceBadge l={l} official={Boolean(item.officialEvidence)} evidence={item.officialEvidence}/></div><h3><a href={itemPath(l, item.type, item.slug)} onClick={go(itemPath(l, item.type, item.slug))}>{item.full_name}</a></h3><p className="discovery-card-description">{item.description}</p>{item.useCaseLabel && <p className="discovery-card-task">{item.useCaseLabel[zh ? 'zh' : 'en']}</p>}<HomeEvidence item={item} l={l}/><a className="primary discovery-card-action" href={itemPath(l, item.type, item.slug)} onClick={go(itemPath(l, item.type, item.slug))}>{zh ? '查看详情' : 'View details'}</a></article>)}</div> : <div className="discovery-state" role="status"><p>{zh ? '当前类型和任务组合没有可展示的项目。' : 'No projects are available for this collection and task.'}</p><button type="button" className="primary" onClick={() => { setType(''); setUseCase(''); }}>{zh ? '查看全部项目' : 'Show all projects'}</button></div>}</div>
      <p className="discovery-data-note">{(data || introData)?.source === 'demo' ? (zh ? '演示数据 · ' : 'Demo data · ') : ''}{zh ? '按类型选取，不是跨类型总榜。数据时间见各项目；缺少热度历史时明确展示目录条目。' : 'Selected by collection, not a global leaderboard. Sample dates are shown per project; catalog entries are labeled when momentum history is unavailable.'}</p>{type && <a className="home-method-link" href={typePath(l, type, 'ranking', new URLSearchParams({ period: 'week', ...(useCase ? { useCase } : {}) }).toString())} onClick={go(typePath(l, type, 'ranking', new URLSearchParams({ period: 'week', ...(useCase ? { useCase } : {}) }).toString()))}>{zh ? '打开该类型完整排行' : 'Open this collection’s full ranking'}</a>}
    </section>

    <section className="discovery-section discovery-proof" aria-labelledby="home-proof-title"><div className="discovery-section-heading"><div><p className="home-kicker">02 / {zh ? '看清变化' : 'SEE THE MOVEMENT'}</p><h2 id="home-proof-title">{zh ? '增长，是一个线索。' : 'Growth is a starting point.'}</h2><p>{zh ? '查看仓库变化，再打开详情核对用途、来源和同类选择。' : 'See repository movement, then check the purpose, source, and alternatives in the details.'}</p></div></div><div className="home-proof-grid"><div className="home-proof-chart"><div className="home-proof-card-title"><span>{zh ? '仓库 Hot 榜首项目' : 'Repository Hot board leader'}</span><span>{growth}</span></div>{chart?.leader && <h3><a href={itemPath(l, 'github-repo', bars[0]?.id || chart.leader)} onClick={go(itemPath(l, 'github-repo', bars[0]?.id || chart.leader))}>{chart.leader}</a></h3>}<HomeGrowthChart chart={chart} l={l} loading={!chart && !chartError} error={chartError}/></div><div className="home-proof-rank"><div className="home-proof-card-title"><span>{zh ? '同榜项目' : 'On the same board'}</span><span>HOT · 7 DAYS</span></div><p className="discovery-proof-note">{zh ? '按 Hot 榜顺序展示；右侧数值为 Star 变化，不是增量排名。' : 'Ordered by the Hot board. Values show Star changes, not a growth ranking.'}</p>{bars.length ? <ol className="home-rank-bars">{bars.map((item, index) => <li key={item.id}><div className="home-rank-row"><span>{String(index + 1).padStart(2, '0')}</span><a href={itemPath(l, 'github-repo', item.id)} onClick={go(itemPath(l, 'github-repo', item.id))}>{item.name}</a><strong>{item.value > 0 ? '+' : ''}{number(item.value, l)}</strong></div></li>)}</ol> : <div className="home-chart-state" role="status">{chartError ? (zh ? '图表暂不可用。' : 'Charts are temporarily unavailable.') : chart ? (zh ? '历史数据不足。' : 'Insufficient history.') : (zh ? '正在读取榜单…' : 'Loading the board…')}</div>}<a className="home-proof-link" href={typePath(l, 'github-repo', 'charts', 'board=hot&period=week')} onClick={go(typePath(l, 'github-repo', 'charts', 'board=hot&period=week'))}>{zh ? '查看完整图表' : 'View all charts'}</a></div></div><p className="discovery-data-note">{zh ? '热度不等于适用性，也不代表安全认证。' : 'Momentum does not establish suitability or certify safety.'}</p></section>
  </main>;
}
