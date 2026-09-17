// Repository counters cannot distinguish the popularity of individual Skill files.
// Group only exact parent repositories, never every project by the same organization.
export function skillRepositoryKey(item) {
  if (item.type !== 'skill' || !item.rankingSignals?.resourcePath) return null;
  try {
    const url = new URL(item.sourceRepoUrl || item.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.toLowerCase() !== 'github.com' || parts.length < 2) return null;
    return parts.slice(0, 2).join('/').replace(/\.git$/i, '').toLowerCase();
  } catch { return null; }
}

export function groupSkillRankings(items) {
  const groups = new Map();
  const ordered=[...items].sort((a,b)=>String(a.rankingSignals?.resourcePath || a.id).localeCompare(String(b.rankingSignals?.resourcePath || b.id)) || String(a.id).localeCompare(String(b.id)));
  for (const item of ordered) {
    const repo = skillRepositoryKey(item);
    const key = repo ? `repo:${repo}` : `item:${item.id}`;
    if (!groups.has(key)) groups.set(key, repo ? { ...item, skillRepository: repo, skillResources: [] } : item);
    if (!repo) continue;
    const group = groups.get(key);
    if (!group.skillResources.some(resource => String(resource.id) === String(item.id))) {
      group.skillResources.push({ id: item.id, slug: item.slug, name: item.name,
        path: item.rankingSignals.resourcePath, url: item.url });
    }
  }
  return [...groups.values()].map(group => group.skillResources ? {
    ...group, skillCount: new Set(group.skillResources.map(resource => String(resource.name).trim().toLowerCase())).size
  } : group);
}
