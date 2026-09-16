import React, { useState } from 'react';
import { typeLabel } from './catalog.js';

export function AdminCoverage({ l }) {
  const zh = l === 'zh';
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const check = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/catalog-coverage');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Check failed');
      setData(result);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const statuses = zh ? { covered: '已收录', unverified: '类型证据不足', inactive: '已停用', 'candidate-pending': '候选待审核', 'source-disabled': '来源已停用', 'source-failed': '站点采集失败', 'source-registered': '来源已登记，未形成条目', 'other-type': '在其他类型中', 'repository-only': '仓库已收录，目标资源缺失', 'not-in-catalog': '未收录，原因未确认' } : { covered: 'Covered', unverified: 'Type evidence missing', inactive: 'Inactive', 'candidate-pending': 'Candidate pending', 'source-disabled': 'Source disabled', 'source-failed': 'Website fetch failed', 'source-registered': 'Source registered; item missing', 'other-type': 'Listed under another type', 'repository-only': 'Repository found; resource missing', 'not-in-catalog': 'Missing; cause unconfirmed' };
  return <section className="admin-operations">
    <div className="billing-section-heading"><h2>{zh ? '热门资源覆盖' : 'Resource coverage'}</h2><button className="ghost" type="button" disabled={busy} onClick={check}>{busy ? '…' : zh ? '检查覆盖' : 'Check coverage'}</button></div>
    <p className="admin-section-hint">{zh ? '用固定样本检查漏收与错分类。检查只读取数据，不会自动收录、绕过验证或修改榜单。样本覆盖率不代表全部热门资源的覆盖率。' : 'Check a fixed sample for collection and classification gaps. This reads data without adding resources or overriding validation. Sample coverage is not total market coverage.'}</p>
    {error && <p className="billing-error" role="alert">{error}</p>}
    {data && <>
      <p role="status">{data.covered} / {data.expected} · {zh ? '已收录' : 'covered'}{data.mode === 'demo' && ` · ${zh ? '演示数据库，非线上结果' : 'Demo database, not production coverage'}`} · {new Date(data.generatedAt).toLocaleString(zh ? 'zh-CN' : 'en-US')}</p>
      <div className="admin-query-table" role="region" aria-label={zh ? '覆盖检查结果' : 'Coverage results'} tabIndex={0}><table><thead><tr><th>{zh ? '资源' : 'Resource'}</th><th>{zh ? '预期类型' : 'Expected type'}</th><th>{zh ? '状态' : 'Status'}</th><th>{zh ? '采集依据' : 'Collection evidence'}</th></tr></thead><tbody>{data.entries.map(entry => <tr key={entry.id}><td>{entry.name}</td><td>{typeLabel(entry.type, l)}</td><td>{statuses[entry.status] || entry.status}</td><td>{entry.sourceError || entry.items.find(item => item.retirementReason)?.retirementReason || entry.items.find(item => item.classificationEvidence)?.classificationEvidence || (entry.alsoListedAs.length ? entry.alsoListedAs.map(type => typeLabel(type, l)).join(', ') : '—')}</td></tr>)}</tbody></table></div>
      {data.queryFailures.length > 0 && <p className="admin-section-hint">{zh ? '最近一轮有查询失败或限流，这只是采集上下文，不能证明某个漏收项目由它导致。' : 'The latest run has query errors or rate limits. This is context, not proof of the cause of a particular missing item.'}</p>}
      <details className="admin-source-policies"><summary>{zh ? '来源登记与使用边界' : 'Source register and usage boundaries'}</summary><p className="admin-section-hint">{zh ? '以下是本项目记录的保存边界；待审核表示尚未完成来源条款核对，不能视为已获再分发许可。Firecrawl 是抽取工具，网页或目录才是数据来源。' : 'These are this project’s retention boundaries. Pending reviews do not establish redistribution permission. Firecrawl is an extraction tool; the website or directory is the source.'}</p>{data.sourcePolicies.map(source => <article key={source.id}><h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a></h3><p>{source.method} · {source.frequencyHours} h · {zh ? '条款待核对' : 'Terms review pending'}</p><p>{source.retained}</p>{source.policyUrl && <a href={source.policyUrl} target="_blank" rel="noopener noreferrer">{zh ? '查看来源条款' : 'Source terms'} ↗</a>}{source.lastError && <p className="billing-error">{source.lastError}</p>}</article>)}</details>
    </>}
  </section>;
}
