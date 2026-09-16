import { asJson } from './db.js';
import { TYPES, TYPE_META, ASSET_BOARDS, getCatalogRankings } from './catalog.js';
import { boards as REPO_BOARDS, getRankings } from './rankings.js';

const root = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const title = (board, type, locale) => type === 'github-repo'
  ? REPO_BOARDS[board]?.[locale] || board
  : ASSET_BOARDS[board]?.[locale] || board;
const itemUrl = (item, type, locale) => item.url || `${root}/${locale}/${type}/${encodeURIComponent(item.slug || item.id)}`;
const itemKey = item => String(item.full_name || item.id);
const chartUrl = (item, type) => `${root}/api/digest-chart/${encodeURIComponent(type)}/${encodeURIComponent(item.id)}.png?days=30`;
const logoUrl = `${root}/email-logo.png`;

// Rank movement versus the last sent digest: 'new' entered the list, n>0 moved up, n<0 moved down, 0 unchanged, null = no history.
function rankChange(item, previousKeys) {
  if (!Array.isArray(previousKeys)) return null;
  const index = previousKeys.indexOf(itemKey(item));
  if (index === -1) return 'new';
  return index + 1 - item.rank;
}
function changeHtml(change, zh) {
  if (change == null) return '';
  if (change === 'new') return `<span style="display:inline-block;margin-left:6px;padding:1px 5px;background:#111;color:#fff;font-size:10px;font-weight:700;letter-spacing:.5px;vertical-align:middle">${zh ? '新上榜' : 'NEW'}</span>`;
  if (change > 0) return `<span style="margin-left:6px;color:#315fd9;font-size:12px;font-weight:700">&#9650;${change}</span>`;
  if (change < 0) return `<span style="margin-left:6px;color:#a53e3e;font-size:12px;font-weight:700">&#9660;${-change}</span>`;
  return `<span style="margin-left:6px;color:#9a9a9a;font-size:12px">&#8212;</span>`;
}
function changeText(change, zh) {
  if (change == null) return '';
  if (change === 'new') return zh ? ' · 新上榜' : ' · new';
  if (change > 0) return ` · ▲${change}`;
  if (change < 0) return ` · ▼${-change}`;
  return '';
}

function chart(items, num, zh) {
  const max = Math.max(1, ...items.map(item => Number(item.gain ?? item.stars) || 0));
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0">' +
    items.map(item => {
      const value = Math.max(0, Number(item.gain ?? item.stars) || 0);
      const width = Math.max(3, Math.round(value / max * 100));
      const label = item.gain == null ? num.format(item.stars || 0) + ' ★' : '+' + num.format(item.gain) + ' ★';
      return `<tr><td style="width:42%;padding:7px 8px 7px 0;font-size:13px"><a href="${escape(item.url)}" style="color:#171717">${escape(item.full_name)}</a>${changeHtml(item.change, zh)}</td><td style="width:38%;padding:7px 8px"><div style="height:8px;background:#e9edf8"><div style="height:8px;width:${width}%;background:#315fd9"></div></div></td><td style="width:20%;padding:7px 0 7px 8px;text-align:right;white-space:nowrap;font-size:13px;font-weight:700">${escape(label)}</td></tr>`;
    }).join('') + '</table>';
}

export async function buildDigest(sub, manageToken, { previous = null } = {}) {
  const locale = sub.locale === 'zh' ? 'zh' : 'en';
  const zh = locale === 'zh';
  const num = new Intl.NumberFormat(zh ? 'zh-CN' : 'en-US');
  const savedTypes = asJson(sub.types, ['github-repo']);
  const types = [...new Set(Array.isArray(savedTypes) ? savedTypes : ['github-repo'])].filter(type => TYPES.includes(type));
  const boards = asJson(sub.boards, ['hot']);
  const topics = asJson(sub.topics, sub.topic ? [sub.topic] : []);
  const languages = asJson(sub.languages, sub.language ? [sub.language] : []);
  const queryBase = { period: 'day', language: languages.join(','), languages, topic: topics.join(','), topics, limit: 10 };
  const sections = [];
  const snapshot = {};
  for (const type of types.length ? types : ['github-repo']) {
    let first = true;
    for (const board of boards) {
      if (type === 'github-repo' ? !REPO_BOARDS[board] : !ASSET_BOARDS[board]) continue;
      const ranking = type === 'github-repo'
        ? await getRankings({ ...queryBase, board })
        : await getCatalogRankings(type, { ...queryBase, board });
      if (!ranking.updatedAt || !ranking.items?.length) continue;
      const key = `${type}:${board}`;
      const previousKeys = previous && Array.isArray(previous[key]) ? previous[key] : null;
      snapshot[key] = ranking.items.map(itemKey);
      const items = ranking.items.slice(0, first ? 5 : 2).map(item => ({ ...item, url: itemUrl(item, type, locale), change: rankChange(item, previousKeys) }));
      const leader = first ? items.find(item => item.gain != null && !item.anomaly) : null;
      sections.push({
        type, board, chart: first, updatedAt: ranking.updatedAt,
        typeName: TYPE_META[type]?.[locale] || type,
        name: title(board, type, locale),
        items,
        trend: leader ? { name: leader.full_name, url: leader.url, image: chartUrl(leader, type) } : null
      });
      first = false;
    }
  }
  const account = `${root}/${locale}/account/delivery`;
  const unsubscribe = `${account}?intent=stop`;
  const oneClick = `${root}/api/one-click?token=${encodeURIComponent(manageToken)}`;
  const boardLink = section => `${root}/${locale}/${section.type}/ranking?${new URLSearchParams({ board: section.board, period: 'day', language: languages.join(','), topic: topics.join(',') })}`;
  const localTime = at => new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', { timeZone: sub.timezone, dateStyle: 'medium' }).format(new Date(at));
  const subject = zh ? 'Trend Top 每日摘要' : 'Trend Top daily digest';
  const intro = zh ? '你关注的开源项目，每日一封。' : 'The open-source projects you follow, once a day.';
  const text = [
    intro, '',
    ...sections.flatMap(section => [
      section.typeName + ' · ' + section.name + ' · ' + localTime(section.updatedAt),
      ...section.items.map(item => '#' + item.rank + ' ' + item.full_name + ' · ' + (item.gain == null ? (zh ? '新增数据不足' : 'Growth unavailable') : '+' + num.format(item.gain) + ' ★') + changeText(item.change, zh) + ' · ' + item.url),
      boardLink(section), ''
    ]),
    zh ? '管理邮件推送：' : 'Manage email delivery:', account,
    zh ? '停止邮件推送：' : 'Stop emails:', unsubscribe
  ].join('\n');
  const htmlSections = sections.map(section => {
    const rows = section.items.map(item => `<p style="margin:8px 0;font-size:14px"><strong>#${item.rank}</strong> <a href="${escape(item.url)}" style="color:#171717">${escape(item.full_name)}</a>${changeHtml(item.change, zh)} <span style="color:#606060">${item.gain == null ? (zh ? '新增数据不足' : 'Growth unavailable') : '+' + num.format(item.gain) + ' ★'}</span></p>`).join('');
    const trend = section.trend
      ? `<p style="margin:14px 0 4px;color:#666;font-size:12px">${zh ? '近 30 天新增 Star · ' : 'New stars, last 30 days · '}<a href="${escape(section.trend.url)}" style="color:#171717;font-weight:700">${escape(section.trend.name)}</a></p><a href="${escape(section.trend.url)}" style="display:block"><img src="${escape(section.trend.image)}" width="544" height="163" alt="${escape(section.trend.name)} ${zh ? '30 天新增 Star 走势' : '30-day new star trend'}" style="display:block;width:100%;max-width:544px;height:auto;border:1px solid #e5e5e5"></a>`
      : '';
    return `<section style="border-top:1px solid #dedede;padding:22px 0"><p style="margin:0 0 5px;color:#315fd9;font-size:12px;font-weight:700;letter-spacing:1px">${escape(section.typeName)}</p><h2 style="margin:0;font-size:20px">${escape(section.name)}</h2><p style="margin:5px 0 12px;color:#666;font-size:12px">${escape(localTime(section.updatedAt))} · ${escape(sub.timezone)}${(process.env.DATA_MODE || 'demo') === 'demo' ? ' · DEMO DATA' : ''}</p>${section.chart ? chart(section.items, num, zh) : rows}${trend}<a href="${escape(boardLink(section))}" style="display:inline-block;margin-top:8px;color:#315fd9;font-weight:700">${zh ? '查看完整榜单' : 'View full ranking'} →</a></section>`;
  }).join('');
  const html = `<div style="background:#f5f5f3;padding:16px"><main style="max-width:600px;margin:auto;padding:28px;background:#fff;color:#171717;font:15px/1.6 Arial,sans-serif"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:0 12px 0 0;vertical-align:middle"><a href="${escape(root)}/${locale}/home" style="display:block"><img src="${escape(logoUrl)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px"></a></td><td style="vertical-align:middle"><h1 style="margin:0;font-size:28px;line-height:1.1"><a href="${escape(root)}/${locale}/home" style="color:#171717;text-decoration:none">Trend Top</a></h1></td></tr></table><p>${escape(intro)}</p>${htmlSections}<footer style="border-top:1px solid #dedede;padding-top:20px;font-size:13px"><a href="${escape(account)}">${zh ? '管理邮件推送' : 'Manage email delivery'}</a> · <a href="${escape(unsubscribe)}">${zh ? '停止邮件推送' : 'Stop emails'}</a></footer></main></div>`;
  return { subject, text, html, sections, snapshot, unsubscribe, oneClick };
}
