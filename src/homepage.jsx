import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { TYPES, TYPE_META, typePath, typeLabel, itemPath } from './catalog.js';
import { SourceBadge } from './source-badge.jsx';

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
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button type="button" className="home-outline-button">{zh ? '预览订阅内容' : 'Preview what you get'}</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content digest-preview-dialog"><Dialog.Close className="dialog-close" aria-label={zh ? '关闭' : 'Close'}>×</Dialog.Close><Dialog.Title>{zh ? '你会收到什么？' : 'Preview what you get'}</Dialog.Title><Dialog.Description>{zh ? '公开目录的格式预览；实际邮件按你的偏好生成。' : 'A format preview from the public catalog. Your email follows your preferences.'}</Dialog.Description>{preview ? <iframe title={zh ? '示例摘要邮件' : 'Sample digest email'} srcDoc={preview.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="digest-preview-frame"/> : <div className="discovery-state" role="status">{error ? <><p>{zh ? '暂时无法加载示例邮件。' : 'The preview is temporarily unavailable.'}</p><button className="primary" onClick={() => setRetry(value => value + 1)}>{zh ? '重试' : 'Retry'}</button></> : (zh ? '正在加载示例邮件…' : 'Loading the sample email…')}</div>}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function WorthCloserLook({ l, navigate }) {
  const zh = l === 'zh';
  const [data, setData] = useState(null), [introData, setIntroData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [type, setType] = useState(''), [useCase, setUseCase] = useState(''), [retry, setRetry] = useState(0);
  const initialAnchorHandled = useRef(false);
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
    if (initialAnchorHandled.current || (!introData && !error)) return;
    initialAnchorHandled.current = true;
    const id = window.location.hash.slice(1);
    if (!['types', 'recent'].includes(id)) return;
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [introData, error]);
  const go = href => event => navigate(event, href);
  return (
    <section className="discovery-section" id="recent" aria-labelledby="recent-title"><div className="discovery-section-heading"><div><p className="home-kicker">01 / {zh ? '开始探索' : 'DISCOVER'}</p><h2 id="recent-title">{zh ? '近期值得看。' : 'Worth a closer look.'}</h2><p>{zh ? '从各类型近 7 天 Hot 榜发现项目；不同类型分别比较，同产品聚合。' : 'Discover projects from each collection’s 7-day Hot board. Types are compared separately; duplicate products are merged.'}</p></div><a className="home-method-link" href={`/${l}/method`} onClick={go(`/${l}/method`)}>{zh ? '榜单方法' : 'Ranking method'}</a></div>
      <div className="discovery-type-filters" role="group" aria-label={zh ? '选择资源类型' : 'Choose a resource type'}>{[['', zh ? '全部' : 'All'], ...TYPES.map(id => [id, typeLabel(id, l)])].map(([id, label]) => <button key={id} type="button" aria-pressed={type === id} onClick={() => setType(id)}>{label}</button>)}</div>
      {introData?.tasks?.length > 0 && <div className="discovery-task-filters" role="group" aria-label={zh ? '按任务发现' : 'Discover by task'}><span>{zh ? '想完成什么？' : 'What are you working on?'}</span>{introData.tasks.map(task => <button key={task.id} type="button" aria-pressed={useCase === task.id} onClick={() => setUseCase(current => current === task.id ? '' : task.id)}>{task[zh ? 'zh' : 'en']}</button>)}{useCase && <button className="discovery-clear" type="button" onClick={() => setUseCase('')}>{zh ? '清除任务' : 'Clear task'}</button>}</div>}
      <div className="discovery-results" aria-busy={loading}>{loading ? <div className="discovery-skeletons" role="status" aria-label={zh ? '正在读取项目' : 'Loading projects'}>{[1, 2, 3].map(id => <div key={id}/>)}</div> : error ? <div className="discovery-state" role="status"><p>{zh ? '暂时无法读取项目。搜索和类型入口仍可使用。' : 'Projects are temporarily unavailable. Search and collection links remain available.'}</p><button type="button" className="primary" onClick={() => setRetry(value => value + 1)}>{zh ? '重试' : 'Retry'}</button></div> : data?.items.length ? <div className="discovery-card-grid">{data.items.map(item => <article className="discovery-card" key={item.productFamily}><div className="discovery-card-top"><span className="discovery-type-label">{typeLabel(item.type, l)}</span><SourceBadge l={l} official={Boolean(item.officialEvidence)} evidence={item.officialEvidence}/></div><h3><a href={itemPath(l, item.type, item.slug)} onClick={go(itemPath(l, item.type, item.slug))}>{item.full_name}</a></h3><p className="discovery-card-description">{item.description}</p>{item.useCaseLabel && <p className="discovery-card-task">{item.useCaseLabel[zh ? 'zh' : 'en']}</p>}<HomeEvidence item={item} l={l}/><a className="primary discovery-card-action" href={itemPath(l, item.type, item.slug)} onClick={go(itemPath(l, item.type, item.slug))}>{zh ? '查看详情' : 'View details'}</a></article>)}</div> : <div className="discovery-state" role="status"><p>{zh ? '当前类型和任务组合没有可展示的项目。' : 'No projects are available for this collection and task.'}</p><button type="button" className="primary" onClick={() => { setType(''); setUseCase(''); }}>{zh ? '查看全部项目' : 'Show all projects'}</button></div>}</div>
      <p className="discovery-data-note">{(data || introData)?.source === 'demo' ? (zh ? '演示数据 · ' : 'Demo data · ') : ''}{zh ? '按类型选取，不是跨类型总榜。数据时间见各项目；缺少热度历史时明确展示目录条目。' : 'Selected by collection, not a global leaderboard. Sample dates are shown per project; catalog entries are labeled when momentum history is unavailable.'}</p>{type && <a className="home-method-link" href={typePath(l, type, 'ranking', new URLSearchParams({ period: 'week', ...(useCase ? { useCase } : {}) }).toString())} onClick={go(typePath(l, type, 'ranking', new URLSearchParams({ period: 'week', ...(useCase ? { useCase } : {}) }).toString()))}>{zh ? '打开该类型完整排行' : 'Open this collection’s full ranking'}</a>}
    </section>

  );
}
