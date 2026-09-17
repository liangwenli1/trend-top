import { emailBrandHeader } from './email-brand.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function buildAuthEmail({ code, locale = 'en', purpose = 'login', minutes = 10, publicUrl = process.env.PUBLIC_URL || 'http://localhost:5173' }) {
  const zh = locale === 'zh';
  const root = publicUrl.replace(/\/$/, '');
  const action = purpose === 'login' ? (zh ? '登录' : 'sign-in') : purpose === 'register' ? (zh ? '注册' : 'registration') : (zh ? '重设密码' : 'password reset');
  const title = purpose === 'login' ? (zh ? '登录你的账户' : 'Sign in to your account') : purpose === 'register' ? (zh ? '验证你的邮箱' : 'Verify your email') : (zh ? '重设你的密码' : 'Reset your password');
  const instruction = zh ? '返回刚才的页面，输入以下六位验证码。' : 'Return to the page you opened and enter this six-digit code.';
  const expiry = zh ? `${minutes} 分钟内有效，仅可使用一次。` : `Expires in ${minutes} minutes. Works once.`;
  const ignore = zh ? '如果你没有请求此验证码，可以忽略这封邮件。请勿将验证码分享给他人。' : 'If you did not request this code, you can ignore this email. Do not share this code with anyone.';
  const subject = zh ? `Trend Top ${action}验证码` : `Trend Top ${action} code`;
  const text = zh ? `Trend Top\n\n你的${action}验证码：${code}\n${expiry}\n\n${instruction}\n\n${ignore}` : `Trend Top\n\nYour ${action} code: ${code}\n${expiry}\n\n${instruction}\n\n${ignore}`;
  const html = `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f3;color:#111;font-family:Arial,'Microsoft YaHei',sans-serif">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;mso-hide:all">${escape(instruction)} ${escape(expiry)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f5f5f3;border-collapse:collapse"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:collapse;background:#fff;border:1px solid #dedede;border-top:4px solid #315fd9"><tr><td style="padding:24px">
${emailBrandHeader(root, locale)}
<p style="margin:24px 0 12px;border-top:1px solid #dedede;padding-top:24px;color:#315fd9;font-size:11px;line-height:18px;letter-spacing:1.5px;font-weight:700">${zh ? '账户 / 邮箱验证' : 'ACCOUNT / EMAIL VERIFICATION'}</p>
<h1 style="margin:0 0 12px;color:#111;font-size:26px;line-height:34px;letter-spacing:-.5px">${escape(title)}</h1>
<p style="margin:0 0 24px;color:#666;font-size:15px;line-height:24px">${escape(instruction)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#f2f5ff;border:1px solid #dce4fb"><tr><td align="center" style="padding:20px 8px">
<p style="margin:0 0 8px;color:#666;font-size:12px;line-height:18px">${zh ? '你的验证码' : 'Your verification code'}</p>
<p dir="ltr" style="margin:0;color:#111;font-family:Consolas,'Courier New',monospace;font-size:36px;line-height:46px;font-weight:700;letter-spacing:6px;white-space:nowrap">${escape(code)}</p>
</td></tr></table>
<p style="margin:12px 0 24px;color:#666;font-size:12px;line-height:20px;text-align:center">${escape(expiry)}</p>
<p style="margin:0;border-top:1px solid #dedede;padding-top:20px;color:#666;font-size:13px;line-height:22px">${escape(ignore)}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:16px 0 0;color:#777;font-size:11px;line-height:18px">${zh ? '发现开源新动向。' : 'Find what is moving in open source.'}</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
