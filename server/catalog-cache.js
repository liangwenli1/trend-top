// Applied only to explicitly public JSON routes. Private account/billing routes never use it.
export function createPublicJsonCache({ ttl = 60000, maxEntries = 128, maxBytes = 8 * 1024 * 1024, maxEntryBytes = 512 * 1024, now = Date.now } = {}) {
  const entries = new Map(), pending = new Map();
  let bytes = 0, generation = 0, hits = 0, misses = 0, coalesced = 0;
  const remove = key => { const entry = entries.get(key); if (entry) bytes -= entry.bytes; entries.delete(key); };
  const store = (key, body, version) => {
    const size = Buffer.byteLength(body);
    if (generation !== version || size > maxEntryBytes || size > maxBytes) return;
    for (const [entryKey, entry] of entries) if (entry.expires <= now()) remove(entryKey);
    remove(key);
    while (entries.size >= maxEntries || bytes + size > maxBytes) remove(entries.keys().next().value);
    entries.set(key, { body, bytes: size, expires: now() + ttl }); bytes += size;
  };
  const serve = (res, body, state) => res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300').set('X-Catalog-Cache', state).type('application/json').send(body);
  return {
    clear() { generation++; entries.clear(); bytes = 0; pending.clear(); },
    summary: () => ({ entries: entries.size, bytes, inFlight: pending.size, hits, misses, coalesced, ttlMs: ttl }),
    async middleware(req, res, next) {
      if (req.method !== 'GET') return next();
      const key = req.originalUrl || req.url;
      const cached = entries.get(key);
      if (cached && cached.expires > now()) { hits++; return serve(res, cached.body, 'HIT'); }
      if (cached) remove(key);
      const version = generation;
      if (pending.has(key)) {
        coalesced++;
        const body = await pending.get(key);
        if (body !== null && generation === version && !res.destroyed) return serve(res, body, 'COALESCED');
        if (res.destroyed) return;
      }
      if (pending.size >= maxEntries) return next();
      misses++;
      let release, finished = false;
      const task = new Promise(resolve => { release = resolve; });
      pending.set(key, task);
      const finish = body => {
        if (finished) return;
        finished = true;
        if (pending.get(key) === task) pending.delete(key);
        release(body);
      };
      const json = res.json.bind(res);
      res.set('X-Catalog-Cache', 'MISS');
      res.json = body => {
        res.json = json;
        if (res.statusCode === 200 && !res.getHeader('set-cookie')) {
          res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
          try {
            const serialized = JSON.stringify(body);
            if (typeof serialized === 'string' && Buffer.byteLength(serialized) <= maxEntryBytes) {
              store(key, serialized, version);
              finish(serialized);
            } else finish(null);
          } catch { finish(null); }
        } else { res.set('Cache-Control', 'no-store'); finish(null); }
        return json(body);
      };
      res.once('finish', () => finish(null));
      res.once('close', () => finish(null));
      next();
    }
  };
}

export const publicResponseCache = createPublicJsonCache();
