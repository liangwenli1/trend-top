export function productKey(item) {
  if (/^(?:repo|site|item):/.test(String(item.productFamily || ''))) return item.productFamily;
  const source = item.sourceRepoUrl || item.source_repo_url || (item.type === 'github-repo' ? item.url : '');
  try {
    const url = new URL(source || item.url);
    if (url.hostname.toLowerCase() === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return `repo:${parts.slice(0, 2).join('/').replace(/\.git$/, '').toLowerCase()}`;
    }
    return `site:${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`;
  } catch { return `item:${item.type}:${item.id}`; }
}

export function groupProductResources(items) {
  const groups = new Map();
  for (const item of items) {
    const key = productKey(item);
    if (!groups.has(key)) groups.set(key, { ...item, productKey: key, resources: [] });
    const group = groups.get(key);
    if(item.type==='github-repo' && group.type!=='github-repo')Object.assign(group,{...item,productKey:key,resources:group.resources});
    if (!group.resources.some(resource => resource.type === item.type && String(resource.id) === String(item.id))) {
      group.resources.push({ type: item.type, id: item.id, slug: item.slug, full_name: item.full_name, url: item.url });
    }
  }
  return [...groups.values()];
}
