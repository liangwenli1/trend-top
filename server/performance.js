import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();
const samples = [];
const MAX_SAMPLES = 2000;
const routeKey = req => `${req.method} ${req.route?.path || req.path.replace(/\b\d+\b/g, ':id')}`;
const percentile = (values, pct) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * pct))] * 10) / 10;
};

export function performanceMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  const context = { started: performance.now(), dbMs: 0, dbQueries: 0 };
  storage.run(context, () => {
    res.on('finish', () => {
      const durationMs = performance.now() - context.started;
      const contentLength = Number(res.getHeader('content-length')) || 0;
      samples.push({ route: routeKey(req), status: res.statusCode, durationMs, dbMs: context.dbMs, dbQueries: context.dbQueries, responseBytes: contentLength, at: Date.now() });
      if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
      if (process.env.PERF_LOG === '1') console.log(JSON.stringify({ kind: 'api-performance', route: routeKey(req), status: res.statusCode, durationMs: Math.round(durationMs), dbMs: Math.round(context.dbMs), dbQueries: context.dbQueries, responseBytes: contentLength }));
    });
    next();
  });
}

export async function trackDatabaseCall(callback) {
  const context = storage.getStore();
  const started = performance.now();
  try { return await callback(); }
  finally { if (context) { context.dbMs += performance.now() - started; context.dbQueries++; } }
}

export function performanceSummary() {
  const groups = new Map();
  for (const sample of samples) { const group = groups.get(sample.route) || []; group.push(sample); groups.set(sample.route, group); }
  return [...groups].map(([route, rows]) => ({
    route,
    requests: rows.length,
    p50Ms: percentile(rows.map(row => row.durationMs), .5),
    p95Ms: percentile(rows.map(row => row.durationMs), .95),
    dbP50Ms: percentile(rows.map(row => row.dbMs), .5),
    dbP95Ms: percentile(rows.map(row => row.dbMs), .95),
    averageResponseBytes: Math.round(rows.reduce((sum, row) => sum + row.responseBytes, 0) / rows.length),
    errorRate: Math.round(rows.filter(row => row.status >= 500).length / rows.length * 1000) / 10
  })).sort((a, b) => b.p95Ms - a.p95Ms);
}
