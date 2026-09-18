import { productKey } from './product-resources.js';

// Round-robin preserves the order within each board without inventing a cross-type ranking.
export function selectHomeItems(collections, limit = 6) {
  const seen = new Set(), selected = [];
  const length = Math.max(0, ...collections.map(collection => collection.items.length));
  for (let index = 0; index < length && selected.length < limit; index++) {
    for (const collection of collections) {
      const item = collection.items[index];
      if (!item || !String(item.description || '').trim()) continue;
      const key = productKey({ ...item, type: collection.type });
      if (seen.has(key)) continue;
      seen.add(key);
      const associated = collection.type === 'github-repo' || key.startsWith('repo:');
      const gain = item.gain != null && Number.isFinite(Number(item.gain)) && !item.anomaly && associated ? Number(item.gain) : null;
      selected.push({
        id: String(item.id), slug: String(item.slug || item.id), type: collection.type,
        name: item.name || item.full_name, full_name: item.skillRepository || item.full_name,
        description: String(item.description).slice(0, 800), productFamily: key,
        useCase: item.useCase || null, useCaseLabel: item.useCaseLabel || null,
        officialEvidence: item.officialEvidence || null,
        gain, growthBasis: collection.growthBasis || 'snapshot_net',
        metricScope: collection.type === 'github-repo' ? 'repository' : associated ? 'associated-repository' : 'none',
        board: collection.board, updatedAt: collection.updatedAt || null,
        windowStart: collection.windowStart || null, stale: Boolean(collection.stale),
        selection: collection.board === 'hot' ? 'type-hot' : 'catalog',
        sourceUrl: associated && key.startsWith('repo:') ? `https://github.com/${key.slice(5)}` : item.url
      });
      if (selected.length === limit) break;
    }
  }
  return selected;
}
