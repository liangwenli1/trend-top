import { emailBrandHeader, wrapEmailHtml } from './email-brand.js';
import { TYPES, TYPE_META } from './catalog.js';
import { renderGrowthChart } from './digest-growth.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&'+'amp;', '<':'&'+'lt;', '>':'&'+'gt;', '"':'&'+'quot;', "'":'&#39;' }[char]));
const publicPath = (locale, item) => `/${locale}/${item.type}/${encodeURIComponent(item.slug || item.id)}`;

function chartFor(discovery, item) {
  return discovery.previewCharts?.find(chart => chart.type === item.type && chart.id === item.id && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(chart.image));
}

function typeSection(items, discovery, locale, zh, num) {
  const type = items[0].type;
  const labeled = items.map((item, index) => ({ ...item, rank: index + 1, url: publicPath(locale, item) }));
  const leader = labeled.find(item => chartFor(discovery, item));
  const chart = leader ? chartFor(discovery, leader) : null;
  const chartHtml = chart
    ? `<p style="margin:16px 0 6px;color:#666;font-size:12px">${leader.metricScope==='associated-repository' ? (zh ? '关联仓库 · ' : 'Associated repository · ') : ''}${zh ? '累计新增 Star · 30 天' : 'Cumulative new Stars · 30 days'} · <strong>${escape(leader.full_name)}</strong></p><img src="${escape(chart.image)}" alt="${escape(leader.full_name)} · ${zh ? '30 天累计新增 Star 图表' : '30-day cumulative new Stars chart'}" width="552" style="display:block;width:100%;max-width:100%;height:auto;border:1px solid #e5e5e5">`
    : '';
  const associated = labeled.some(item => item.metricScope === 'associated-repository');
  const note = associated
    ? (zh ? '公开目录示例；增量来自关联仓库。实际邮件按你选择的类型生成。' : 'Public catalog sample. Gains come from the associated repository. Your email follows the collections you choose.')
    : (zh ? '公开目录示例，实际邮件按你选择的类型生成。' : 'Public catalog sample. Your email follows the collections you choose.');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="border-top:1px solid #dedede;padding:22px 0 8px"><p style="margin:0 0 5px;color:#315fd9;font-size:12px;font-weight:700;letter-spacing:1px">${escape(TYPE_META[type]?.[locale] || type)}</p><h2 class="email-h2" style="margin:0;font-size:20px">${zh ? '近 7 天热门' : '7-day Hot'}</h2><p style="margin:5px 0 12px;color:#666;font-size:12px">${note}</p>${renderGrowthChart(labeled, num, zh)}${chartHtml}<a href="${escape(`/${locale}/${type}/ranking`)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:10px;color:#315fd9;font-weight:700">${zh ? '查看完整榜单' : 'View full ranking'} →</a></td></tr></table>`;
}

// Only accepts the public homepage projection, never subscriptions, outbox, or digest snapshots.
export function renderPublicDigestPreview(discovery, locale = 'en') {
  locale = locale === 'zh' ? 'zh' : 'en';
  const zh = locale === 'zh', num = new Intl.NumberFormat(zh ? 'zh-CN' : 'en-US');
  const grouped = new Map();
  for (const item of discovery.items || []) {
    const list = grouped.get(item.type) || [];
    list.push(item);
    grouped.set(item.type, list);
  }
  const boards = discovery.previewBoards && typeof discovery.previewBoards === 'object' ? discovery.previewBoards : {};
  const rows = TYPES.filter(type => (boards[type]?.length || grouped.get(type)?.length)).map(type => typeSection((boards[type]?.length ? boards[type] : grouped.get(type)).slice(0, 5), discovery, locale, zh, num)).join('');
  const body = `${emailBrandHeader('', locale)}<p style="text-align:center;color:#315fd9;font-size:12px;font-weight:700">${zh ? '示例邮件 · 公开目录内容' : 'SAMPLE EMAIL · PUBLIC CATALOG'}${discovery.source === 'demo' ? ' · DEMO DATA' : ''}</p><h1 class="email-h1" style="font-size:24px;text-align:center">${zh ? '值得关注的开源变化' : 'Open-source changes worth a look'}</h1><p>${zh ? '这是格式预览，采用公开的近 7 天数据；实际每日摘要会按你的偏好生成。' : 'A format preview using public seven-day data. Your daily digest follows your preferences.'}</p>${rows || `<p>${zh ? '当前没有可预览的内容。' : 'No preview content is available.'}</p>`}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #dedede;padding-top:16px;color:#666;font-size:12px;text-align:center">${zh ? '每天最多一封 · 邮件启停可在 Settings 中管理' : 'At most one email a day · Manage email delivery in Settings'}</td></tr></table>`;
  return wrapEmailHtml(body, { locale });
}