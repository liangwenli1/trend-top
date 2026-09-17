export function comparableUsage(signals) {
  let unknown=null;
  for (const [directory, metrics] of Object.entries(signals?.directoryMetrics || {}).sort(([a], [b]) => a.localeCompare(b))) {
    for (const kind of ['installs', 'usage', 'downloads']) {
      const metric = metrics[kind];
      if (!metric || typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0) continue;
      const comparable = metric.period && metric.period !== 'unknown' && metric.scope && metric.scope !== 'unknown';
      const result={ value: metric.value, kind, directory, period: metric.period || 'unknown', scope: metric.scope || 'unknown',
        cohort: comparable ? JSON.stringify([directory, kind, metric.scope, metric.period]) : null };
      if(comparable)return result;
      unknown ??= result;
    }
  }
  return unknown;
}
export function usagePercentile(item, items) {
  if (!item.usageMetric?.cohort || !(item.usage > 0)) return null;
  const peers = items.filter(peer => peer.usageMetric?.cohort === item.usageMetric.cohort && peer.usage > 0);
  // One observation does not establish a percentile or a calibrated popularity score.
  if (peers.length < 2) return null;
  return Math.round((peers.filter(peer => peer.usage < item.usage).length / (peers.length - 1)) * 100);
}
