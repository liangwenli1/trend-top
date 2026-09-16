import { asIso, asJson, dataSource, many } from './db.js';
import { BENCHMARK_VERSION, CATALOG_BENCHMARK } from '../shared/catalog-benchmark.js';
import { DATA_SOURCES, repoIdentity, safeSourceUrl } from '../shared/data-sources.js';

const domainPath = value => {
  const safe = safeSourceUrl(value);
  if (!safe) return '';
  const url = new URL(safe);
  return url.hostname.toLowerCase().replace(/^www\./, '') + url.pathname.replace(/\/+$/, '');
};
const assetRepo = row => repoIdentity(row.source_repo_url) || repoIdentity(row.url) || repoIdentity(String(row.entity_key || '').replace(/^repo:/, ''));
const matchesRepo = (entry, identity) => Boolean(identity && (entry.repo ? identity === entry.repo.toLowerCase() : entry.repoName && identity.split('/')[1] === entry.repoName.toLowerCase()));
const activeRepo = row => row.active !== false && !row.deleted && !row.archived;
const activeAsset = row => row.active !== false;

export function evaluateCoverage(entry, { repos = [], assets = [], sources = [], candidates = [] } = {}) {
  const matchingRepos = repos.filter(row => matchesRepo(entry, String(row.full_name).toLowerCase()));
  const matchingAssets = assets.filter(row => entry.website
    ? [row.website_url, row.url].some(value => domainPath(value) === domainPath(entry.website))
    : matchesRepo(entry, assetRepo(row)));
  const expected = entry.type === 'github-repo' ? matchingRepos : matchingAssets.filter(row => row.type === entry.type && (!entry.resourcePath || asJson(row.ranking_signals, {}).resourcePath === entry.resourcePath));
  const live = expected.filter(entry.type === 'github-repo' ? activeRepo : activeAsset);
  const verified = live.filter(row => entry.type === 'github-repo' || entry.type === 'website' || entry.resourcePath || asJson(row.ranking_signals, {}).typeVerified || String(row.source_query || '').startsWith('manual:'));
  const site = entry.website ? sources.find(row => domainPath(row.url) === domainPath(entry.website)) : null;
  const pending = candidates.find(row => row.type === entry.type && row.status === 'pending' && (entry.website ? domainPath(row.url) === domainPath(entry.website) : matchesRepo(entry, repoIdentity(row.url))));
  let status = 'not-in-catalog';
  if (verified.length) status = 'covered';
  else if (live.length) status = 'unverified';
  else if (expected.length) status = 'inactive';
  else if (pending) status = 'candidate-pending';
  else if (site?.active === false) status = 'source-disabled';
  else if (site?.last_error) status = 'source-failed';
  else if (site) status = 'source-registered';
  else if (matchingAssets.some(activeAsset) && !entry.resourcePath) status = 'other-type';
  else if (matchingRepos.some(activeRepo) || matchingAssets.some(activeAsset)) status = 'repository-only';
  const items = expected.map(row => ({ id: String(row.id), type: row.type || 'github-repo', name: row.full_name, active: row.type ? activeAsset(row) : activeRepo(row), sourceQuery: row.source_query || null, lastSeenAt: asIso(row.last_seen_at), classificationEvidence: asJson(row.ranking_signals, {}).classificationEvidence || null, retirementReason: asJson(row.ranking_signals, {}).classificationAudit || null }));
  return { ...entry, status, items, observedRepositories: matchingRepos.map(row => ({ name: row.full_name, active: activeRepo(row), sourceQuery: row.source_query || null, lastSeenAt: asIso(row.last_seen_at) })), alsoListedAs: [...new Set(matchingAssets.filter(activeAsset).map(row => row.type))], sourceError: site?.last_error || null, sourceLastFetchedAt: asIso(site?.last_fetched_at), candidateId: pending?.id || null };
}

// Read-only: benchmark checks never promote candidates, change counters or override classification.
export async function getCoverageReport() {
  const [repos, assets, sources, candidates, runs] = await Promise.all([
    many('SELECT id,full_name,active,deleted,archived,last_seen_at,source_query FROM repos WHERE source=$1', [dataSource()]),
    many('SELECT id,type,full_name,url,website_url,source_repo_url,entity_key,ranking_signals,active,last_seen_at,source_query FROM assets'),
    many('SELECT id,name,url,active,last_fetched_at,last_error,collection_method,frequency_hours FROM website_sources'),
    many("SELECT id,url,type,status FROM catalog_candidates WHERE status='pending'"),
    many('SELECT id,started_at,finished_at,status,error FROM sync_runs ORDER BY id DESC LIMIT 1')
  ]);
  const entries = CATALOG_BENCHMARK.map(entry => evaluateCoverage(entry, { repos, assets, sources, candidates }));
  const byType = [...new Set(entries.map(entry => entry.type))].map(type => {
    const group = entries.filter(entry => entry.type === type);
    return { type, expected: group.length, covered: group.filter(entry => entry.status === 'covered').length };
  });
  const queryFailures = runs.length ? await many('SELECT collection_type,family,query_text,error,rate_limited FROM sync_query_stats WHERE run_id=$1 AND (error IS NOT NULL OR rate_limited=TRUE) ORDER BY id LIMIT 30', [runs[0].id]) : [];
  return { benchmarkVersion: BENCHMARK_VERSION, generatedAt: new Date().toISOString(), mode: dataSource() === 'demo' ? 'demo' : 'live', expected: entries.length, covered: entries.filter(entry => entry.status === 'covered').length, byType, entries, latestRun: runs[0] || null, queryFailures, sourcePolicies: DATA_SOURCES.map(policy => ({ ...policy, lastFetchedAt: asIso(sources.find(row => row.id === policy.id)?.last_fetched_at), lastError: sources.find(row => row.id === policy.id)?.last_error || null })) };
}
