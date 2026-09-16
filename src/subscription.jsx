import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { DesignSelect, TopicMultiSelect } from './components.jsx';
import { TYPES, typeLabel, itemPath } from './catalog.js';
import { BillingCard } from './billing-ui.jsx';
import './account.css';
import { loginUrl, safeAccountReturn, digestDestination } from '../shared/account-paths.js';
export const AuthContext = React.createContext(undefined);
export function useProStatus(user) {
  const [access,setAccess]=useState(false);
  useEffect(()=>{
    let live=true;setAccess(false);
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

function EmailCodeInput({ digits, onChange, zh }) {
  const inputs = useRef([]);
  const updateDigits = (start, text) => {
    const values = String(text).replace(/\D/g, '');
    if (!values) return;
    const first = values.length >= 6 ? 0 : start;
    onChange(previous => {
      const next = [...previous];
      for (let offset = 0; offset < values.length && first + offset < 6; offset++) next[first + offset] = values[offset];
      return next;
    });
    inputs.current[Math.min(first + values.length, 5)]?.focus();
  };
  const clearDigit = index => onChange(previous => previous.map((value, position) => position === index ? '' : value));
  const keyDown = (event, index) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const target = digits[index] ? index : Math.max(0, index - 1);
      clearDigit(target);
      inputs.current[target]?.focus();
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

export function AuthForm({ l, onAuthenticated, initialMode = 'register', googleEnabled = false, nextPath }) {
  const zh = l === 'zh';
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codeDigits, setCodeDigits] = useState(emptyCode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const changeMode = next => { setMode(next); setMessage(''); setCodeDigits(emptyCode()); };
  const submit = async event => {
    event.preventDefault();
    const code = codeDigits.join('');
    setBusy(true); setMessage('');
    try {
      if (mode === 'register') {
        await request('/api/auth/register', 'POST', { email, password, locale: l });
        setMode('verify');
        setMessage(zh ? '验证码已发送，10 分钟内有效。' : 'Code sent. It expires in 10 minutes.');
      } else if (mode === 'verify') {
        const result = await request('/api/auth/register/verify', 'POST', { email, code });
        announceAuthChange(result.user);
        onAuthenticated(result.user);
      } else if (mode === 'login') {
        const result = await request('/api/auth/login', 'POST', { email, password });
        announceAuthChange(result.user);
        onAuthenticated(result.user);
      } else if (mode === 'reset-request') {
        await request('/api/auth/password/reset/request', 'POST', { email, locale: l });
        setMode('reset');
        setMessage(zh ? '如果该邮箱已注册，验证码已发送。' : 'If this email has an account, a code was sent.');
      } else if (mode === 'reset') {
        await request('/api/auth/password/reset', 'POST', { email, code, password });
        announceAuthChange(null);
        setMode('login');
        setCodeDigits(emptyCode()); setPassword('');
        setMessage(zh ? '密码已重设，请登录。' : 'Password reset. Please sign in.');
      }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const needsCode = mode === 'verify' || mode === 'reset';
  const needsPassword = mode === 'register' || mode === 'login' || mode === 'reset';
  return <div className="account-auth">
    <div className="account-tabs">
      <button type="button" aria-current={['register', 'verify'].includes(mode) ? 'page' : undefined} onClick={() => changeMode('register')}>{zh ? '注册' : 'Register'}</button>
      <button type="button" aria-current={mode === 'login' ? 'page' : undefined} onClick={() => changeMode('login')}>{zh ? '登录' : 'Sign in'}</button>
    </div>
    <form onSubmit={submit} className="subscribe-form">
      <div className="field"><label htmlFor="account-email">{zh ? '邮箱' : 'Email'}</label><input id="account-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"/></div>
      {needsPassword && <div className="field"><label htmlFor="account-password">{mode === 'reset' ? (zh ? '新密码' : 'New password') : (zh ? '密码' : 'Password')}</label><input id="account-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? undefined : 10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'login' ? undefined : zh ? '至少 10 个字符' : 'At least 10 characters'}/></div>}
      {needsCode && <EmailCodeInput digits={codeDigits} onChange={setCodeDigits} zh={zh}/>}
      <button type="submit" className="primary wide" disabled={busy}>{busy ? '…' : mode === 'register' ? (zh ? '发送注册验证码' : 'Send registration code') : mode === 'verify' ? (zh ? '验证并注册' : 'Verify and register') : mode === 'login' ? (zh ? '登录' : 'Sign in') : mode === 'reset-request' ? (zh ? '发送重设验证码' : 'Send reset code') : (zh ? '重设密码' : 'Reset password')}</button>
      {mode === 'login' && <button type="button" className="account-text-button" onClick={() => changeMode('reset-request')}>{zh ? '忘记密码？' : 'Forgot password?'}</button>}
      {mode === 'verify' && <button type="button" className="account-text-button" onClick={() => changeMode('register')}>{zh ? '重新发送验证码' : 'Send another code'}</button>}
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
    {googleEnabled && ['register', 'login'].includes(mode) && <><div className="login-divider"><span>{zh ? '或' : 'or'}</span></div><a className="login-google" href={`/api/auth/google?${new URLSearchParams({ locale: l, next: safeAccountReturn(nextPath, l) })}`}><img src="/google-signin.png" width="20" height="20" alt=""/>{zh ? '使用 Google 继续' : 'Continue with Google'}</a></>}
  </div>;
}

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
  const [confirmStop, setConfirmStop] = useState(false);
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
      setConfirmStop(false);
      setMessage(next === 'paused' ? (zh ? '已暂停邮件发送。' : 'Email delivery paused.') : next === 'cancelled' ? (zh ? '已停止邮件推送，付费套餐未变更。' : 'Emails stopped. Your paid plan is unchanged.') : (zh ? '已恢复邮件发送。' : 'Email delivery resumed.'));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <form className="subscribe-form account-settings" onSubmit={submit}>
    {account && <p className="account-status">{zh ? '邮件推送：' : 'Email delivery: '}{status === 'active' ? (zh ? '发送中' : 'Active') : status === 'paused' ? (zh ? '已暂停' : 'Paused') : status === 'cancelled' ? (zh ? '已停止' : 'Stopped') : (zh ? '尚未设置' : 'Not set up')}</p>}
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
      {status === 'active' ? <button type="button" className="ghost" disabled={busy} onClick={() => changeStatus('paused')}>{zh ? '暂停发送' : 'Pause'}</button> : <button type="button" className="ghost" disabled={busy || !proActive} onClick={() => changeStatus('active')}>{zh ? '恢复发送' : 'Resume'}</button>}
      {status !== 'cancelled' && <button ref={stopButton} type="button" className="danger" disabled={busy} onClick={() => { setMessage(''); setConfirmStop(true); }}>{zh ? '停止邮件推送' : 'Stop emails'}</button>}
    </div>}
    {account && <p className="account-hint">{zh ? '暂停或停止邮件不会取消付费续订。' : 'Pausing or stopping emails does not cancel paid renewal.'} <a href={`/${l}/account/subscription`}>{zh ? '管理套餐与账单' : 'Manage plan & billing'}</a></p>}
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
    email_verification_required: zh ? '此 Google 账户使用第三方邮箱。请先通过邮件验证码注册，再在账户设置中关联 Google。' : 'This Google account uses a third-party email. Register with an email code first, then connect Google in Account settings.',
    link_failed: zh ? '无法关联此 Google 账户。请确认登录邮箱一致，且未关联其他账户。' : 'Could not connect Google. Check that the emails match and the Google account is not connected elsewhere.'
  };
  return <div className="login-page"><main className="login-main"><a className="brand login-brand" href={`/${l}/home`}>Trend Top</a><header className="login-heading"><p className="account-kicker">{zh ? '你的开源发现空间' : 'YOUR OPEN-SOURCE DISCOVERY SPACE'}</p><h1>{reset ? (zh ? '重设你的密码' : 'Reset your password') : (zh ? '欢迎来到 Trend Top' : 'Welcome to Trend Top')}</h1><p>{zh ? '登录后管理你的套餐和每日摘要。' : 'Manage your plan and daily digest in one place.'}</p></header><section className="login-card" aria-label={zh ? '登录与注册' : 'Sign in and registration'}>{errors[query.get('error')] && <p className="form-message" role="alert">{errors[query.get('error')]}</p>}<AuthForm key={reset ? 'reset' : 'auth'} l={l} initialMode={reset ? 'reset-request' : 'login'} googleEnabled={providers.google} nextPath={next} onAuthenticated={() => navigate(next, true)}/><p className="login-legal">{zh ? '继续即表示你同意' : 'By continuing, you agree to our'} <a href={`/${l}/terms`}>{zh ? '服务条款' : 'Terms of Service'}</a> {zh ? '和' : 'and'} <a href={`/${l}/privacy`}>{zh ? '隐私政策' : 'Privacy Policy'}</a>{zh ? '。' : '.'}</p></section><a className="login-back" href={`/${l}/home`}>{zh ? '返回首页' : 'Back to home'}</a></main><footer className="login-footer"><span>© {new Date().getFullYear()} Trend Top</span><a href={loginUrl(zh ? 'en' : 'zh', next, reset ? 'reset-request' : undefined)}>{zh ? 'English' : '简体中文'}</a></footer></div>;
}

function WatchPanel({ l, proActive, navigate }) {
  const zh = l === 'zh';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!proActive) { setData({ items: [] }); return; }
    const requestWatch = async () => {
      const response = await fetch('/api/watches');
      const payload = await response.json().catch(() => ({}));
      if (response.status === 403) { setData({ items: [], locked: true }); return; }
      if (!response.ok) throw new Error(payload.error || 'Watchlist failed');
      setData(payload);
    };
    requestWatch().catch(err => setError(err.message));
  }, [proActive]);
  if (!proActive) return <><p>{zh ? '关注列表是 Pro 功能。关注后可看到距上次访问的名次和 Star 变化。' : 'Watchlist is a Pro feature. After you watch a project, you can see rank and star changes since your last visit.'}</p><a className="primary billing-link" href={`/${l}/pricing`}>{zh ? '成为 Pro' : 'Become Pro'}</a></>;
  if (!data) return <p>{error || (zh ? '加载关注列表…' : 'Loading watchlist…')}</p>;
  if (!data.items?.length) return <p className="account-hint">{zh ? '还没有关注项目。打开任意详情页，点「关注」。' : 'Nothing watched yet. Open a project and choose Watch.'}</p>;
  const deltaText = (value, zhUp, enUp, zhDown, enDown) => {
    if (value == null) return '—';
    if (value > 0) return `${zh ? zhUp : enUp} ${value}`;
    if (value < 0) return `${zh ? zhDown : enDown} ${Math.abs(value)}`;
    return zh ? '持平' : 'No change';
  };
  return <div className="watch-list">{data.items.map(item => {
    const href = itemPath(l, item.type, item.slug || item.id);
    return <article className="watch-item" key={item.type + item.id}>
      <p className="watch-type">{typeLabel(item.type, l)}</p>
      <h2><a href={href} onClick={event => { event.preventDefault(); navigate(href); }}>{item.full_name}</a></h2>
      <p>{item.description || '—'}</p>
      <div className="watch-deltas">
        <span className={item.rankDelta > 0 ? 'positive' : item.rankDelta < 0 ? 'down' : ''}>{zh ? '名次' : 'Rank'} {item.rank ?? '—'} · {deltaText(item.rankDelta, '上升', 'up', '下降', 'down')}</span>
        <span className={item.starDelta > 0 ? 'positive' : item.starDelta < 0 ? 'down' : ''}>Stars {item.stars} · {item.starDelta > 0 ? `+${item.starDelta}` : item.starDelta}</span>
      </div>
      <button type="button" className="ghost" onClick={async () => {
        await fetch('/api/watches', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: item.type, id: item.id }) });
        setData(current => ({ items: current.items.filter(row => !(row.type === item.type && row.id === item.id)) }));
      }}>{zh ? '取消关注' : 'Unwatch'}</button>
    </article>;
  })}</div>;
}

function AccountSettings({ l, user }) {
  const zh = l === 'zh';
  const [methods, setMethods] = useState(null), [providers, setProviders] = useState({ google: false });
  const [currentPassword, setCurrentPassword] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { request('/api/auth/methods').then(setMethods).catch(error => setMessage(error.message)); request('/api/auth/providers').then(setProviders).catch(() => {}); }, []);
  const changePassword = async event => { event.preventDefault(); setBusy(true); setMessage(''); try { await request('/api/auth/password/change', 'POST', { currentPassword, password }); setCurrentPassword(''); setPassword(''); setMessage(zh ? '密码已更新，其他设备的登录已退出。' : 'Password updated. Other devices have been signed out.'); } catch (error) { setMessage(error.message); } finally { setBusy(false); } };
  return <><div className="account-user"><div><span>{zh ? '账户邮箱' : 'Account email'}</span><strong>{user.email}</strong></div><span className="account-verified">{zh ? '已验证' : 'Verified'}</span></div><section className="account-section"><div className="account-section-heading"><h2>{zh ? '登录方式' : 'Sign-in methods'}</h2></div>{!methods ? <p>{zh ? '加载中…' : 'Loading…'}</p> : <><div className="account-method"><strong>{zh ? '邮箱与密码' : 'Email & password'}</strong><span>{methods.passwordEnabled ? (zh ? '已启用' : 'Enabled') : (zh ? '未设置密码' : 'Password not set')}</span></div><div className="account-method"><strong>Google</strong>{methods.google ? <span>{zh ? '已关联' : 'Connected'}</span> : providers.google ? <a className="ghost billing-link" href={`/api/auth/google?${new URLSearchParams({ locale: l, next: `/${l}/account`, link: '1' })}`}>{zh ? '关联 Google' : 'Connect Google'}</a> : <span>{zh ? '暂未启用' : 'Not available yet'}</span>}</div></>}</section>{methods && <section className="account-section"><div className="account-section-heading"><h2>{methods.passwordEnabled ? (zh ? '修改密码' : 'Change password') : (zh ? '设置邮箱密码' : 'Set an email password')}</h2></div>{methods.passwordEnabled ? <form className="subscribe-form" onSubmit={changePassword}><div className="field"><label htmlFor="settings-current-password">{zh ? '当前密码' : 'Current password'}</label><input id="settings-current-password" type="password" autoComplete="current-password" maxLength={128} required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}/></div><div className="field"><label htmlFor="settings-new-password">{zh ? '新密码' : 'New password'}</label><input id="settings-new-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)}/><small>{zh ? '10–128 个字符。' : '10–128 characters.'}</small></div><button className="primary" disabled={busy}>{busy ? '…' : (zh ? '更新密码' : 'Update password')}</button></form> : <><p className="account-hint">{zh ? '通过邮件验证码设置密码，以后也可以用邮箱登录。' : 'Set a password with an email code to also sign in using email.'}</p><a className="ghost billing-link" href={loginUrl(l, `/${l}/account`, 'reset-request')}>{zh ? '通过邮箱设置' : 'Set up with email'}</a></>}</section>}{message && <p className="form-message" role="status">{message}</p>}</>;
}

export function AccountPage({ l, section = '', navigate }) {
  const user = React.useContext(AuthContext);
  const [subscription, setSubscription] = useState(undefined);
  const [proActive,setProActive]=useState(false);
  const [error, setError] = useState('');
  const selected = section === 'subscription' ? 'subscription' : section === 'delivery' ? 'delivery' : section === 'watch' ? 'watch' : '';
  useEffect(() => { if (user === null) navigate(loginUrl(l, location.pathname + location.search), true); }, [user]);
  useEffect(() => {
    if (!user || (selected !== 'delivery' && selected !== 'watch')) return;
    request('/api/billing/access').then(result => setProActive(result.active)).catch(() => setProActive(false));
    if (selected !== 'delivery') return;
    request('/api/subscription').then(result => {setSubscription(result.subscription);setProActive(result.access.active)}).catch(e => setError(e.message));
  }, [user?.id, selected]);
  const zh = l === 'zh';
  const titles = { '': zh ? '账户设置' : 'Account settings', watch: zh ? '关注列表' : 'Watchlist', subscription: zh ? '套餐与账单' : 'Plan & billing', delivery: zh ? '邮件推送设置' : 'Email delivery settings' };
  const hints = { '': zh ? '管理邮箱、登录方式和账户安全。' : 'Manage your email, sign-in methods, and account security.', watch: zh ? '关注后，这里显示距上次访问的名次和 Star 变化。' : 'After you watch a project, this page shows rank and star changes since your last visit.', subscription: zh ? '查看付费套餐、续费日期、付款记录与退款申请。' : 'Review your paid plan, renewal date, payments, and refund requests.', delivery: zh ? '选择收到的内容和发送时间。推送偏好与付费续订独立管理。' : 'Choose what arrives and when. Delivery preferences are managed separately from paid renewal.' };
  const current = new URLSearchParams(location.search);
  return <main className="simple-page account-page"><div className="account-page-head"><p className="account-kicker">Trend Top / {zh ? '账户' : 'Account'}</p><h1>{titles[selected]}</h1><p>{hints[selected]}</p></div><nav className="account-navigation" aria-label={zh ? '账户设置导航' : 'Account navigation'}>{Object.entries(titles).map(([key, title]) => <a key={key} aria-current={selected === key ? 'page' : undefined} href={`/${l}/account${key ? '/' + key : ''}`} onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(`/${l}/account${key ? '/' + key : ''}`); }}>{title}</a>)}</nav><div className="account-page-card">{!user ? <p>{zh ? '加载中…' : 'Loading…'}</p> : selected === 'subscription' ? <BillingCard l={l}/> : selected === 'watch' ? <WatchPanel l={l} proActive={proActive} navigate={navigate}/> : selected === 'delivery' ? subscription === undefined ? <p>{error || (zh ? '加载推送设置…' : 'Loading delivery settings…')}</p> : <><div hidden={proActive}><p>{zh?'每日摘要邮件仅向有效 Pro 用户开放。':'Daily digest emails are available with an active Pro plan.'}</p><a className="primary billing-link" href={digestDestination(l,false,location.search)}>{zh?'成为 Pro，获取每日最新热点':'Become Pro. Get the latest daily highlights'}</a></div><SubscriptionSettings proActive={proActive} key={user.id} l={l} subscription={subscription} currentType={current.get('type')} currentBoard={current.get('board')} account onSaved={setSubscription}/></> : <AccountSettings l={l} user={user}/>}</div>{error && <p role="alert">{error}</p>}</main>;
}
