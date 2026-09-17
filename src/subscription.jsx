import { SupportContact } from './site-contact.jsx';
import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { EnvelopeSimple } from '@phosphor-icons/react';
import { DesignSelect, TopicMultiSelect } from './components.jsx';
import { TYPES, typeLabel, itemPath } from './catalog.js';
import { BillingCard } from './billing-ui.jsx';
import { SavedSearchPanel, DeliveryHistory } from './saved-searches.jsx';
import './account.css';
import { PlanBadge, DeliveryBadge, StatusBadge } from './account-status.jsx';
import { loginUrl, safeAccountReturn, digestDestination } from '../shared/account-paths.js';
export const AuthContext = React.createContext(undefined);
export function useProStatus(user) {
  const [access,setAccess]=useState(null);
  useEffect(()=>{
    let live=true;setAccess(user ? null : false);
    if(user)request('/api/billing/access').then(result=>{if(live)setAccess(result.active)}).catch(()=>{});
    return()=>{live=false};
  },[user?.id]);
  return access;
}
export function DigestEntryPage({l,navigate}) {
  const user=React.useContext(AuthContext), [error,setError]=useState(''), [retry,setRetry]=useState(0);
  useEffect(()=>{
    let live=true;setError('');
    if(user===null)navigate(loginUrl(l,location.pathname+location.search),true);
    if(user)request('/api/billing/access').then(access=>{if(live)navigate(digestDestination(l,access.active,location.search),true)}).catch(error=>{if(live)setError(error.message)});
    return()=>{live=false};
  },[user?.id,user===null,l,retry]);
  return <main className="simple-page"><p role="status">{error || (l==='zh'?'正在打开每日摘要…':'Opening daily digest…')}</p>{error&&<button type="button" onClick={()=>setRetry(value=>value+1)}>{l==='zh'?'重试':'Retry'}</button>}</main>;
}

const boardLabels = {
  hot: ['近期热门', 'Trending now'],
  rising: ['升得最快', 'Fastest rising'],
  new: ['新秀', 'Newcomers'],
  stars: ['关注最多', 'Most starred'],
  ai: ['AI 热门', 'AI & agents'],
  topics: ['语言 / 主题', 'Language & topics'],
  forks: ['Fork 最多', 'Most forked']
};
const commonBoards = ['hot', 'rising', 'new', 'stars'];
const repoBoards = ['ai', 'topics', 'forks'];
const timezones = ['Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Kolkata', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
const zoneOptions = value => [...new Set([value, ...timezones])].map(zone => ({ value: zone, label: zone }));
const options = values => values.map(value => ({ value, label: value }));
const request = async (url, method = 'GET', body) => {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
};

export const AUTH_CHANGED_EVENT = 'trend-top:auth-changed';
export const announceAuthChange = user => window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: { user: user || null } }));

const emptyCode = () => Array(6).fill('');

function EmailCodeInput({ digits, onChange, zh, disabled = false }) {
  const inputs = useRef([]);
  const nextFocus = useRef(0);
  useEffect(() => {
    if (!disabled && nextFocus.current != null) {
      inputs.current[nextFocus.current]?.focus();
      nextFocus.current = null;
    }
  }, [disabled, digits]);
  const updateDigits = (start, text) => {
    const values = String(text).replace(/\D/g, '');
    if (!values) return;
    const first = values.length >= 6 ? 0 : start;
    nextFocus.current = Math.min(first + values.length, 5);
    onChange(previous => {
      const next = [...previous];
      for (let offset = 0; offset < values.length && first + offset < 6; offset++) next[first + offset] = values[offset];
      return next;
    });
  };
  const clearDigit = index => {
    nextFocus.current = index;
    onChange(previous => previous.map((value, position) => position === index ? '' : value));
  };
  const keyDown = (event, index) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const target = digits[index] ? index : Math.max(0, index - 1);
      clearDigit(target);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      clearDigit(index);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      inputs.current[Math.max(0, Math.min(5, index + (event.key === 'ArrowLeft' ? -1 : 1)))]?.focus();
    }
  };
  return <div className="field account-code-field">
    <label htmlFor="account-code-0">{zh ? '邮件验证码' : 'Email code'}</label>
    <div className="account-code-inputs" role="group" aria-label={zh ? '六位邮件验证码' : 'Six-digit email code'}>
      {digits.map((digit, index) => <input
        key={index}
        ref={element => { inputs.current[index] = element; }}
        id={`account-code-${index}`}
        type="text"
        disabled={disabled}
        inputMode="numeric"
        autoComplete={index === 0 ? 'one-time-code' : 'off'}
        aria-label={zh ? `第 ${index + 1} 位，共 6 位` : `Digit ${index + 1} of 6`}
        required
        value={digit}
        onChange={event => {
          const value = event.target.value.replace(/\D/g, '');
          if (value) updateDigits(index, value.length === 2 && digits[index] ? value.slice(-1) : value);
          else clearDigit(index);
        }}
        onPaste={event => { event.preventDefault(); updateDigits(index, event.clipboardData.getData('text')); }}
        onKeyDown={event => keyDown(event, index)}
      />)}
    </div>
  </div>;
}

export function AuthForm({ l, onAuthenticated, initialMode = 'email', googleEnabled = false, nextPath }) {
  const zh = l === 'zh';
  const [mode, setMode] = useState(initialMode.startsWith('reset') ? initialMode : 'email');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [codeDigits, setCodeDigits] = useState(emptyCode);
  const [busy, setBusy] = useState(false), [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState(''), [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (!resendIn) return;
    const timer = setTimeout(() => setResendIn(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);
  useEffect(() => {
    const resetBusy = () => { setBusy(false); setGoogleBusy(false); };
    window.addEventListener('pageshow', resetBusy);
    return () => window.removeEventListener('pageshow', resetBusy);
  }, []);
  const explainError = error => {
    const translations = {
      'Enter a valid email address': '请输入有效的邮箱地址。',
      'Wait one minute before requesting another code': '请等待一分钟后再发送验证码。',
      'Sign-in email could not be sent': '登录邮件暂时无法发送，请稍后重试。',
      'Code expired or incorrect': '验证码错误或已过期，请检查或重新发送。',
      'Too many account requests. Try again later.': '请求过于频繁，请稍后重试。'
    };
    return zh ? translations[error.message] || '操作未完成，请稍后重试。' : error.message;
  };
  const sendLoginCode = async () => {
    const result = await request('/api/auth/email/request', 'POST', { email, locale: l });
    setResendIn(result.retryAfter || 60); setCodeDigits(emptyCode()); setMode('email-code');
  };
  const submit = async event => {
    event.preventDefault();
    if (busy || googleBusy) return;
    setBusy(true); setMessage('');
    try {
      if (mode === 'email') await sendLoginCode();
      else if (mode === 'email-code') {
        const result = await request('/api/auth/email/verify', 'POST', { email, code: codeDigits.join('') });
        announceAuthChange(result.user); onAuthenticated(result.user);
      } else if (mode === 'reset-request') {
        await request('/api/auth/password/reset/request', 'POST', { email, locale: l });
        setMode('reset'); setMessage(zh ? '如果该邮箱已注册，验证码已发送。' : 'If this email has an account, a code was sent.');
      } else if (mode === 'reset') {
        await request('/api/auth/password/reset', 'POST', { email, code: codeDigits.join(''), password });
        announceAuthChange(null); setMode('email'); setPassword(''); setCodeDigits(emptyCode());
        setMessage(zh ? '密码已更新。现在可以通过邮箱验证码登录。' : 'Password updated. Continue with an email code to sign in.');
      }
    } catch (error) { setMessage(explainError(error)); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    if (busy || googleBusy || resendIn) return;
    setBusy(true); setMessage('');
    try { await sendLoginCode(); setMessage(zh ? '新的验证码已发送。' : 'A new code was sent.'); }
    catch (error) {
      if (error.message === 'Wait one minute before requesting another code') setResendIn(60);
      setMessage(explainError(error));
    } finally { setBusy(false); }
  };
  const disabled = busy || googleBusy, needsCode = mode === 'email-code' || mode === 'reset';
  const label = mode === 'email' ? (zh ? '使用邮箱继续' : 'Continue with email') : mode === 'email-code' ? (zh ? '验证并继续' : 'Verify and continue') : mode === 'reset-request' ? (zh ? '发送重设验证码' : 'Send reset code') : (zh ? '重设密码' : 'Reset password');
  return <div className="account-auth">
    {mode === 'email-code' && <div className="auth-code-heading"><span className="auth-code-mark" aria-hidden="true"><EnvelopeSimple size={26} weight="regular" /></span><h2>{zh ? '查看你的邮箱' : 'Check your email'}</h2><p>{zh ? '输入发送到以下邮箱的六位验证码' : 'Enter the six-digit code sent to'}<strong>{email.trim()}</strong></p><small>{zh ? '验证码 10 分钟内有效。' : 'Your code expires in 10 minutes.'}</small></div>}
    <form onSubmit={submit} className="subscribe-form">
      {mode !== 'email-code' && <div className="field"><label htmlFor="account-email">{zh ? '邮箱' : 'Email'}</label><input id="account-email" type="email" autoComplete="email" required maxLength={254} disabled={disabled} value={email} onChange={event => setEmail(event.target.value)} placeholder={zh ? '你的邮箱地址' : 'Your email address'}/></div>}
      {mode === 'reset' && <div className="field"><label htmlFor="account-password">{zh ? '新密码' : 'New password'}</label><input id="account-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={disabled} value={password} onChange={event => setPassword(event.target.value)}/></div>}
      {needsCode && <EmailCodeInput digits={codeDigits} onChange={setCodeDigits} zh={zh} disabled={disabled}/>}
      <button type="submit" className="primary wide auth-continue" disabled={disabled} aria-busy={busy}>{busy && <span className="auth-spinner" aria-hidden="true"/>}{label}</button>
      {mode === 'email-code' && <div className="auth-code-actions"><button type="button" className="account-text-button" disabled={disabled || resendIn > 0} onClick={resend}>{resendIn ? (zh ? '重新发送（' + resendIn + ' 秒）' : 'Resend in ' + resendIn + 's') : (zh ? '重新发送验证码' : 'Resend code')}</button><button type="button" className="account-text-button" disabled={disabled} onClick={() => { setMode('email'); setCodeDigits(emptyCode()); setMessage(''); }}>{zh ? '使用其他邮箱' : 'Use a different email'}</button></div>}
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
    {googleEnabled && mode === 'email' && <><div className="login-divider"><span>{zh ? '或' : 'or'}</span></div><button type="button" className="login-google auth-continue" disabled={disabled} aria-busy={googleBusy} onClick={() => { setGoogleBusy(true); window.location.assign('/api/auth/google?' + new URLSearchParams({ locale: l, next: safeAccountReturn(nextPath, l) })); }}>{googleBusy ? <span className="auth-spinner" aria-hidden="true"/> : <img src="/google-signin.png" width="20" height="20" alt=""/>}{zh ? '使用 Google 继续' : 'Continue with Google'}</button></>}
    {mode === 'email' && <p className="auth-passwordless-note">{zh ? '无需密码。首次验证邮箱后将自动创建账户。' : 'No password needed. New accounts are created after email verification.'}</p>}
  </div>;
}

const AdminSettings = React.lazy(() => import('./admin-page.jsx').then(module => ({ default: module.AdminPage })));

function SubscriptionSettings({ l, currentType, currentBoard, subscription, onSaved, account = false, proActive = true }) {
  const zh = l === 'zh';
  const [types, setTypes] = useState(subscription?.types?.length ? subscription.types : [currentType || 'github-repo']);
  const [boards, setBoards] = useState(subscription?.boards?.length ? subscription.boards : [currentType === 'github-repo' || commonBoards.includes(currentBoard) ? (currentBoard || 'hot') : 'hot']);
  const [languages, setLanguages] = useState(subscription?.languages || []);
  const [topics, setTopics] = useState(subscription?.topics || []);
  const [hour, setHour] = useState(String(subscription?.sendHour ?? 9));
  const [zone, setZone] = useState(subscription?.timezone || browserZone());
  const [locale, setLocale] = useState(subscription?.locale || l);
  const [filters, setFilters] = useState({ languages: [], topics: [] });
  const [status, setStatus] = useState(subscription?.status || null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/subscription-filters?types=' + encodeURIComponent(types.join(',')), { signal: controller.signal })
      .then(response => response.json()).then(setFilters).catch(() => {});
    return () => controller.abort();
  }, [types.join(',')]);
  const [confirmStop, setConfirmStop] = useState(account && new URLSearchParams(location.search).get('intent') === 'stop' && Boolean(subscription?.status) && subscription.status !== 'cancelled');
  const stopButton = useRef(null), saveButton = useRef(null);
  const boardChoices = [...commonBoards, ...(types.includes('github-repo') ? repoBoards : [])];
  const toggleType = type => {
    const next = types.includes(type) ? types.filter(value => value !== type) : [...types, type];
    setTypes(next);
    if (!next.includes('github-repo')) setBoards(old => {
      const kept = old.filter(value => commonBoards.includes(value));
      return kept.length ? kept : ['hot'];
    });
  };
  const submit = async event => {
    event.preventDefault();
    if (!types.length || !boards.length) { setMessage(zh ? '请选择至少一种内容类型和一个榜单。' : 'Choose at least one type and one board.'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await request('/api/subscription', 'PUT', { types, boards, languages, topics, sendHour: Number(hour), timezone: zone, locale });
      setStatus(result.subscription.status);
      onSaved?.(result.subscription);
      setMessage(zh ? '已保存。每天最多发送一封；没有更新时不发送。' : 'Saved. At most one email per day; no update means no email.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const changeStatus = async next => {
    setBusy(true); setMessage('');
    try {
      await request('/api/subscription/status', 'PATCH', { status: next });
      setStatus(next);
      onSaved?.({ ...subscription, status: next });
      setConfirmStop(false);
      setMessage(next === 'paused' ? (zh ? '已暂停邮件发送。' : 'Email delivery paused.') : next === 'cancelled' ? (zh ? '已停止邮件推送，付费套餐未变更。' : 'Emails stopped. Your paid plan is unchanged.') : (zh ? '已恢复邮件发送。' : 'Email delivery resumed.'));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <form className="subscribe-form account-settings" onSubmit={submit}>
    {account && <div className="account-status-row" role="status"><PlanBadge active={proActive} l={l}/><DeliveryBadge status={status} proActive={proActive} l={l}/></div>}
    {account && proActive === false && <div className="delivery-upgrade"><p>{zh ? '每日摘要邮件仅向有效 Pro 用户开放。你的推送偏好会保留。' : 'Daily digest emails require Pro. Your delivery preferences stay saved.'}</p><a className="primary billing-link" href={digestDestination(l,false,location.search)}>{zh ? '开始使用' : 'Get started'}</a></div>}
    <fieldset disabled={!proActive}><legend>{zh ? '订阅内容' : 'Content types'}</legend><div className="checks account-type-grid">{TYPES.map(type => <label key={type}><input type="checkbox" checked={types.includes(type)} onChange={() => toggleType(type)}/>{typeLabel(type, l)}</label>)}</div></fieldset>
    <fieldset disabled={!proActive}><legend>{zh ? '关注榜单' : 'Boards to follow'}</legend><div className="checks account-board-grid">{boardChoices.map(board => <label key={board}><input type="checkbox" checked={boards.includes(board)} onChange={() => setBoards(old => old.includes(board) ? old.filter(value => value !== board) : [...old, board])}/>{boardLabels[board][zh ? 0 : 1]}</label>)}</div></fieldset>
    <fieldset disabled={!proActive} className="delivery-fields"><div className="form-grid">
      <div className="field"><label htmlFor="digest-language">{zh ? '编程语言' : 'Language'}</label><TopicMultiSelect id="digest-language" value={languages} onChange={setLanguages} options={options([...new Set([...languages, ...filters.languages])])} placeholder={zh ? '全部语言' : 'All languages'} ariaLabel={zh ? '编程语言' : 'Language'}/></div>
      <div className="field"><label htmlFor="digest-topic">{zh ? '主题' : 'Topic'}</label><TopicMultiSelect id="digest-topic" value={topics} onChange={setTopics} options={options([...new Set([...topics, ...filters.topics])])} placeholder={zh ? '全部主题' : 'All topics'} ariaLabel={zh ? '主题' : 'Topic'}/></div>
      <div className="field"><label htmlFor="digest-hour">{zh ? '发送时间' : 'Send time'}</label><DesignSelect id="digest-hour" value={hour} onChange={setHour} options={Array.from({ length: 24 }, (_, index) => ({ value: String(index), label: String(index).padStart(2, '0') + ':00' }))}/></div>
      <div className="field"><label htmlFor="digest-zone">{zh ? '时区' : 'Timezone'}</label><DesignSelect id="digest-zone" value={zone} onChange={setZone} options={zoneOptions(zone)}/></div>
      <div className="field"><label htmlFor="digest-locale">{zh ? '邮件语言' : 'Email language'}</label><DesignSelect id="digest-locale" value={locale} onChange={setLocale} options={[{ value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }]}/></div>
    </div>
    </fieldset>
    <p className="account-hint">{zh ? '语言和主题留空即表示全部。邮件按类型展示榜单与增长图表。' : 'Leave language and topic empty for all. Emails include rankings and compact growth charts.'}</p>
    <button ref={saveButton} type="submit" className="primary wide" disabled={busy || !proActive}>{busy ? '…' : status ? (zh ? '保存推送设置' : 'Save delivery settings') : (zh ? '开启每日摘要' : 'Start daily digest')}</button>
    {account && status && <div className="account-status-actions">
      {status === 'active' ? <button type="button" className="primary" disabled={busy} onClick={() => changeStatus('paused')}>{zh ? '暂停发送' : 'Pause'}</button> : <button type="button" className="primary" disabled={busy || !proActive} onClick={() => changeStatus('active')}>{zh ? '恢复发送' : 'Resume'}</button>}
      {status !== 'cancelled' && <button ref={stopButton} type="button" className="primary" disabled={busy} onClick={() => { setMessage(''); setConfirmStop(true); }}>{zh ? '停止邮件推送' : 'Stop emails'}</button>}
    </div>}
    {account && <p className="account-hint">{zh ? '暂停或停止邮件不会取消付费续订。' : 'Pausing or stopping emails does not cancel paid renewal.'} <a href={`/${l}/account/subscription`}>{zh ? '管理订阅与账单' : 'Subscribe & billing'}</a></p>}
    {message && !confirmStop && <p className="form-message" role="status">{message}</p>}
    <Dialog.Root open={confirmStop} onOpenChange={open => { if (!busy) setConfirmStop(open); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content billing-confirm" onCloseAutoFocus={event => { event.preventDefault(); (stopButton.current || saveButton.current)?.focus(); }}><Dialog.Title>{zh ? '停止邮件推送？' : 'Stop email delivery?'}</Dialog.Title><Dialog.Description>{zh ? '停止后不再收到每日摘要，可随时恢复。你的 Pro 套餐和付费续订保持不变。' : 'You will stop receiving daily digests and can resume anytime. Your Pro plan and paid renewal remain unchanged.'}</Dialog.Description><div className="billing-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setConfirmStop(false)}>{zh ? '继续接收邮件' : 'Keep receiving emails'}</button><button type="button" className="primary" disabled={busy} onClick={() => changeStatus('cancelled')}>{busy ? '…' : (zh ? '确认停止推送' : 'Confirm stop')}</button></div>{message && <p role="alert">{message}</p>}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </form>;
}

export function AccountSubscribeForm({ l, currentType, currentBoard }) {
  const user = React.useContext(AuthContext);
  const [subscription, setSubscription] = useState(undefined);
  useEffect(() => {
    if (!user) return;
    request('/api/subscription').then(result => setSubscription(result.subscription)).catch(() => setSubscription(null));
  }, [user?.id]);
  if (user === undefined || (user && subscription === undefined)) return <p>{l === 'zh' ? '加载中…' : 'Loading…'}</p>;
  if (!user) return <a className="primary billing-link" href={loginUrl(l, `/${l}/account/delivery`)}>{l === 'zh' ? '登录后设置推送' : 'Sign in to set up delivery'}</a>;
  return <SubscriptionSettings l={l} currentType={currentType} currentBoard={currentBoard} subscription={subscription}/>;
}

export function LoginPage({ l, user, navigate }) {
  const zh = l === 'zh', query = new URLSearchParams(location.search);
  const next = safeAccountReturn(query.get('next'), l), reset = query.get('mode') === 'reset-request';
  const [providers, setProviders] = useState({ google: false });
  useEffect(() => { request('/api/auth/providers').then(setProviders).catch(() => {}); }, []);
  useEffect(() => { if (user && !reset && !query.get('error')) navigate(next, true); }, [user?.id, next, reset]);
  const errors = {
    google_failed: zh ? 'Google 登录未完成，请重试或使用邮箱登录。' : 'Google sign-in did not finish. Retry or use email.',
    google_unavailable: zh ? 'Google 登录暂不可用，请使用邮箱。' : 'Google sign-in is unavailable. Please use email.',
    email_verification_required: zh ? '请使用邮箱验证码验证此邮箱并继续登录。' : 'Please continue with an email code to verify ownership of this address.',
    link_failed: zh ? '无法关联此 Google 账户。请确认登录邮箱一致，且未关联其他账户。' : 'Could not connect Google. Check that the emails match and the Google account is not connected elsewhere.'
  };
  return <div className="login-page"><main className="login-main"><a className="brand login-brand" href={`/${l}/home`}>Trend Top</a><header className="login-heading"><p className="account-kicker">{zh ? '你的开源发现空间' : 'YOUR OPEN-SOURCE DISCOVERY SPACE'}</p><h1>{reset ? (zh ? '重设你的密码' : 'Reset your password') : (zh ? '发现开源新动向' : 'Discover what’s next')}</h1><p>{zh ? '登录后管理你的套餐和每日摘要。' : 'Manage your plan and daily digest in one place.'}</p></header><section className="login-card" aria-label={zh ? '登录' : 'Sign in'}>{errors[query.get('error')] && <p className="form-message" role="alert">{errors[query.get('error')]}</p>}<AuthForm key={reset ? 'reset' : 'auth'} l={l} initialMode={reset ? 'reset-request' : 'email'} googleEnabled={providers.google} nextPath={next} onAuthenticated={() => navigate(next, true)}/><p className="login-legal">{zh ? '继续即表示你同意' : 'By continuing, you agree to our'} <a href={`/${l}/terms`}>{zh ? '服务条款' : 'Terms of Service'}</a> {zh ? '和' : 'and'} <a href={`/${l}/privacy`}>{zh ? '隐私政策' : 'Privacy Policy'}</a>{zh ? '。' : '.'}</p></section><a className="login-back" href={`/${l}/home`}>{zh ? '返回首页' : 'Back to home'}</a></main><footer className="login-footer"><span>© {new Date().getFullYear()} Trend Top</span><a href={loginUrl(zh ? 'en' : 'zh', next, reset ? 'reset-request' : undefined)}>{zh ? 'English' : '简体中文'}</a></footer></div>;
}

function WatchPanel({ l, proActive, navigate }) {
  const zh = l === 'zh';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    const requestWatch = async () => {
      const response = await fetch(proActive ? '/api/watches' : '/api/watches/saved', { signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 403) { setData({ items: [], locked: true }); return; }
      if (!response.ok) throw new Error(payload.error || 'Watchlist failed');
      setData(payload);
    };
    requestWatch().catch(err => { if (err.name !== 'AbortError') setError(zh ? '无法加载关注列表，请刷新重试。' : 'Could not load your watchlist. Refresh to retry.'); });
    return () => controller.abort();
  }, [proActive]);
  useEffect(() => {
    if (!proActive || !data?.items?.length) return;
    const controller = new AbortController();
    fetch('/api/watches/seen', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: data.items.map(({ type, id, sampledAt }) => ({ type, id, sampledAt })) }) }).catch(() => {});
    return () => controller.abort();
  }, [proActive, data]);
  const upgrade = !proActive && <><p>{zh ? '实时名次与变化是 Pro 功能。已保存的关注仍可取消。' : 'Live ranks and changes require Pro. You can still remove saved watches.'}</p><a className="primary billing-link" href={`/${l}/pricing`}>{zh ? '成为 Pro' : 'Become Pro'}</a></>;
  if (!data) return <p>{error || (zh ? '加载关注列表…' : 'Loading watchlist…')}</p>;
  if (!data.items?.length) return <>{upgrade}<p className="account-hint">{zh ? '还没有关注项目。打开任意详情页，点「关注」。' : 'Nothing watched yet. Open a project and choose Watch.'}</p></>;
  const deltaText = (value, zhUp, enUp, zhDown, enDown) => {
    if (value == null) return '—';
    if (value > 0) return `${zh ? zhUp : enUp} ${value}`;
    if (value < 0) return `${zh ? zhDown : enDown} ${Math.abs(value)}`;
    return zh ? '持平' : 'No change';
  };
  return <div className="watch-list">{upgrade}{proActive && <p className="account-hint">{zh ? '名次按全部项目的「周热度榜」计算；变化从上次查看关注列表开始。未进入该榜的项目显示 —。' : 'Ranks use the unfiltered weekly Hot board. Changes start from your last watchlist view. Projects outside this board show —.'}</p>}{error && <p role="alert">{error}</p>}{data.items.map(item => {
    const href = itemPath(l, item.type, item.slug || item.id);
    return <article className="watch-item" key={item.type + item.id}>
      <p className="watch-type">{typeLabel(item.type, l)}</p>
      <h2><a href={href} onClick={event => { event.preventDefault(); navigate(href); }}>{item.full_name}</a></h2>
      <p>{item.description || '—'}</p>
      {proActive && <div className="watch-deltas">
        <span className={item.rankDelta > 0 ? 'positive' : item.rankDelta < 0 ? 'down' : ''}>{zh ? '名次' : 'Rank'} {item.rank ?? '—'} · {deltaText(item.rankDelta, '上升', 'up', '下降', 'down')}</span>
        <span className={item.starDelta > 0 ? 'positive' : item.starDelta < 0 ? 'down' : ''}>Stars {item.stars} · {item.starDelta > 0 ? `+${item.starDelta}` : item.starDelta}</span>
      </div>}
      <button type="button" className="ghost" onClick={async () => {
        setError('');
        try {
          const response = await fetch('/api/watches', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: item.type, id: item.id }) });
          if (!response.ok) throw new Error('Unwatch failed');
          setData(current => ({ ...current, items: current.items.filter(row => !(row.type === item.type && row.id === item.id)) }));
        } catch { setError(zh ? '取消关注失败，请重试。' : 'Could not unwatch this project. Try again.'); }
      }}>{zh ? '取消关注' : 'Unwatch'}</button>
    </article>;
  })}</div>;
}

export function AccountPage({ l, section = '', navigate }) {
  const user = React.useContext(AuthContext), zh = l === 'zh';
  const [subscription, setSubscription] = useState(undefined), [proActive, setProActive] = useState(null), [error, setError] = useState('');
  const settingsSection = ['settings', 'delivery', 'watch', 'saved', 'admin'].includes(section);
  const selected = settingsSection ? 'settings' : 'subscription';
  const current = new URLSearchParams(location.search);
  const requested = section === 'settings' ? current.get('panel') || 'delivery' : section;
  const panel = ['delivery', 'watch', 'saved'].includes(requested) ? requested : requested === 'admin' && user?.isAdmin ? 'admin' : 'delivery';
  useEffect(() => {
    if (user === null) navigate(loginUrl(l, location.pathname + location.search), true);
    else if (user && !['settings', 'subscription'].includes(section)) {
      const query = new URLSearchParams(location.search);
      if (settingsSection) query.set('panel', panel);
      navigate('/' + l + '/account/' + selected + (query.size ? '?' + query : ''), true);
    }
  }, [user, l, section, selected, panel]);
  useEffect(() => {
    if (!user) return;
    let live = true;
    request('/api/subscription').then(result => { if (live) { setSubscription(result.subscription); setProActive(result.access.active); setError(''); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [user?.id, selected]);
  const titles = { subscription: zh ? '订阅与账单' : 'Subscribe & billing', settings: zh ? '设置' : 'Settings' };
  const panels = { delivery: zh ? '邮件偏好' : 'Email preferences', watch: zh ? '关注列表' : 'Watchlist', saved: zh ? '保存筛选' : 'Saved searches', ...(user?.isAdmin ? { admin: zh ? '网站管理' : 'Site administration' } : {}) };
  const go = target => event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(target); };
  const delivery = () => subscription === undefined ? <p role={error ? 'alert' : undefined}>{error || (zh ? '加载中…' : 'Loading…')}</p> : <SubscriptionSettings key={user.id + selected} l={l} subscription={subscription} proActive={proActive} account currentType={current.get('type')} currentBoard={current.get('board')} onSaved={setSubscription}/>;
  return <main className="simple-page account-page"><div className="account-page-head"><p className="account-kicker">Trend Top / {zh ? '账户' : 'Account'}</p><h1>{titles[selected]}</h1><p>{selected === 'subscription' ? (zh ? '管理你的套餐、续订与付款。' : 'Manage your plan, renewal and payments.') : (zh ? '管理你的邮件偏好与关注内容。' : 'Manage your email preferences and followed content.')}</p>{user && proActive !== null && <div className="account-status-row"><PlanBadge active={proActive} l={l}/></div>}</div>
    <nav className="account-navigation" aria-label={zh ? '账户导航' : 'Account navigation'}>{Object.entries(titles).map(([key, title]) => <a key={key} aria-current={selected === key ? 'page' : undefined} href={'/' + l + '/account/' + key} onClick={go('/' + l + '/account/' + key)}>{title}</a>)}</nav>
    {selected === 'settings' && <nav className="account-settings-navigation" aria-label={zh ? '设置分类' : 'Settings categories'}>{Object.entries(panels).map(([key, title]) => <a key={key} aria-current={panel === key ? 'page' : undefined} href={'/' + l + '/account/settings?panel=' + key} onClick={go('/' + l + '/account/settings?panel=' + key)}>{title}</a>)}</nav>}
    <div className="account-page-card">{!user ? <p>{zh ? '加载中…' : 'Loading…'}</p> : selected === 'subscription' ? <BillingCard l={l}/> : panel === 'admin' && user.isAdmin ? <React.Suspense fallback={<p>{zh ? '加载中…' : 'Loading…'}</p>}><AdminSettings l={l} embedded/></React.Suspense> : panel === 'watch' ? proActive === null ? <p>{zh ? '加载中…' : 'Loading…'}</p> : <WatchPanel l={l} proActive={proActive} navigate={navigate}/> : panel === 'saved' ? proActive === null ? <p>{zh ? '加载中…' : 'Loading…'}</p> : <SavedSearchPanel l={l} proActive={proActive} navigate={navigate}/> : <>{delivery()}<DeliveryHistory l={l}/></>}</div><SupportContact l={l}/>
  </main>;
}
