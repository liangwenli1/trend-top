import React, { createContext, useContext, useEffect, useState } from 'react';
import { EnvelopeSimple } from '@phosphor-icons/react';
import { DEFAULT_CONTACT_EMAIL } from '../shared/site-contact.js';
import './site-contact.css';

const defaults = { contact: { email: DEFAULT_CONTACT_EMAIL }, social: {} };
const SiteSettingsContext = createContext(defaults);
export function SiteSettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaults);
  useEffect(() => {
    let live = true;
    let changed = false;
    const update = event => { changed = true; setSettings(event.detail); };
    addEventListener('trend-top-site-settings-changed', update);
    fetch('/api/site-settings').then(response => {
      if (!response.ok) throw new Error('Site settings unavailable');
      return response.json();
    }).then(value => { if (live && !changed) setSettings(value); }).catch(() => {});
    return () => { live = false; removeEventListener('trend-top-site-settings-changed', update); };
  }, []);
  return <SiteSettingsContext.Provider value={settings}>{children}</SiteSettingsContext.Provider>;
}
export const useSiteSettings = () => useContext(SiteSettingsContext);
export function SupportEmail() {
  const settings = useSiteSettings();
  const email = settings.contact?.email || DEFAULT_CONTACT_EMAIL;
  return <a href={`mailto:${email}`}>{email}</a>;
}
export function SupportContact({ l }) {
  const zh = l === 'zh';
  return <section className="customer-support" aria-label={zh ? '客户支持' : 'Customer support'}>
    <EnvelopeSimple size={24} aria-hidden="true" />
    <div><h2>{zh ? '需要帮助？' : 'Need help?'}</h2><p>{zh ? '账户、邮件推送或账单问题，请联系：' : 'For account, email delivery or billing questions, contact:'}</p><SupportEmail /><p className="support-response">{zh ? '我们将在 3 个工作日内答复。请勿发送密码、验证码或完整银行卡信息。' : 'We reply within 3 business days. Do not send passwords, verification codes or full card details.'}</p></div>
  </section>;
}
