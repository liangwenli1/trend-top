import { asJson } from './db.js';
import { TYPES, TYPE_META, ASSET_BOARDS, getCatalogRankings } from './catalog.js';
import { boards as REPO_BOARDS, getRankings } from './rankings.js';

const root = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const title = (board, type, locale) => type === 'github-repo'
  ? REPO_BOARDS[board]?.[locale] || board
  : ASSET_BOARDS[board]?.[locale] || board;
const itemUrl = (item, type, locale) => item.url || `${root}/${locale}/${type}/${encodeURIComponent(item.slug || item.id)}`;

function chart(items, num) {
  const max = Math.max(1, ...items.map(item => Number(item.gain ?? item.stars) || 0));
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0">' +
    items.map(item => {
      const value = Math.max(0, Number(item.gain ?? item.stars) || 0);
      const width = Math.max(3, Math.round(value / max * 100));
      const label = item.gain == null ? num.format(item.stars || 0) + ' ★' : '+' + num.format(item.gain) + ' ★';
      return `<tr><td style="width:42%;padding:7px 8px 7px 0;font-size:13px"><a href="${escape(item.url)}" style="color:#171717">${escape(item.full_name)}</a></td><td style="width:38%;padding:7px 8px"><div style="height:8px;background:#e9edf8"><div style="height:8px;width:${width}%;background:#315fd9"></div></div></td><td style="width:20%;padding:7px 0 7px 8px;text-align:right;white-space:nowrap;font-size:13px;font-weight:700">${escape(label)}</td></tr>`;
    }).join('') + '</table>';
}

export async function buildDigest(sub, manageToken) {
  const locale = sub.locale === 'zh' ? 'zh' : 'en';
  const zh = locale === 'zh';
  const num = new Intl.NumberFormat(zh ? 'zh-CN' : 'en-US');
  const savedTypes = asJson(sub.types, ['github-repo']);
  const types = [...new Set(Array.isArray(savedTypes) ? savedTypes : ['github-repo'])].filter(type => TYPES.includes(type));
  const boards = asJson(sub.boards, ['hot']);
  const topics = asJson(sub.topics, sub.topic ? [sub.topic] : []);
  const languages = asJson(sub.languages, sub.language ? [sub.language] : []);
  const queryBase = { period: 'day', language: languages.join(','), languages, topic: topics.join(','), topics, limit: 5 };
  const sections = [];
  for (const type of types.length ? types : ['github-repo']) {
    let first = true;
    for (const board of boards) {
      if (type === 'github-repo' ? !REPO_BOARDS[board] : !ASSET_BOARDS[board]) continue;
      const ranking = type === 'github-repo'
        ? await getRankings({ ...queryBase, board })
        : await getCatalogRankings(type, { ...queryBase, board });
      if (!ranking.updatedAt || !ranking.items?.length) continue;
      sections.push({
        type, board, chart: first, updatedAt: ranking.updatedAt,
        typeName: TYPE_META[type]?.[locale] || type,
        name: title(board, type, locale),
        items: ranking.items.slice(0, first ? 5 : 2).map(item => ({ ...item, url: itemUrl(item, type, locale) }))
      });
      first = false;
    }
  }
  const account = `${root}/${locale}/account`;
  const unsubscribe = `${root}/${locale}/unsubscribe?token=${encodeURIComponent(manageToken)}`;
  const oneClick = `${root}/api/one-click?token=${encodeURIComponent(manageToken)}`;
  const boardLink = section => `${root}/${locale}/${section.type}/ranking?${new URLSearchParams({ board: section.board, period: 'day', language: languages.join(','), topic: topics.join(',') })}`;
  const localTime = at => new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { timeZone: sub.timezone, dateStyle: 'medium' }).format(new Date(at));
  const subject = zh ? 'Trend Top 每日摘要' : 'Trend Top daily digest';
  const intro = zh ? '你关注的开源项目，每日一封。' : 'The open-source projects you follow, once a day.';
  const text = [
    intro, '',
    ...sections.flatMap(section => [
      section.typeName + ' · ' + section.name + ' · ' + localTime(section.updatedAt),
      ...section.items.map(item => '#' + item.rank + ' ' + item.full_name + ' · ' + (item.gain == null ? (zh ? '新增数据不足' : 'Growth unavailable') : '+' + num.format(item.gain) + ' ★') + ' · ' + item.url),
      boardLink(section), ''
    ]),
    zh ? '登录并管理订阅：' : 'Sign in and manage your subscription:', account,
    zh ? '退订：' : 'Unsubscribe:', unsubscribe
  ].join('\n');
  const htmlSections = sections.map(section => {
    const rows = section.items.map(item => `<p style="margin:8px 0;font-size:14px"><strong>#${item.rank}</strong> <a href="${escape(item.url)}" style="color:#171717">${escape(item.full_name)}</a> <span style="color:#606060">${item.gain == null ? (zh ? '新增数据不足' : 'Growth unavailable') : '+' + num.format(item.gain) + ' ★'}</span></p>`).join('');
    return `<section style="border-top:1px solid #dedede;padding:22px 0"><p style="margin:0 0 5px;color:#315fd9;font-size:12px;font-weight:700;letter-spacing:1px">${escape(section.typeName)}</p><h2 style="margin:0;font-size:20px">${escape(section.name)}</h2><p style="margin:5px 0 12px;color:#666;font-size:12px">${escape(localTime(section.updatedAt))} · ${escape(sub.timezone)}${(process.env.DATA_MODE || 'demo') === 'demo' ? ' · DEMO DATA' : ''}</p>${section.chart ? chart(section.items, num) : rows}<a href="${escape(boardLink(section))}" style="display:inline-block;margin-top:8px;color:#315fd9;font-weight:700">${zh ? '查看完整榜单' : 'View full ranking'} →</a></section>`;
  }).join('');
  const html = `<div style="background:#f5f5f3;padding:16px"><main style="max-width:600px;margin:auto;padding:28px;background:#fff;color:#171717;font:15px/1.6 Arial,sans-serif"><h1 style="margin:0;font-size:28px">Trend Top</h1><p>${escape(intro)}</p>${htmlSections}<footer style="border-top:1px solid #dedede;padding-top:20px;font-size:13px"><a href="${escape(account)}">${zh ? '登录并管理订阅' : 'Sign in and manage'}</a> · <a href="${escape(unsubscribe)}">${zh ? '退订' : 'Unsubscribe'}</a></footer></main></div>`;
  return { subject, text, html, sections, unsubscribe, oneClick };
}
