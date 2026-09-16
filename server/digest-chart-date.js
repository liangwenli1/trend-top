export function parseChartEnd(value, now = new Date()) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid chart end date');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > now.toISOString().slice(0, 10)) throw new Error('Invalid chart end date');
  return date;
}
