// Review status is an operator record, not a statement of permission to redistribute.
// Firecrawl is an extraction provider; the underlying page remains the data source.
export const DATA_SOURCES = [
  { id: 'github', name: 'GitHub', url: 'https://github.com', method: 'rest-api', frequencyHours: 24, trust: 'platform', topics: [], metrics: ['stars', 'forks', 'star-growth'], scope: 'repository', retained: 'Repository metadata and dated counters; no complete source-code mirror', policyUrl: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service', reviewStatus: 'pending' },
  { id: '21st-dev', name: '21st.dev', url: 'https://21st.dev', method: 'page-metadata', frequencyHours: 24, trust: 'curated', topics: ['components', 'design-system'], metrics: [], scope: 'website', retained: 'Website title, description, icon and links; no component code redistribution', policyUrl: null, reviewStatus: 'pending' },
  { id: 'skills-sh', name: 'Skills.sh', url: 'https://skills.sh', method: 'page-metadata-and-listing', frequencyHours: 24, trust: 'curated', topics: ['skills', 'directory'], metrics: ['installs'], scope: 'individual-skill', retained: 'Named Skill identity and explicitly displayed counts with their source and window', policyUrl: 'https://www.skills.sh/terms', reviewStatus: 'pending' },
  { id: 'smithery', name: 'Smithery', url: 'https://smithery.ai', method: 'page-metadata', frequencyHours: 24, trust: 'curated', topics: ['mcp', 'directory'], metrics: [], scope: 'website', retained: 'Website metadata; no inferred server usage or hosted connection credentials', policyUrl: null, reviewStatus: 'pending' },
  { id: 'glama', name: 'Glama', url: 'https://glama.ai/mcp/servers', method: 'page-metadata-and-listing', frequencyHours: 24, trust: 'curated', topics: ['mcp', 'directory'], metrics: ['usage', 'downloads'], scope: 'listed-resource', retained: 'Listed server identity and explicitly displayed counts; quality scores are not usage', policyUrl: 'https://glama.ai/policies/terms-of-service', reviewStatus: 'restricted', collectionDisabled: true, restriction: 'Competitive API data reuse and scraping around API access require separate authorization; no permitted adapter is configured.' },
  { id: 'agent-skills', name: 'Agent Skills', url: 'https://agentskills.io', method: 'page-metadata', frequencyHours: 24, trust: 'official', topics: ['skills', 'specification'], metrics: [], scope: 'website', retained: 'Specification website metadata and links', policyUrl: null, reviewStatus: 'pending' },
  { id: 'shadcn-ui', name: 'shadcn/ui', url: 'https://ui.shadcn.com', method: 'page-metadata', frequencyHours: 24, trust: 'official', topics: ['components', 'design-system'], metrics: [], scope: 'website', retained: 'Website metadata and links; component licenses need per-resource review', policyUrl: null, reviewStatus: 'pending' },
  { id: 'official-mcp-registry', name: 'Official MCP Registry', url: 'https://registry.modelcontextprotocol.io', method: 'directory-listing', frequencyHours: 24, trust: 'registry', topics: ['mcp', 'directory'], metrics: [], scope: 'listed-resource', retained: 'Server identity and repository link; registry inclusion is not vendor verification', policyUrl: null, reviewStatus: 'pending' }
];

export const WEBSITE_SOURCES = DATA_SOURCES.filter(source => source.method.startsWith('page-'));
export const dataSourceById = id => DATA_SOURCES.find(source => source.id === id) || null;

export function safeSourceUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export function repoIdentity(value) {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== 'github.com') return '';
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1].replace(/\.git$/i, '')}`.toLowerCase() : '';
  } catch { return /^[\w.-]+\/[\w.-]+$/.test(String(value || '')) ? String(value).replace(/\.git$/i, '').toLowerCase() : ''; }
}

export function resourceProvenance(row, signals = {}, demo = false) {
  const repository = repoIdentity(row.source_repo_url) || (!String(row.source_query || '').startsWith('website-source:') ? repoIdentity(row.url) : '');
  const repositoryUrl = repository ? `https://github.com/${repository}` : null;
  const independent = row.type === 'website' && String(row.source_query || '').startsWith('website-source:');
  const origin = independent ? safeSourceUrl(row.website_url || row.url) : repositoryUrl;
  const knownSite = independent ? WEBSITE_SOURCES.find(source => safeSourceUrl(source.url) === origin) : null;
  const metrics = [];
  // Independent page extraction supplies metadata, not a site popularity counter.
  if (!independent && repositoryUrl) metrics.push({ kind: 'stars', source: 'GitHub', sourceUrl: repositoryUrl, scope: row.type === 'github-repo' ? 'repository' : 'associated-repository', period: 'cumulative', sampledAt: row.last_fetched_at || null });
  for (const [directory, values] of Object.entries(signals.directoryMetrics || {})) {
    for (const kind of ['installs', 'usage', 'downloads']) {
      const metric = values?.[kind];
      if (!metric || typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0) continue;
      metrics.push({ kind, value: metric.value, source: dataSourceById(directory)?.name || directory, sourceUrl: safeSourceUrl(metric.sourceUrl), scope: metric.scope || 'unknown', resource: metric.resource || null, period: metric.period || 'unknown', sampledAt: metric.sampledAt || null });
    }
  }
  for (const kind of ['installs', 'usage', 'downloads']) {
    if (signals[kind] == null || signals[kind] === '' || metrics.some(metric => metric.kind === kind)) continue;
    const value = Number(signals[kind]);
    if (!Number.isFinite(value) || value < 0) continue;
    metrics.push({ kind, value, source: 'Unspecified directory', sourceUrl: null, scope: 'unknown', period: 'unknown', sampledAt: null });
  }
  return { mode: demo ? 'demo' : 'live', source: knownSite?.name || (independent ? 'Website' : repositoryUrl ? 'GitHub' : 'Unspecified source'), sourceUrl: origin || safeSourceUrl(row.url), fetchedAt: row.last_fetched_at || null, metrics };
}
