const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function validGrowth(item) {
  return !item.anomaly && typeof item.gain === 'number' && Number.isFinite(item.gain);
}

export function growthLabel(item, num, zh) {
  if (item.anomaly) return zh ? '增量待核实' : 'Growth under review';
  if (!validGrowth(item)) return zh ? '新增数据不足' : 'Growth unavailable';
  return `${item.gain >= 0 ? '+' : ''}${num.format(item.gain)} ★`;
}

// One axis: daily star growth. Total stars and usage never substitute for missing growth.
export function renderGrowthChart(items, num, zh, changeHtml = () => '') {
  const max = Math.max(1, ...items.filter(validGrowth).map(item => Math.abs(item.gain)));
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0">' + items.map(item => {
    const name = `<td style="width:42%;padding:7px 8px 7px 0;font-size:13px"><a href="${escape(item.url)}" style="color:#171717">${escape(item.full_name)}</a>${changeHtml(item.change, zh)}</td>`;
    if (!validGrowth(item)) return `<tr>${name}<td colspan="2" style="padding:7px 0 7px 8px;text-align:right;color:#666;font-size:12px">${growthLabel(item, num, zh)}</td></tr>`;
    const width = Math.round(Math.abs(item.gain) / max * 100);
    const color = item.gain < 0 ? '#a53e3e' : '#315fd9';
    return `<tr>${name}<td style="width:38%;padding:7px 8px"><div style="height:8px;background:#e9edf8"><div style="height:8px;width:${width}%;background:${color}"></div></div></td><td style="width:20%;padding:7px 0 7px 8px;text-align:right;white-space:nowrap;font-size:13px;font-weight:700">${growthLabel(item, num, zh)}</td></tr>`;
  }).join('') + '</table>';
}
