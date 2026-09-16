import nodemailer from 'nodemailer';
import { asJson, query } from './db.js';
import { getRankings, boards } from './rankings.js';

const base = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
const tr = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  })
  : null;
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c]));
export const mailReady = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM) || Boolean(tr && process.env.SMTP_FROM);

export async function sendMail(to, subject, text, html, headers, idempotencyKey) {
  if ((process.env.DATA_MODE || 'demo') === 'demo') {
    await query(
      'INSERT INTO outbox (to_email, subject, text, html, created_at) VALUES ($1, $2, $3, $4, $5)',
      [to, subject, text, html, new Date().toISOString()]
    );
    console.log(`[DEMO MAIL] ${to}: ${subject}`);
    return;
  }
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TrendTop/0.2.0',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
      },
      body: JSON.stringify({ from: process.env.RESEND_FROM, to: [to], subject, text, html, headers })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.id) throw new Error(`Resend delivery failed (${response.status}): ${result?.message || 'No email ID returned'}`);
    return;
  }
  if (tr && process.env.SMTP_FROM) {
    await tr.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html, headers });
    return;
  }
  throw new Error('Email provider is not configured');
}

export async function sendVerification(sub, token) {
  const zh = sub.locale === 'zh';
  const link = `${base}/${sub.locale}/verify?token=${encodeURIComponent(token)}`;
  const subject = zh ? '验证你的 Trend Top 订阅' : 'Verify your Trend Top subscription';
  const text = (zh ? '请点击以下链接验证邮箱，验证后才会开始发送每日摘要：' : 'Open this link to verify your email before daily digests begin:') + `\n${link}`;
  const html = `<div style="font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#172327"><h1 style="font-size:24px">Trend Top</h1><p>${zh ? '请验证邮箱以启用每日摘要。' : 'Verify your email to enable your daily digest.'}</p><p><a href="${escape(link)}" style="display:inline-block;background:#087e61;color:#fff;padding:12px 18px;border-radius:8px">${zh ? '验证邮箱' : 'Verify email'}</a></p><p>${escape(link)}</p></div>`;
  await sendMail(sub.email, subject, text, html);
}

export async function buildDigest(sub, manageToken) {
  const zh = sub.locale === 'zh';
  const names = asJson(sub.boards, []);
  const topics = (Array.isArray(asJson(sub.topics, null)) ? asJson(sub.topics, []) : (sub.topic ? [sub.topic] : []))
    .map(value => String(value ?? '').trim()).filter(Boolean);
  const languages = (Array.isArray(asJson(sub.languages, null)) ? asJson(sub.languages, []) : (sub.language ? String(sub.language).split(',') : []))
    .map(value => String(value ?? '').trim()).filter(Boolean);
  const topicQuery = topics.join(',');
  const languageQuery = languages.join(',');
  const sections = [];
  for (const board of names) {
    if (!boards[board]) continue;
    const ranking = await getRankings({ board, period: 'day', language: languageQuery, languages, topic: topicQuery, topics, limit: 5 });
    if (!ranking.updatedAt) continue;
    sections.push({ board, name: boards[board][sub.locale], items: ranking.items, updatedAt: ranking.updatedAt });
  }
  const manage = `${base}/${sub.locale}/account/delivery`;
  const unsubscribe = `${manage}?intent=stop`;
  const oneClick = `${base}/api/one-click?token=${encodeURIComponent(manageToken)}`;
  const boardLink = board => `${base}/${sub.locale}/board/${board}?${new URLSearchParams({ period: 'day', language: languageQuery, languages: languageQuery, topic: topicQuery, topics: topicQuery })}`;
  const num = new Intl.NumberFormat(sub.locale === 'zh' ? 'zh-CN' : 'en-US');
  const localTime = at => new Intl.DateTimeFormat(sub.locale === 'zh' ? 'zh-CN' : 'en-US', { timeZone: sub.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at));
  const subject = zh ? 'Trend Top 每日摘要' : 'Trend Top daily digest';
  const intro = zh ? '你关注的开源项目榜单' : 'Your open-source discovery digest';
  const lines = [
    intro, '',
    ...sections.flatMap(s => [
      `${s.name} · ${localTime(s.updatedAt)} (${sub.timezone})`,
      ...s.items.map(r => `#${r.rank} ${r.full_name} · ${r.gain === null ? (zh ? '数据不足' : 'Insufficient data') : `+${num.format(r.gain)} ★`} · ${r.url}`),
      boardLink(s.board),
      ''
    ]),
    zh ? '管理邮件推送：' : 'Manage email delivery:', manage,
    zh ? '停止邮件推送：' : 'Stop emails:', unsubscribe
  ];
  const html = `<div style="background:#f5f7f7;padding:16px"><main style="max-width:600px;margin:auto;background:#fff;padding:24px;font:15px/1.6 system-ui,sans-serif;color:#172327"><h1 style="margin:0">Trend Top</h1><p>${intro}</p>${sections.map(s => `<section style="border-top:1px solid #dce4e5;padding:18px 0"><h2 style="font-size:19px">${escape(s.name)}</h2><p style="font-size:12px;color:#526267">${zh ? '数据采样' : 'Sampled'}: ${escape(localTime(s.updatedAt))} (${escape(sub.timezone)})${(process.env.DATA_MODE || 'demo') === 'demo' ? ' · DEMO DATA' : ''}</p>${s.items.map(r => `<p style="margin:10px 0"><strong>#${r.rank}</strong> <a href="${escape(r.url)}">${escape(r.full_name)}</a><br><span style="color:#526267">${r.gain === null ? (zh ? '数据不足' : 'Insufficient data') : `+${num.format(r.gain)} ★`}</span></p>`).join('')}<a href="${escape(boardLink(s.board))}">${zh ? '查看完整榜单' : 'View full board'}</a></section>`).join('')}<footer style="border-top:1px solid #dce4e5;padding-top:16px;font-size:13px"><a href="${escape(manage)}">${zh ? '管理邮件推送' : 'Manage email delivery'}</a> · <a href="${escape(unsubscribe)}">${zh ? '停止邮件推送' : 'Stop emails'}</a></footer></main></div>`;
  return { subject, text: lines.join('\n'), html, sections, unsubscribe, oneClick };
}
