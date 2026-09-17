// Public chart samples must distinguish missing values from a measured zero.
export function knownCount(value) {
  if (value == null || (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export function elapsedDays(value, endpoint) {
  if (!value) return null;
  const time = new Date(value).getTime();
  const end = new Date(endpoint).getTime();
  return Number.isFinite(time) && Number.isFinite(end) ? Math.max(0, (end - time) / 86400000) : null;
}
export function scatterSamples(items) {
  return items.flatMap(item => {
    const stars = knownCount(item.stars), forks = knownCount(item.forks);
    return stars === null || forks === null ? [] : [{...item, stars, forks}];
  });
}
export function starTiles(items) {
  return items.flatMap(item => {
    const stars = knownCount(item.stars);
    return stars === null || stars === 0 ? [] : [{name:item.full_name,size:stars,value:stars,url:item.url}];
  }).sort((a,b) => b.value - a.value).slice(0,12);
}
export function dayBuckets(items, field, boundaries, labels, unknownLabel) {
  const counts = Array(boundaries.length + 2).fill(0);
  for (const item of items) {
    const days = knownCount(item[field]);
    const index = days === null ? counts.length - 1 : boundaries.findIndex(limit => days <= limit);
    counts[index < 0 ? boundaries.length : index]++;
  }
  return [...labels,unknownLabel].map((name,index) => ({name,count:counts[index]})).filter((row,index) => index < labels.length || row.count > 0);
}
