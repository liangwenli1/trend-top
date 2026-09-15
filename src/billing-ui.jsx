import React, { useEffect, useState } from 'react';
import './billing.css';

const api = async (url, options) => {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
};
const post = (url, body = {}) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const money = (amount, currency, locale) => amount ? new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency }).format(amount / 100) : null;

export function PricingPage({ l, user, navigate }) {
  const zh = l === 'zh';
  const [data, setData] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState('');
  const [cycle, setCycle] = useState('month');
  useEffect(() => { api('/api/billing/plans').then(setData).catch(error => setMessage(error.message)); }, []);
  const checkout = async plan => {
    if (!user) { window.sessionStorage.setItem('billing-next-plan', plan.key); navigate(`/${l}/account`); return; }
    setBusy(plan.key); setMessage('');
    try { const result = await post('/api/billing/checkout', { planKey: plan.key }); location.assign(result.checkoutUrl); }
    catch (error) { setMessage(error.message); setBusy(''); }
  };
  const selected = data?.plans.find(plan => plan.interval === cycle) || data?.plans[0];
  const benefits = zh ? [
    ['每日摘要邮件', '在你选定的时区和时间，每天最多一封，覆盖你关注的类型与榜单。'],
    ['邮件内置图表', '为领先条目附上紧凑的增长图，不打开网站也能看到势头。'],
    ['按你的筛选推送', '只推送你关心的编程语言和主题；留空则接收全部。'],
    ['随时调整', '在账户页暂停、恢复或修改摘要；账单由 Creem 处理，可在同一页面管理。']
  ] : [
    ['Daily digest email', 'At most one email per day, at the hour and time zone you choose, covering the collections and boards you follow.'],
    ['Charts in every email', 'Compact growth charts for the leading items, so you can see momentum without opening the site.'],
    ['Filters that follow you', 'Limit the digest to the programming languages and topics you care about, or leave them empty to receive everything.'],
    ['Change it anytime', 'Pause, resume, or edit your digest from your account. Billing runs through Creem and is managed on the same page.']
  ];
  return <main className="billing-page pricing-page"><header className="billing-hero"><p>01 / PRO</p><h1>Trend Top Pro</h1><p>{zh ? '每日摘要邮件是 Pro 功能。按周或按月订阅，自动续费，随时可在账户中取消。' : 'The daily digest email is a Pro feature. Subscribe weekly or monthly; plans renew automatically and can be cancelled from your account at any time.'}</p></header>
    {!data ? <p>{zh ? '正在加载套餐…' : 'Loading plans…'}</p> : <div className="pricing-layout"><article className="pricing-card pricing-single">
      <p className="billing-kicker">PRO / ACCESS</p><h2>Trend Top Pro</h2>
      <div className="billing-cycle" aria-label={zh ? '计费周期' : 'Billing cycle'}>{data.plans.map(plan => <button key={plan.key} type="button" aria-pressed={cycle === plan.interval} onClick={() => setCycle(plan.interval)}>{plan.interval === 'week' ? (zh ? '周付' : 'Weekly') : (zh ? '月付' : 'Monthly')}</button>)}</div>
      <div className="billing-price">{money(selected?.price, selected?.currency, l) || (zh ? '等待管理员定价' : 'Awaiting admin price')}<small>{selected?.price ? ` / ${cycle === 'week' ? (zh ? '周' : 'week') : (zh ? '月' : 'month')}` : ''}</small></div>
      <ul>{(selected?.features?.[l] || []).map(feature => <li key={feature}>{feature}</li>)}</ul>
      <button type="button" className="primary" disabled={!selected?.available || Boolean(busy)} onClick={() => checkout(selected)}>{busy === selected?.key ? '…' : selected?.available ? (user ? (zh ? '使用 Creem 订阅' : 'Subscribe with Creem') : (zh ? '登录后订阅' : 'Sign in to subscribe')) : (zh ? '尚未开放' : 'Not available yet')}</button>
    </article>
    <section className="pricing-benefits" aria-labelledby="pricing-benefits-title"><h2 id="pricing-benefits-title">{zh ? '订阅 Pro 能获得什么' : 'What Pro gives you'}</h2><dl>{benefits.map(([title, body]) => <div key={title}><dt>{title}</dt><dd>{body}</dd></div>)}</dl></section></div>}
    <p className="billing-renewal">{zh ? '结账前会显示最终金额。取消 Pro 后，摘要会在当前付费周期结束时停止；账户和网站浏览不受影响。' : 'The final amount is shown before checkout. If you cancel Pro, the digest stops at the end of the paid period; your account and site access are unaffected.'}</p>
    {message && <p className="form-message" role="status">{message}</p>}
  </main>;
}

export function BillingCard({ l }) {
  const zh = l === 'zh';
  const [data, setData] = useState(undefined), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/billing/me').then(setData).catch(error => setMessage(error.message)); }, []);
  const portal = async () => { setBusy(true); setMessage(''); try { const result = await post('/api/billing/portal'); location.assign(result.portalUrl); } catch (error) { setMessage(error.message); setBusy(false); } };
  if (data === undefined) return <section className="billing-account-card"><p>{zh ? '正在加载账单…' : 'Loading billing…'}</p></section>;
  const sub = data?.subscription;
  return <section className="billing-account-card"><div><p className="billing-kicker">PRO / BILLING</p><h2>{zh ? '付费套餐' : 'Paid plan'}</h2></div>
    {sub ? <><div className="billing-account-status"><strong>{sub.planKey === 'pro_weekly' ? (zh ? 'Pro 周付' : 'Pro Weekly') : (zh ? 'Pro 月付' : 'Pro Monthly')}</strong><span>{sub.status}</span></div>{sub.periodEnd && <p>{zh ? '当前周期结束：' : 'Current period ends: '}{new Date(sub.periodEnd).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}</p>}<button type="button" className="ghost" disabled={busy} onClick={portal}>{zh ? '管理账单' : 'Manage billing'}</button></> : <><p>{data?.configured ? (zh ? '当前没有付费套餐。' : 'You do not have a paid plan yet.') : (zh ? '管理员尚未完成 Creem 配置。' : 'Creem has not been configured by the administrator.')}</p><a className="primary billing-link" href={`/${l}/pricing`}>{zh ? '查看 Pro' : 'View Pro'}</a></>}
    {message && <p className="form-message" role="status">{message}</p>}
  </section>;
}

export function BillingResultPage({ l, status }) {
  const zh = l === 'zh', success = status === 'success';
  const [state, setState] = useState(success ? 'pending' : 'cancelled');
  useEffect(() => {
    if (!success) return;
    const requestId = new URLSearchParams(location.search).get('request_id');
    history.replaceState({}, '', location.pathname + (requestId ? `?request_id=${encodeURIComponent(requestId)}` : ''));
    if (!requestId) return;
    let stopped = false, attempts = 0;
    const poll = async () => { try { const result = await api(`/api/billing/checkout-status?requestId=${encodeURIComponent(requestId)}`); if (!stopped) setState(result.status); if (!['completed', 'failed', 'expired'].includes(result.status) && attempts++ < 12) setTimeout(poll, 2000); } catch { if (!stopped && attempts++ < 12) setTimeout(poll, 2000); } };
    poll(); return () => { stopped = true; };
  }, [success]);
  return <main className="billing-result"><p className="billing-kicker">CREEM / {status.toUpperCase()}</p><h1>{success ? (state === 'completed' ? (zh ? 'Pro 已开通。' : 'Pro is active.') : (zh ? '付款已提交。' : 'Payment submitted.')) : (zh ? '未完成付款。' : 'Payment not completed.')}</h1><p>{success && state !== 'completed' ? (zh ? '我们正在等待 Creem 确认，页面会自动更新。' : 'We are waiting for Creem to confirm the payment. This page updates automatically.') : !success ? (zh ? '你的账户不会被扣款，也不会开通 Pro。' : 'Your account will not be charged and Pro will not be enabled.') : (zh ? '现在可以在账户中查看付费状态。' : 'You can now review billing from your account.')}</p><div><a className="primary billing-link" href={`/${l}/account`}>{zh ? '返回账户' : 'Back to account'}</a><a className="ghost billing-link" href={`/${l}/pricing`}>{zh ? '查看套餐' : 'View plans'}</a></div></main>;
}

export function LegalPage({ l, kind }) {
  const zh = l === 'zh', privacy = kind === 'privacy';
  return <main className="billing-page legal-page"><p className="billing-kicker">TREND TOP / {privacy ? 'PRIVACY' : 'TERMS'}</p><h1>{privacy ? (zh ? '隐私政策' : 'Privacy Policy') : (zh ? '服务条款' : 'Terms of Service')}</h1><p>{zh ? '最后更新：2026 年 9 月 15 日' : 'Last updated: September 15, 2026'}</p>{privacy ? <><h2>{zh ? '我们处理的数据' : 'Data we process'}</h2><p>{zh ? '我们处理账户邮箱、订阅偏好、登录会话和完成服务所需的账单标识。支付卡信息由 Creem 处理，不会存储在 Trend Top。' : 'We process account email addresses, digest preferences, login sessions, and billing identifiers required to provide the service. Creem processes card details; Trend Top does not store them.'}</p><h2>{zh ? '用途与删除' : 'Use and deletion'}</h2><p>{zh ? '这些数据用于登录、发送摘要、管理付费权限和防止滥用。你可以停止摘要、取消付费套餐，或通过页脚联系地址请求删除账号。' : 'We use this data for sign-in, digest delivery, paid access, and abuse prevention. You can stop digests, cancel paid plans, or request account deletion through the contact address in the footer.'}</p></> : <><h2>{zh ? '订阅与续费' : 'Subscriptions and renewal'}</h2><p>{zh ? 'Pro 通过 Creem 按所选的周付或月付周期自动续费。最终金额、币种和周期会在付款前显示。' : 'Pro renews automatically through Creem on the weekly or monthly cycle you select. The final price, currency, and cycle are shown before payment.'}</p><h2>{zh ? '取消与服务' : 'Cancellation and service'}</h2><p>{zh ? '你可以从账户的账单入口管理或取消付费套餐。取消 Pro 不会删除账号；每日摘要会在付费周期结束时停止。' : 'You can manage or cancel Pro from the billing link in your account. Canceling Pro does not delete your account; the daily digest stops when the paid period ends.'}</p></>}</main>;
}
