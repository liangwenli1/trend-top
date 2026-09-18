import React from 'react';
const fmt = (value, l) => new Intl.NumberFormat(l === 'zh' ? 'zh-CN' : 'en-US').format(value);

export function HomeGrowthChart({ chart, l, loading, error }) {
  const zh = l === 'zh';
  const growthLabel = chart?.growthBasis === 'star_created'
    ? (zh ? '累计新增 Star · 近 7 天' : 'Cumulative new Stars · 7 days')
    : (zh ? '累计 Star 净增 · 近 7 天' : 'Cumulative net Star gain · 7 days');
  const points = chart?.points || [];
  const ready = !chart?.insufficient && points.length > 1 && points.every(point => Number.isFinite(point.gain));
  if (!ready) return <div className="home-chart-state" role="status">{loading ? (zh ? '正在读取增长数据…' : 'Loading growth data…') : error ? (zh ? '暂时无法读取增长数据。' : 'Growth data is temporarily unavailable.') : (zh ? '历史数据积累后会显示增长曲线。' : 'The growth curve appears when enough history is available.')}</div>;

  const max = Math.max(1, ...points.map(point => point.gain));
  const min = Math.min(0, ...points.map(point => point.gain));
  const range = max - min;
  const baseline = 205 - (0 - min) / range * 170;
  const coordinates = points.map((point, index) => ({
    x: 18 + index * 604 / (points.length - 1),
    y: 205 - (point.gain - min) / range * 170
  }));
  const line = coordinates.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L622 ${baseline.toFixed(1)} L18 ${baseline.toFixed(1)} Z`;
  const last = coordinates[coordinates.length - 1];
  const finalGain = points.at(-1).gain;
  return <figure className="home-growth-figure">
    <figcaption className="home-growth-value"><strong>{finalGain > 0 ? '+' : ''}{fmt(finalGain, l)}</strong><span>{growthLabel}</span></figcaption>
    <div className="home-growth-plot">
      <div className="home-growth-scale" aria-hidden="true"><span>{fmt(max, l)}</span><span>{fmt(min, l)}</span></div>
      <svg viewBox="0 0 640 230" preserveAspectRatio="none" aria-hidden="true">
        <path className="home-growth-grid" d="M18 35 H622 M18 120 H622 M18 205 H622" />
        <path className="home-growth-area" d={area} />
        <path className="home-growth-line" d={line} pathLength="1" />
        <circle className="home-growth-endpoint" cx={last.x} cy={last.y} r="5" />
      </svg>
    </div>
    <div className="home-growth-dates"><span>{points[0].date.slice(5)}</span><span>{points.at(-1).date.slice(5)}</span></div>
    <table className="sr-only"><caption>{growthLabel}</caption><thead><tr><th>{zh ? '日期' : 'Date'}</th><th>{zh ? 'Star 变化' : 'Star change'}</th></tr></thead><tbody>{points.map(point => <tr key={point.date}><td>{point.date}</td><td>{fmt(point.gain, l)}</td></tr>)}</tbody></table>
  </figure>;
}
