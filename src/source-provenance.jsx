import React from 'react';

const dateLabel = (value, l) => {
  if (!value || !Number.isFinite(Date.parse(value))) return l === 'zh' ? '更新时间未知' : 'Update time unknown';
  return new Date(value).toLocaleString(l === 'zh' ? 'zh-CN' : 'en-US');
};

export function SourceProvenance({ l, provenance }) {
  if (!provenance) return null;
  const zh = l === 'zh';
  const kinds = zh ? { stars: 'Star 与 Fork', installs: '安装量', usage: '用量', downloads: '下载量' } : { stars: 'Stars and forks', installs: 'Installs', usage: 'Usage', downloads: 'Downloads' };
  const scopes = zh ? { 'associated-repository': '关联仓库，非此资源自身的安装量或访问量', skill: '单个 Skill', repository: '目录中的仓库条目', unknown: '统计对象未说明' } : { 'associated-repository': 'Associated repository; not this resource’s installs or visits', skill: 'Individual Skill', repository: 'Repository entry in the directory', unknown: 'Counting scope unspecified' };
  const period = value => value === 'unknown' ? (zh ? '统计窗口未说明' : 'Counting window unspecified') : value === 'cumulative' ? (zh ? '累计' : 'Cumulative') : value;
  const sourceLink = (name, url) => {
    const label = zh ? ({ 'Unspecified directory': '目录来源未说明', 'Unspecified source': '来源未说明', Website: '网站' }[name] || name) : name;
    return url ? <a href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a> : label;
  };
  return <section className="detail-provenance" aria-labelledby="resource-sources-title">
    <h2 id="resource-sources-title">{zh ? '数据来源' : 'Data sources'}{provenance.mode === 'demo' && <span className="source-tag">{zh ? '演示数据' : 'Demo data'}</span>}</h2>
    <p>{sourceLink(provenance.source, provenance.sourceUrl)} · {dateLabel(provenance.fetchedAt, l)}</p>
    {provenance.metrics.length > 0 && <dl>{provenance.metrics.map((metric, index) => <div key={`${metric.source}:${metric.kind}:${index}`}><dt>{kinds[metric.kind] || metric.kind}</dt><dd>{sourceLink(metric.source, metric.sourceUrl)} · {metric.kind === 'stars' && metric.scope === 'repository' ? (zh ? '此仓库' : 'This repository') : scopes[metric.scope] || scopes.unknown} · {period(metric.period)}<small>{dateLabel(metric.sampledAt, l)}</small></dd></div>)}</dl>}
  </section>;
}
