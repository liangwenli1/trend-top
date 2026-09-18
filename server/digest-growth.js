const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&'+'amp;', '<':'&'+'lt;', '>':'&'+'gt;', '"':'&'+'quot;', "'":'&#39;' }[char]));

export function validGrowth(item) {
  return !item.anomaly && typeof item.gain === 'number' && Number.isFinite(item.gain);
}

export function growthLabel(item, num, zh) {
  if (item.anomaly) return zh ? '增量待核实' : 'Growth under review';
  if (!validGrowth(item)) return zh ? '新增数据不足' : 'Growth unavailable';
  return `${item.gain >= 0 ? '+' : ''}${num.format(item.gain)} ★`;
}

// Name and value on one row, bar below — readable on phone without three squeezed columns.
export function renderGrowthChart(items, num, zh, changeHtml = () => '') {
  const max = Math.max(1, ...items.filter(validGrowth).map(item => Math.abs(item.gain)));
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0 6px">' + items.map(item => {
    const name = `<a href="${escape(item.url)}" style="color:#171717">${escape(item.full_name)}</a>${changeHtml(item.change, zh)}`;
    if (!validGrowth(item)) {
      return `<tr><td style="padding:11px 0 12px;border-bottom:1px solid #eee"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:14px;line-height:1.4;padding:0 12px 0 0">${name}</td><td align="right" style="font-size:12px;color:#666;white-space:nowrap">${growthLabel(item, num, zh)}</td></tr></table></td></tr>`;
    }
    const width = Math.round(Math.abs(item.gain) / max * 100);
    const color = item.gain < 0 ? '#a53e3e' : '#315fd9';
    return `<tr><td style="padding:11px 0 12px;border-bottom:1px solid #eee"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:14px;line-height:1.4;padding:0 12px 0 0">${name}</td><td align="right" style="font-size:14px;font-weight:700;white-space:nowrap">${growthLabel(item, num, zh)}</td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:7px;border-collapse:collapse"><tr><td width="${width}%" style="width:${width}%;height:10px;background:${color};font-size:0;line-height:0">&nbsp;</td><td style="height:10px;background:#e9edf8;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>`;
  }).join('') + '</table>';
}