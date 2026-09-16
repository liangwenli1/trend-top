import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { loginUrl, safeAccountReturn }  from '../shared/account-paths.js';
import './billing.css';
import { pricingCache } from './pricing-data.js';
import { PRO_FEATURES } from '../shared/pro-plan.js';

const api = async (url, options) => {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
};
const post = (url, body = {}) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const money = (amount, currency, locale) => amount ? new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: currency || 'USD' }).format(amount) : null;

export function PricingPage({ l, user, navigate }) {
  const zh = l === 'zh';
  const [data, setData] = useState(() => pricingCache.get(l)), [message, setMessage] = useState(''), [busy, setBusy] = useState('');
  const [retry, setRetry] = useState(0);
  const [cycle, setCycle] = useState(new URLSearchParams(location.search).get('cycle') === 'year' ? 'year' : 'month');
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    let live = true;
    setData(pricingCache.get(l)); setMessage('');
    pricingCache.load(l).then(value => { if (live) setData(value); }).catch(error => { if (live) setMessage(error.message); });
    return () => { live = false; };
  }, [l, retry]);
  const checkout = async plan => {
    if (!user) { navigate(loginUrl(l, location.pathname+location.search)); return; }
    setBusy(plan.key); setMessage('');
    try { const result = await post('/api/billing/checkout', { planKey: plan.key, type:new URLSearchParams(location.search).get('type'),board:new URLSearchParams(location.search).get('board') }); location.assign(result.checkoutUrl); }
    catch (error) { setMessage(error.message); setBusy(''); }
  };
  const selected = data?.plans.find(plan => plan.interval === cycle) || data?.plans[0];
  const benefits = zh ? [
    ['每日摘要邮件', '在你选定的时区和时间，每天最多一封，覆盖你关注的类型与榜单。'],
    ['关注列表', '关注项目后，可在账户里看到距上次查看关注列表的名次和 Star 变化（周热度榜）。'],
    ['邮件增长图表', '有足够历史时，为领先条目附上增长图；缺少增量会明确说明，不用总 Star 替代。'],
    ['按你的筛选推送', '只推送你关心的编程语言和主题；留空则接收全部。'],
    ['随时调整', '邮件推送设置中暂停、恢复或修改摘要；在套餐与账单页单独管理续订。']
  ] : [
    ['Daily digest email', 'At most one email per day, at the hour and time zone you choose, covering the collections and boards you follow.'],
    ['Watchlist', 'Watch projects, then see rank and star changes since your last watchlist view on the weekly Hot board.'],
    ['Growth charts in your digest', 'See growth charts when enough history is available. Missing growth is labelled, never replaced with total stars.'],
    ['Filters that follow you', 'Limit the digest to the programming languages and topics you care about, or leave them empty to receive everything.'],
    ['Change it anytime', 'Pause, resume, or edit delivery preferences. Manage paid renewal separately in Plan & billing.']
  ];
  return <main className="billing-page pricing-page"><header className="billing-hero"><p>01 / PRO</p><h1>Trend Top Pro</h1><p>{zh ? '每日摘要邮件是 Pro 功能。按月或按年订阅，自动续费，随时可在账户中取消。' : 'The daily digest email is a Pro feature. Subscribe monthly or yearly; plans renew automatically and can be cancelled from your account at any time.'}</p></header>
    <div className="pricing-layout"><article className="pricing-card pricing-single" aria-busy={!data && !message}>
      <p className="billing-kicker">PRO / ACCESS</p><h2>Trend Top Pro</h2>
      <div className="billing-cycle" aria-label={zh ? '计费周期' : 'Billing cycle'}>{['month','year'].map(interval => <button key={interval} type="button" aria-pressed={cycle === interval} onClick={() => setCycle(interval)}>{interval === 'year' ? (zh ? '年付' : 'Yearly') : (zh ? '月付' : 'Monthly')}</button>)}</div>
      <div className={`billing-price${selected?.price ? '' : ' billing-price-status'}`} role="status">{money(selected?.price, selected?.currency, l) || (!data ? (message ? (zh ? '价格暂不可用' : 'Pricing is temporarily unavailable') : (zh ? '正在加载价格…' : 'Loading price…')) : (zh ? 'Pro 暂未开放' : 'Pro is not available yet'))}<small>{selected?.price ? ` / ${cycle === 'year' ? (zh ? '年' : 'year') : (zh ? '月' : 'month')}` : ''}</small></div>
      <ul>{(selected?.features?.[l] || PRO_FEATURES[l] || PRO_FEATURES.en).map(feature => <li key={feature}>{feature}</li>)}</ul>
      {selected?.available && <><label className="billing-consent"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)}/><span>{zh ? '我已阅读并同意' : 'I have read and agree to the'} <a href={`/${l}/terms`}>{zh ? '服务条款' : 'Terms of Service'}</a> {zh ? '和' : 'and'} <a href={`/${l}/terms#cancellation`}>{zh ? '取消与退款规则' : 'cancellation and refund policy'}</a>{zh ? '。' : '.'}</span></label>
      <button type="button" className="primary" disabled={Boolean(busy) || (Boolean(user) && !accepted)} onClick={() => checkout(selected)}>{busy === selected.key ? '…' : user ? (zh ? '使用 Creem 订阅' : 'Subscribe with Creem') : (zh ? '登录后订阅' : 'Sign in to subscribe')}</button></>}
      {!data && message && <button type="button" className="ghost" onClick={() => setRetry(value => value + 1)}>{zh ? '重新加载价格' : 'Retry loading price'}</button>}
      {data && !selected?.available && selected?.price && <p className="billing-renewal">{zh ? 'Pro 订阅暂未开放。' : 'Pro subscriptions are not available yet.'}</p>}
    </article>
    <section className="pricing-benefits" aria-labelledby="pricing-benefits-title"><h2 id="pricing-benefits-title">{zh ? '订阅 Pro 能获得什么' : 'What Pro gives you'}</h2><dl>{benefits.map(([title, body]) => <div key={title}><dt>{title}</dt><dd>{body}</dd></div>)}</dl></section></div>
    <p className="billing-renewal">{zh ? '结账前会显示最终金额。取消 Pro 后，摘要会在当前付费周期结束时停止；账户和网站浏览不受影响。' : 'The final amount is shown before checkout. If you cancel Pro, the digest stops at the end of the paid period; your account and site access are unaffected.'}</p>
    <p className="billing-renewal">{zh ? '付款由 Creem 作为登记商户（merchant of record）处理；收据由 Creem 发送，退款请求见服务条款。' : 'Payments are processed by Creem as the merchant of record. Creem issues the receipt; refund requests are described in the Terms of Service.'}</p>
    {message && <p className="form-message" role="status">{message}</p>}
  </main>;
}

export function BillingCard({ l }) {
  const zh = l === 'zh';
  const [data, setData] = useState(undefined), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false), [refundPayment, setRefundPayment] = useState(null), [reason, setReason] = useState('');
  const refresh = () => api('/api/billing/me').then(setData).catch(error => { setData(null); setMessage(error.message); });
  useEffect(() => { refresh(); }, []);
  const portal = async () => { setBusy(true); setMessage(''); try { const result = await post('/api/billing/portal'); location.assign(result.portalUrl); } catch (error) { setMessage(error.message); setBusy(false); } };
  if (data === undefined) return <section className="billing-account-card"><p>{zh ? '正在加载账单…' : 'Loading billing…'}</p></section>;
  const sub = data?.subscription;
  const date = value => value ? new Date(value).toLocaleDateString(zh ? 'zh-CN' : 'en-US') : (zh ? '待确认' : 'Awaiting confirmation');
  const statusLabels = { active: ['已启用', 'Active'], paid: ['已启用', 'Active'], trialing: ['试用中', 'Trial'], scheduled_cancel: ['到期停止续订', 'Renewal cancelled'], canceled: ['已取消', 'Cancelled'], cancelled: ['已取消', 'Cancelled'], expired: ['已到期', 'Expired'], past_due: ['付款逾期', 'Payment overdue'], unpaid: ['待付款', 'Unpaid'], paused: ['已暂停', 'Paused'], requested: ['待审核', 'Under review'], processing: ['退款处理中', 'Processing'], pending: ['等待支付方确认', 'Awaiting provider'], requires_action: ['需要支付方处理', 'Provider action required'], succeeded: ['退款已处理', 'Refund processed'], failed: ['处理失败，请联系支持', 'Failed — contact support'], rejected: ['未通过审核', 'Not approved'], refunded: ['已退款', 'Refunded'], completed: ['已付款', 'Paid'] };
  const label = status => statusLabels[status]?.[zh ? 0 : 1] || status;
  const renewalStopped = sub?.status === 'scheduled_cancel', cancellationPending = sub?.cancelRequestedAt && !renewalStopped && !['canceled', 'cancelled', 'expired'].includes(sub.status);
  const canCancel = sub && !sub.cancelRequestedAt && ['active','paid','trialing','past_due','unpaid'].includes(sub.status);
  const cancelRenewal = async () => { setBusy(true); setMessage(''); try { const result = await post('/api/billing/cancel'); setData(result.billing); setConfirmCancel(false); setMessage(result.billing.subscription?.status === 'scheduled_cancel' ? (zh ? '续订已取消，服务保留到本周期结束。' : 'Renewal cancelled. Access continues to the end of this period.') : (zh ? '取消请求已提交，等待 Creem 确认。' : 'Cancellation submitted. Awaiting Creem confirmation.')); } catch (error) { setMessage(error.message); setConfirmCancel(false); await refresh(); } finally { setBusy(false); } };
  const requestRefund = async event => { event.preventDefault(); setBusy(true); setMessage(''); try { await post('/api/billing/refund-requests', { transactionId: refundPayment.id, reason }); setRefundPayment(null); setReason(''); await refresh(); setMessage(zh ? '退款申请已提交，我们将在 3 个工作日内答复。' : 'Refund request submitted. We reply within 3 business days.'); } catch (error) { setMessage(error.message); } finally { setBusy(false); } };
  if (!data) return <section className="billing-account-card"><p role="alert">{message}</p><button type="button" className="ghost" onClick={refresh}>{zh ? '重试' : 'Retry'}</button></section>;
  return <section className="billing-account-card"><div><p className="billing-kicker">PRO / BILLING</p><h2>{zh ? '付费套餐' : 'Paid plan'}</h2></div>
    {sub ? <><div className="billing-account-status"><strong>{sub.planKey === 'pro_yearly' ? (zh ? 'Pro 年付' : 'Pro Yearly') : sub.planKey === 'pro_weekly' ? (zh ? 'Pro 周付' : 'Pro Weekly') : (zh ? 'Pro 月付' : 'Pro Monthly')}</strong><span>{cancellationPending ? (zh ? '取消请求待确认' : 'Cancellation pending') : label(sub.status)}</span></div><dl className="billing-facts"><div><dt>{zh ? '本周期结束' : 'Period ends'}</dt><dd>{date(sub.periodEnd)}</dd></div><div><dt>{zh ? '下次扣款' : 'Next charge'}</dt><dd>{renewalStopped || ['canceled','cancelled','expired'].includes(sub.status) ? (zh ? '不再续订' : 'No renewal') : cancellationPending ? (zh ? '待确认' : 'Awaiting confirmation') : date(sub.nextTransactionAt || sub.periodEnd)}</dd></div></dl><div className="billing-actions">{data.customer && <button type="button" className="ghost" disabled={busy} onClick={portal}>{zh ? '收据与支付方式' : 'Receipts & payment method'}</button>}{canCancel && <button type="button" className="ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>{zh ? '取消付费续订' : 'Cancel paid renewal'}</button>}{cancellationPending && <button type="button" className="ghost" disabled={busy} onClick={refresh}>{zh ? '刷新状态' : 'Refresh status'}</button>}</div><p className="billing-renewal">{zh ? '取消续订后，Pro 保留到本周期结束。停止邮件发送请前往邮件推送设置。' : 'After cancelling renewal, Pro stays available until this period ends. Stop email delivery in Email delivery settings.'}</p></> : <><p>{data?.configured ? (zh ? '当前没有付费套餐。' : 'You do not have a paid plan yet.') : (zh ? 'Pro 订阅暂未开放。' : 'Pro subscriptions are not available yet.')}</p><a className="primary billing-link" href={`/${l}/pricing`}>{zh ? '查看 Pro' : 'View Pro'}</a></>}
    <section className="billing-history"><h3>{zh ? '付款记录' : 'Payment history'}</h3>{data.transactions.length ? data.transactions.map(transaction => <article key={transaction.id}><div><strong>{money(transaction.amount / 100 + (transaction.taxAmount || 0) / 100, transaction.currency, l)}</strong><span>{date(transaction.createdAt)} · {label(transaction.status)}</span></div>{transaction.refundEligible && <button type="button" className="ghost" disabled={busy} onClick={() => { setRefundPayment(transaction); setReason(''); }}>{zh ? '申请退款' : 'Request refund'}</button>}</article>) : <p>{zh ? '暂无付款记录。' : 'No payments yet.'}</p>}</section>
    <section className="billing-history"><h3>{zh ? '退款申请' : 'Refund requests'}</h3><p className="billing-renewal">{zh ? '首次扣款后 7 天内，如服务未按描述提供，可申请全额退款。审核结果会显示在这里。退款与取消续订分别处理。' : 'Within 7 days of your first charge, request a full refund if the service was not provided as described. The review status appears here. Refunds and cancellation are handled separately.'} <a href={`/${l}/terms#refunds`}>{zh ? '查看退款规则' : 'Read refund policy'}</a></p>{data.refundRequests.map(refund => <article key={refund.id}><div><strong>{label(refund.status)}</strong><span>{date(refund.createdAt)}{refund.adminNote ? ' · ' + refund.adminNote : ''}</span></div></article>)}{data.refundRequests.length > 0 && <button type="button" className="ghost" disabled={busy} onClick={refresh}>{zh ? '刷新申请状态' : 'Refresh requests'}</button>}</section>
    <Dialog.Root open={confirmCancel} onOpenChange={open => { if (!busy) setConfirmCancel(open); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content billing-confirm"><Dialog.Title>{zh ? '取消付费续订？' : 'Cancel paid renewal?'}</Dialog.Title><Dialog.Description>{zh ? `取消后不再自动扣款，Pro 服务保留到 ${date(sub?.periodEnd)}。这不会删除你的账户或邮件推送偏好。` : `You will not be charged again after cancellation is confirmed. Pro continues until ${date(sub?.periodEnd)}. Your account and delivery preferences stay saved.`}</Dialog.Description><div className="billing-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>{zh ? '保留续订' : 'Keep renewal'}</button><button type="button" className="primary" disabled={busy} onClick={cancelRenewal}>{busy ? '…' : (zh ? '确认取消续订' : 'Confirm cancellation')}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={Boolean(refundPayment)} onOpenChange={open => { if (!busy && !open) setRefundPayment(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content billing-confirm"><Dialog.Title>{zh ? '申请退款' : 'Request a refund'}</Dialog.Title><Dialog.Description>{zh ? '请说明服务未按描述提供的问题。我们将在 3 个工作日内审核答复；批准后由 Creem 原路退回。' : 'Describe how the service was not provided as described. We review within 3 business days. Approved refunds are returned through Creem to your original payment method.'}</Dialog.Description><form className="subscribe-form" onSubmit={requestRefund}><div className="field"><label htmlFor="refund-reason">{zh ? '问题说明' : 'Service issue'}</label><textarea id="refund-reason" required minLength={10} maxLength={1000} rows={4} value={reason} onChange={event => setReason(event.target.value)}/></div><div className="billing-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setRefundPayment(null)}>{zh ? '取消' : 'Cancel'}</button><button className="primary" disabled={busy}>{busy ? '…' : (zh ? '提交申请' : 'Submit request')}</button></div>{message && <p role="status">{message}</p>}</form></Dialog.Content></Dialog.Portal></Dialog.Root>
    {message && <p className="form-message" role="status">{message}</p>}
  </section>;
}

export function BillingResultPage({ l, status, navigate }) {
  const zh = l === 'zh', success = status === 'success';
  const [state, setState] = useState(success ? 'pending' : 'cancelled');
  useEffect(() => {
    if (!success) return;
    const resultQuery=new URLSearchParams(location.search);
    const next=safeAccountReturn(resultQuery.get('next') || '/'+l+'/account/delivery',l);
    const requestId = resultQuery.get('request_id');
    history.replaceState({}, '', location.pathname + (requestId ? `?${new URLSearchParams({request_id:requestId,next})}` : ''));
    if (!requestId) return;
    let stopped = false, attempts = 0, timer;
    const poll = async () => { try { const result = await api(`/api/billing/checkout-status?requestId=${encodeURIComponent(requestId)}`); if(stopped)return; setState(result.billing?.access?.active && result.status==='completed'?'completed':'pending'); if(result.status==='completed' && result.billing?.access?.active){navigate(next,true);return;} if(!['failed','expired'].includes(result.status) && attempts++ < 12) timer=setTimeout(poll,2000); } catch { if (!stopped && attempts++ < 12) timer=setTimeout(poll, 2000); } };
    poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [success]);
  return <main className="billing-result"><p className="billing-kicker">CREEM / {status.toUpperCase()}</p><h1>{success ? (state === 'completed' ? (zh ? 'Pro 已开通。' : 'Pro is active.') : (zh ? '付款已提交。' : 'Payment submitted.')) : (zh ? '未完成付款。' : 'Payment not completed.')}</h1><p>{success && state !== 'completed' ? (zh ? '我们正在等待 Creem 确认，页面会自动更新。' : 'We are waiting for Creem to confirm the payment. This page updates automatically.') : !success ? (zh ? '你的账户不会被扣款，也不会开通 Pro。' : 'Your account will not be charged and Pro will not be enabled.') : (zh ? '现在可以在账户中查看付费状态。' : 'You can now review billing from your account.')}</p><div><a className="primary billing-link" href={`/${l}/account/subscription`}>{zh ? '返回套餐与账单' : 'Back to plan & billing'}</a><a className="ghost billing-link" href={`/${l}/pricing`}>{zh ? '查看套餐' : 'View plans'}</a></div></main>;
}

export function LegalPage({ l, kind }) {
  const zh = l === 'zh', privacy = kind === 'privacy';
  return <main className="billing-page legal-page"><p className="billing-kicker">TREND TOP / {privacy ? 'PRIVACY' : 'TERMS'}</p><h1>{privacy ? (zh ? '隐私政策' : 'Privacy Policy') : (zh ? '服务条款' : 'Terms of Service')}</h1><p>{zh ? '最后更新：2026 年 9 月 16 日' : 'Last updated: September 16, 2026'}</p>{privacy ? <><h2>{zh ? '我们处理的数据' : 'Data we process'}</h2><p>{zh ? '我们处理账户邮箱、订阅偏好、登录会话和完成服务所需的账单标识。支付卡信息由 Creem 处理，不会存储在 Trend Top。' : 'We process account email addresses, digest preferences, login sessions, and billing identifiers required to provide the service. Creem processes card details; Trend Top does not store them.'}</p><h2>Google {zh ? '登录' : 'sign-in'}</h2><p>{zh ? '选择 Google 登录时，我们只请求基本身份和邮箱权限，保存 Google 账户标识和已验证邮箱用于登录或关联账户。我们不请求读取 Gmail 邮件，也不保存 Google 访问令牌。' : 'When you choose Google sign-in, we request basic identity and email scopes and store your Google account identifier and verified email for sign-in or linking. We do not request Gmail message access or retain Google access tokens.'}</p><h2 id="cookies">{zh ? 'Cookie 与浏览器存储' : 'Cookies and browser storage'}</h2><p>{zh ? '我们使用必要的 Cookie 保持登录，并在 Google 登录时校验请求。目前没有加载用于广告或行为分析的可选追踪 Cookie。' : 'We use essential cookies to keep you signed in and verify Google sign-in requests. We currently do not load optional tracking cookies for advertising or behavioral analytics.'}</p><ul className="cookie-list"><li><strong>trend_top_session</strong> — {zh ? '登录会话，最长 30 天；退出后移除。' : 'Sign-in session, up to 30 days; removed when you sign out.'}</li><li><strong>trend_top_google_state</strong> — {zh ? 'Google 登录临时校验，最长 10 分钟；回调后移除。' : 'Temporary Google sign-in verification, up to 10 minutes; removed after the callback.'}</li><li><strong>{zh ? '界面语言' : 'Interface language'}</strong> — {zh ? '在本地存储中记住你的语言选择，直到你清除浏览器存储；关闭语言建议的记录只保留到当前浏览器会话结束。' : 'Your language choice is kept in local storage until you clear browser storage. Dismissing a language suggestion is remembered for this browser session only.'}</li></ul><p>{zh ? '可以在浏览器中清除这些数据；这会退出登录或重置语言选择。选择 Google 登录或前往 Creem 结账时，第三方页面也适用其自己的隐私和 Cookie 政策。' : 'You can clear these records in your browser, which signs you out or resets your language choice. Google sign-in and Creem checkout pages also follow those providers’ own privacy and cookie policies.'}</p><h2>{zh ? '用途与删除' : 'Use and deletion'}</h2><p>{zh ? '这些数据用于登录、发送摘要、管理付费权限和防止滥用。你可以停止摘要、取消付费套餐，或通过页脚联系地址请求删除账号。' : 'We use this data for sign-in, digest delivery, paid access, and abuse prevention. You can stop digests, cancel paid plans, or request account deletion through the contact address in the footer.'}</p></> : <><h2>{zh ? '订阅与续费' : 'Subscriptions and renewal'}</h2><p>{zh ? 'Pro 通过 Creem 按所选的月付或年付周期自动续费。最终金额、币种和周期会在付款前显示。' : 'Pro renews automatically through Creem on the monthly or yearly cycle you select. The final price, currency, and cycle are shown before payment.'}</p><h2 id="cancellation">{zh ? '取消与服务' : 'Cancellation and service'}</h2><p>{zh ? '在“套餐与账单”页点击“取消付费续订”，确认后续订停止，Pro 保留至本周期结束。取消不会删除账号。暂停或停止邮件推送仅影响邮件，不取消付费续订。' : 'Select Cancel paid renewal in Plan & billing. Once confirmed, renewal stops and Pro remains until this period ends. Your account is not deleted. Pausing or stopping emails does not cancel paid renewal.'}</p><h2 id="refunds">{zh ? '退款' : 'Refunds'}</h2><p>{zh ? '付款由 Creem 作为登记商户处理。首次扣款后 7 天内，如服务未按描述提供，可在“套餐与账单”的付款记录中申请全额退款，也可以联系页脚支持邮箱；自动续费款项请在下一次扣款前取消，已扣的当期费用不退。退款经 Creem 原路退回，我们会在 3 个工作日内答复。退款申请不会自动取消续订，取消续订也不会自动退款。' : 'Payments are processed by Creem as the merchant of record. Within 7 days of your first charge, if the service was not provided as described, request a full refund from Payment history in Plan & billing or contact the support address in the footer. Cancel before the next renewal to avoid further charges; a renewal already charged covers the current period and is not refunded. Refunds are returned by Creem to the original payment method, and we reply within 3 business days. Refund requests and paid cancellation are handled separately.'}</p></>}</main>;
}
