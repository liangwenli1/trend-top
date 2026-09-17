const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function emailBrandHeader(root, locale = 'en') {
  const home = root.replace(/\/$/, '') + '/' + (locale === 'zh' ? 'zh' : 'en') + '/home';
  return `<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr><td align="center" style="text-align:center"><a href="${escape(home)}" style="text-decoration:none"><img src="${escape(root.replace(/\/$/, ''))}/email-logo.png" width="40" height="40" alt="" style="display:block;width:40px;height:40px;margin:0 auto 10px;border:0"><span style="display:block;font:700 24px/30px Arial,sans-serif;letter-spacing:-1px;color:#111">Trend Top</span></a></td></tr></table>`;
}
