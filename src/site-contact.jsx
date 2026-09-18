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
