export function safeAccountReturn(value, locale = 'en') {
  const fallback = `/${locale === 'zh' ? 'zh' : 'en'}/account`;
  const path = String(value || '');
  // Accept only this site's localized paths. Reject encoded slashes/backslashes,
  // protocol-relative URLs and control characters before redirecting.
  if (!/^\/(en|zh)(?:\/|$)/.test(path) || /[\\\x00-\x20]|%2f|%5c|%0[ad]/i.test(path)) return fallback;
  try {
    const url = new URL(path, 'https://trend-top.invalid');
    return url.origin === 'https://trend-top.invalid' && /^\/(en|zh)(?:\/|$)/.test(url.pathname)
      ? url.pathname + url.search + url.hash : fallback;
  }
  catch { return fallback; }
}

export const loginUrl = (locale = 'en', next, mode) => `/login?${new URLSearchParams({ locale, next: safeAccountReturn(next, locale), ...(mode ? { mode } : {}) })}`;

export function digestEntryPath(locale='en', type='github-repo', board='hot') {
  return '/'+locale+'/digest?'+new URLSearchParams({type:type || 'github-repo',board:board || 'hot'});
}
export function digestDestination(locale, active, query='') {
  const context=new URLSearchParams(query), selected=new URLSearchParams();
  if (context.get('type')) selected.set('type',context.get('type'));
  if (context.get('board')) selected.set('board',context.get('board'));
  return '/'+locale+(active?'/account/delivery':'/pricing')+(selected.size?'?'+selected:'');
}
