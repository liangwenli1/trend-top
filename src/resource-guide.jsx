import React, { useState } from 'react';
import { safeSourceUrl } from '../shared/data-sources.js';

export function ResourceGuide({ item, l }) {
  const zh=l==='zh', signals=item.rankingSignals || {}, [copied,setCopied]=useState(false), [error,setError]=useState(false);
  const labels={skill:zh?'使用这个 Skill':'Use this Skill',plugin:zh?'连接这个插件':'Connect this plugin',agent:zh?'开始使用 Agent':'Get started with this agent',components:zh?'使用与预览组件':'Use and preview components',website:zh?'访问这个网站':'Visit this website','github-repo':zh?'项目资料':'Project information'};
  const fields=[];
  if(item.type==='skill')fields.push([zh?'资源文件':'Resource file',signals.resourcePath],[zh?'安装方式':'Installation',item.install]);
  if(item.type==='plugin')fields.push([zh?'安装 / 连接说明':'Installation / connection',item.install],[zh?'传输方式':'Transport',signals.transport],[zh?'运行要求':'Runtime requirements',signals.runtime]);
  if(item.type==='agent')fields.push([zh?'启动说明':'Launch instructions',item.install],[zh?'运行要求':'Runtime requirements',signals.runtime]);
  if(item.type==='components')fields.push([zh?'安装方式':'Installation',item.install],[zh?'框架':'Framework',signals.framework]);
  if(item.type==='website')fields.push([zh?'站点':'Website',safeSourceUrl(item.websiteUrl || item.url)],[zh?'关联源码':'Associated source',safeSourceUrl(item.sourceRepoUrl)]);
  fields.push([zh?'资源许可':'Resource license',signals.license?.spdx && signals.license.spdx!=='NOASSERTION'?signals.license.spdx:null]);
  if(signals.instructions?.documentation)fields.push([zh?'说明来源':'Instruction source',signals.instructions.documentation]);
  const preview=signals.preview;
  const previewUrl=preview?.permissionEvidence && preview.attribution?safeSourceUrl(preview.url):null;
  return <section className="resource-guide"><h2>{labels[item.type]}</h2><dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value?(safeSourceUrl(value)?<a href={safeSourceUrl(value)} target="_blank" rel="noopener noreferrer">{value}</a>:<span>{value}</span>):<span className="muted">{zh?'来源尚未提供，查看原始资料确认。':'Not provided by the source. Check the original documentation.'}</span>}</dd></div>)}</dl>
    {item.install&&<><pre className="resource-instruction">{item.install}</pre><button type="button" className="ghost" onClick={async()=>{try{await navigator.clipboard.writeText(item.install);setCopied(true);setError(false)}catch{setError(true)}}}>{copied?(zh?'已复制':'Copied'):(zh?'复制说明':'Copy instructions')}</button>{error&&<p role="status">{zh?'无法访问剪贴板，请手动复制。':'Clipboard unavailable. Copy the instructions manually.'}</p>}</>}
    {previewUrl&&<figure className="component-preview"><img src={previewUrl} alt={zh?`${item.full_name} 作者预览`:`Author preview of ${item.full_name}`} loading="lazy" referrerPolicy="no-referrer"/><figcaption>{preview.attribution}</figcaption></figure>}
    {item.type==='components'&&!previewUrl&&<p>{zh?'效果预览可在作者网站查看。':'See the author’s website for a visual preview.'}</p>}
  </section>;
}
export function ComponentGrid({ items, l, href }) {
  const zh=l==='zh';
  return <div className="component-grid">{items.map(item=>{
    const preview=item.rankingSignals?.preview, url=preview?.permissionEvidence&&preview.attribution?safeSourceUrl(preview.url):null;
    return <article className="component-resource-card" key={item.id}>{url?<figure><img src={url} alt={item.full_name} loading="lazy" referrerPolicy="no-referrer"/><figcaption>{preview.attribution}</figcaption></figure>:<div className="component-preview-empty">{zh?'查看作者演示':'View author demo'}</div>}<h3><a href={href(item)}>{item.full_name}</a></h3><p>{item.description}</p><div className="repo-tags">{item.topics?.slice(0,3).map(topic=><span className="source-tag" key={topic}>{topic}</span>)}</div><a className="ghost inline" href={safeSourceUrl(item.websiteUrl || item.url) || href(item)} target="_blank" rel="noopener noreferrer">{zh?'打开作者来源':'Open author source'}</a></article>;
  })}</div>;
}
