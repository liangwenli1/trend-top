import { emailBrandHeader } from './email-brand.js';
import { TYPES, TYPE_META } from './catalog.js';
import { renderGrowthChart } from './digest-growth.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&', '<':'<', '>':'>', '"':'"', "'":'&#39;' }[char]));
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
    ? `<figure style="margin:18px 0 0"><figcaption style="color:#666;font-size:12px">${leader.metricScope==='associated-repository' ? (zh ? '关联仓库 · ' : 'Associated repository · ') : ''}${zh ? '累计新增 Star · 30 天（邮件中为静态图）' : 'Cumulative new Stars · 30 days (static image in email)'}</figcaption><img src="${escape(chart.image)}" alt="${escape(leader.full_name)} · ${zh ? '30 天累计新增 Star 图表' : '30-day cumulative new Stars chart'}" width="544" style="display:block;width:100%;height:auto;margin-top:8px;border:1px solid #e5e5e5"></figure>`
    : '';
  const associated = labeled.some(item => item.metricScope === 'associated-repository');
  const note = associated
    ? (zh ? '公开目录示例；增量来自关联仓库。实际邮件按你选择的类型生成。' : 'Public catalog sample. Gains come from the associated repository. Your email follows the collections you choose.')
    : (zh ? '公开目录示例，实际邮件按你选择的类型生成。' : 'Public catalog sample. Your email follows the collections you choose.');
  return `<section style="border-top:1px solid #dedede;padding:22px 0"><p style="margin:0 0 5px;color:#315fd9;font-size:12px;font-weight:700;letter-spacing:1px">${escape(TYPE_META[type]?.[locale] || type)}</p><h2 style="margin:0;font-size:20px">${zh ? '近 7 天热门' : '7-day Hot'}</h2><p style="margin:5px 0 12px;color:#666;font-size:12px">${note}</p>${renderGrowthChart(labeled, num, zh)}${chartHtml}<a href="${escape(`/${locale}/${type}/ranking`)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;color:#315fd9;font-weight:700">${zh ? '查看完整榜单' : 'View full ranking'} →</a></section>`;
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
  const rows = TYPES.filter(type => grouped.has(type)).map(type => typeSection(grouped.get(type).slice(0, 3), discovery, locale, zh, num)).join('');
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f5f3;padding:16px"><main style="max-width:600px;margin:auto;padding:28px;background:#fff;color:#171717;font:15px/1.6 Arial,sans-serif">${emailBrandHeader('', locale)}<p style="text-align:center;color:#315fd9;font-size:12px;font-weight:700">${zh ? '示例邮件 · 公开目录内容' : 'SAMPLE EMAIL · PUBLIC CATALOG'}${discovery.source === 'demo' ? ' · DEMO DATA' : ''}</p><h1 style="font-size:24px;text-align:center">${zh ? '值得关注的开源变化' : 'Open-source changes worth a look'}</h1><p>${zh ? '这是格式预览：按类型列出近期热门，并用条形图对比增量。折线图是邮件里的静态图片，不能点击。实际每日摘要会按你的偏好生成。' : 'This is a format preview: recent Hot items by collection, with bar comparisons. The line chart is a static image, as in email — it is not interactive. Your daily digest follows your preferences.'}</p>${rows || `<p>${zh ? '当前没有可预览的内容。' : 'No preview content is available.'}</p>`}<footer style="border-top:1px solid #dedede;padding-top:16px;color:#666;font-size:12px;text-align:center">${zh ? '每天最多一封 · 邮件启停可在 Settings 中管理' : 'At most one email a day · Manage email delivery in Settings'}</footer></main></body></html>`;
}