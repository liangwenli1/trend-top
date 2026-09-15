import React, { useEffect, useRef, useState } from 'react';
import { DesignSelect, TopicMultiSelect } from './components.jsx';
import { TYPES, typeLabel } from './catalog.js';
import { BillingCard } from './billing-ui.jsx';
import './account.css';

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

export function AuthForm({ l, onAuthenticated, initialMode = 'register' }) {
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
      {needsPassword && <div className="field"><label htmlFor="account-password">{mode === 'reset' ? (zh ? '新密码' : 'New password') : (zh ? '密码' : 'Password')}</label><input id="account-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? undefined : 10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder={zh ? '至少 10 个字符' : 'At least 10 characters'}/></div>}
      {needsCode && <EmailCodeInput digits={codeDigits} onChange={setCodeDigits} zh={zh}/>}
      <button type="submit" className="primary wide" disabled={busy}>{busy ? '…' : mode === 'register' ? (zh ? '发送注册验证码' : 'Send registration code') : mode === 'verify' ? (zh ? '验证并注册' : 'Verify and register') : mode === 'login' ? (zh ? '登录' : 'Sign in') : mode === 'reset-request' ? (zh ? '发送重设验证码' : 'Send reset code') : (zh ? '重设密码' : 'Reset password')}</button>
      {mode === 'login' && <button type="button" className="account-text-button" onClick={() => changeMode('reset-request')}>{zh ? '忘记密码？' : 'Forgot password?'}</button>}
      {mode === 'verify' && <button type="button" className="account-text-button" onClick={() => changeMode('register')}>{zh ? '重新发送验证码' : 'Send another code'}</button>}
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  </div>;
}

function SubscriptionSettings({ l, currentType, currentBoard, subscription, onSaved, account = false }) {
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
      setMessage(next === 'paused' ? (zh ? '已暂停发送。' : 'Delivery paused.') : next === 'cancelled' ? (zh ? '已退订。' : 'Unsubscribed.') : (zh ? '已恢复发送。' : 'Delivery resumed.'));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <form className="subscribe-form account-settings" onSubmit={submit}>
    {account && <p className="account-status">{zh ? '订阅状态：' : 'Subscription: '}{status === 'active' ? (zh ? '发送中' : 'Active') : status === 'paused' ? (zh ? '已暂停' : 'Paused') : status === 'cancelled' ? (zh ? '已退订' : 'Unsubscribed') : (zh ? '尚未创建' : 'Not set up')}</p>}
    <fieldset><legend>{zh ? '订阅内容' : 'Content types'}</legend><div className="checks account-type-grid">{TYPES.map(type => <label key={type}><input type="checkbox" checked={types.includes(type)} onChange={() => toggleType(type)}/>{typeLabel(type, l)}</label>)}</div></fieldset>
    <fieldset><legend>{zh ? '关注榜单' : 'Boards to follow'}</legend><div className="checks account-board-grid">{boardChoices.map(board => <label key={board}><input type="checkbox" checked={boards.includes(board)} onChange={() => setBoards(old => old.includes(board) ? old.filter(value => value !== board) : [...old, board])}/>{boardLabels[board][zh ? 0 : 1]}</label>)}</div></fieldset>
    <div className="form-grid">
      <div className="field"><label htmlFor="digest-language">{zh ? '编程语言' : 'Language'}</label><TopicMultiSelect id="digest-language" value={languages} onChange={setLanguages} options={options([...new Set([...languages, ...filters.languages])])} placeholder={zh ? '全部语言' : 'All languages'} ariaLabel={zh ? '编程语言' : 'Language'}/></div>
      <div className="field"><label htmlFor="digest-topic">{zh ? '主题' : 'Topic'}</label><TopicMultiSelect id="digest-topic" value={topics} onChange={setTopics} options={options([...new Set([...topics, ...filters.topics])])} placeholder={zh ? '全部主题' : 'All topics'} ariaLabel={zh ? '主题' : 'Topic'}/></div>
      <div className="field"><label htmlFor="digest-hour">{zh ? '发送时间' : 'Send time'}</label><DesignSelect id="digest-hour" value={hour} onChange={setHour} options={Array.from({ length: 24 }, (_, index) => ({ value: String(index), label: String(index).padStart(2, '0') + ':00' }))}/></div>
      <div className="field"><label htmlFor="digest-zone">{zh ? '时区' : 'Timezone'}</label><DesignSelect id="digest-zone" value={zone} onChange={setZone} options={zoneOptions(zone)}/></div>
      <div className="field"><label htmlFor="digest-locale">{zh ? '邮件语言' : 'Email language'}</label><DesignSelect id="digest-locale" value={locale} onChange={setLocale} options={[{ value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }]}/></div>
    </div>
    <p className="account-hint">{zh ? '语言和主题留空即表示全部。邮件按类型展示榜单与增长图表。' : 'Leave language and topic empty for all. Emails include rankings and compact growth charts.'}</p>
    <button type="submit" className="primary wide" disabled={busy}>{busy ? '…' : status ? (zh ? '保存订阅设置' : 'Save subscription') : (zh ? '开启每日摘要' : 'Start daily digest')}</button>
    {account && status && <div className="account-status-actions">
      {status === 'active' ? <button type="button" className="ghost" disabled={busy} onClick={() => changeStatus('paused')}>{zh ? '暂停发送' : 'Pause'}</button> : <button type="button" className="ghost" disabled={busy} onClick={() => changeStatus('active')}>{zh ? '恢复发送' : 'Resume'}</button>}
      {status !== 'cancelled' && <button type="button" className="danger" disabled={busy} onClick={() => changeStatus('cancelled')}>{zh ? '退订' : 'Unsubscribe'}</button>}
    </div>}
    {message && <p className="form-message" role="status">{message}</p>}
  </form>;
}

export function AccountSubscribeForm({ l, currentType, currentBoard }) {
  const [user, setUser] = useState(undefined);
  const [subscription, setSubscription] = useState(undefined);
  useEffect(() => {
    request('/api/auth/me').then(result => setUser(result.user)).catch(() => setUser(null));
    const update = event => setUser(event.detail?.user || null);
    addEventListener(AUTH_CHANGED_EVENT, update);
    return () => removeEventListener(AUTH_CHANGED_EVENT, update);
  }, []);
  useEffect(() => {
    if (!user) return;
    request('/api/subscription').then(result => setSubscription(result.subscription)).catch(() => setSubscription(null));
  }, [user?.id]);
  if (user === undefined || (user && subscription === undefined)) return <p>{l === 'zh' ? '加载中…' : 'Loading…'}</p>;
  if (!user) return <AuthForm l={l} onAuthenticated={setUser}/>;
  return <div><p className="account-signed-in">{l === 'zh' ? '已登录：' : 'Signed in: '}{user.email}</p><SubscriptionSettings l={l} currentType={currentType} currentBoard={currentBoard} subscription={subscription}/></div>;
}

export function AccountPage({ l }) {
  const [user, setUser] = useState(undefined);
  const [subscription, setSubscription] = useState(undefined);
  const [error, setError] = useState('');
  useEffect(() => { request('/api/auth/me').then(result => setUser(result.user)).catch(() => setUser(null)); }, []);
  useEffect(() => {
    if (!user) return;
    request('/api/subscription').then(result => setSubscription(result.subscription)).catch(e => setError(e.message));
  }, [user?.id]);
  const logout = async () => { try { await request('/api/auth/logout', 'POST', {}); setUser(null); setSubscription(undefined); announceAuthChange(null); } catch (e) { setError(e.message); } };
  const zh = l === 'zh';
  return <main className="simple-page account-page"><div className="account-page-head"><p className="account-kicker">Trend Top / {zh ? '账户' : 'Account'}</p><h1>{user ? (zh ? '管理你的账户' : 'Manage your account') : (zh ? '登录或注册' : 'Sign in or register')}</h1><p>{zh ? '管理每日摘要、Pro 套餐与账单。' : 'Manage your daily digest, Pro plan, and billing.'}</p></div><div className="account-page-card">{user === undefined ? <p>{zh ? '加载中…' : 'Loading…'}</p> : user ? <><div className="account-user"><strong>{user.email}</strong><button type="button" className="ghost" onClick={logout}>{zh ? '退出登录' : 'Sign out'}</button></div>{subscription === undefined ? <p>{zh ? '加载订阅…' : 'Loading subscription…'}</p> : <SubscriptionSettings l={l} subscription={subscription} account onSaved={setSubscription}/>}<BillingCard l={l}/></> : <AuthForm l={l} initialMode="login" onAuthenticated={setUser}/>}</div>{error && <p role="alert">{error}</p>}</main>;
}
