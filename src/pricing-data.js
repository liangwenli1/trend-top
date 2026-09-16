// Public plans only: locale-separated, bounded caching and shared in-flight requests.
export function createPricingCache({ fetcher = (...args) => fetch(...args), now = () => Date.now(), ttl = 120_000 } = {}) {
  const entries = new Map();
  const pending = new Map();
  let generation = 0;
  const get = locale => {
    const entry = entries.get(locale);
    return entry && now() - entry.at < ttl ? entry.data : null;
  };
  const load = locale => {
    const cached = get(locale);
    if (cached) return Promise.resolve(cached);
    if (pending.has(locale)) return pending.get(locale);
    const version = generation;
    const task = Promise.resolve().then(async () => {
      const response = await fetcher(`/api/billing/plans?locale=${encodeURIComponent(locale)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load plans');
      if (!Array.isArray(data.plans)) throw new Error('Invalid plans response');
      if (version === generation) entries.set(locale, { data, at: now() });
      return data;
    }).finally(() => { if (pending.get(locale) === task) pending.delete(locale); });
    pending.set(locale, task);
    return task;
  };
  const clear = () => { generation++; entries.clear(); pending.clear(); };
  return { get, load, clear };
}

export const pricingCache = createPricingCache();
