import 'dotenv/config';
import { proAccess, proUsers } from './pro-access.js';
import { acceptsRepoType, skillResources, auditCopiedAssets } from './asset-classification.js';
import crypto from 'node:crypto';
import { asJson, asNumber, many, one, query, ready, rebuildDerivedMetrics } from './db.js';
import { sendMail } from './mail.js';
import { buildDigest } from './digest.js';
import { collectWebsiteSources, collectDirectorySignals } from './website-sources.js';
import { classify, officialEvidenceFor, isOfficial } from '../shared/taxonomy.js';
import { getSettings } from './settings.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const token = () => crypto.randomBytes(24).toString('hex');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');

const MAX_REPOS = 2000;
const MAX_ASSETS_PER_TYPE = 400;
const MEGA_STARS = 80000;
const MEGA_CAP = 40;
const LANGUAGES = [
  'TypeScript', 'Python', 'Rust', 'Go', 'JavaScript', 'Java', 'C++', 'C#', 'Swift', 'Kotlin',
  'Ruby', 'PHP', 'Scala', 'Elixir', 'Zig', 'Dart', 'Lua', 'Haskell', 'C', 'Shell'
];
const TOPICS = [
  'ai', 'llm', 'agents', 'machine-learning', 'developer-tools', 'react', 'nextjs', 'rust',
  'python', 'golang', 'kubernetes', 'cli', 'web', 'database', 'security', 'devtools', 'mcp',
  'inference', 'rag', 'coding-agent', 'design-system', 'design-tools', 'design-md'
];

function rotate(list, take, now = new Date()) {
  const day = Math.floor(now.getTime() / 86400000);
  const start = ((day % list.length) + list.length) % list.length;
  return Array.from({ length: take }, (_, i) => list[(start + i) % list.length]);
}

function dateBefore(days, now = new Date()) {
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
}

export function discoveryPlan(now = new Date()) {
  const languages = rotate(LANGUAGES, 5, now);
  const topics = rotate(TOPICS, 6, now);
  const created90 = dateBefore(90, now);
  const pushed180 = dateBefore(180, now);
  const queries = [
    { family: 'popular', quota: 40, q: `stars:>80000 pushed:>${pushed180} archived:false`, sort: 'updated', pages: 1, perPage: 100 },
    { family: 'targeted', quota: 80, q: 'topic:design-system stars:>100 archived:false', sort: 'stars', pages: 1, perPage: 100 },
    { family: 'active', quota: 600, q: `stars:50..80000 pushed:>${pushed180} archived:false`, sort: 'updated', pages: 6, perPage: 100 },
    { family: 'new', quota: 300, q: `created:>${created90} stars:5..5000 archived:false`, sort: 'stars', pages: 3, perPage: 100 },
    { family: 'ai', quota: 180, q: 'topic:ai stars:>20 archived:false', sort: 'updated', pages: 2, perPage: 100 },
    ...languages.map(language => ({
      family: 'language', quota: 80,
      q: `language:${language} stars:20..40000 pushed:>${pushed180} archived:false`,
      sort: 'updated',
      pages: 2,
      perPage: 100
    })),
    ...topics.map(topic => ({
      family: 'topic', quota: 60,
      q: `topic:${topic} stars:>10 archived:false`,
      sort: 'updated',
      pages: 2,
      perPage: 100
    }))
  ];
  return { queries, languages, topics, maxRepos: MAX_REPOS, megaCap: MEGA_CAP };
}

export function keepCandidate(unique, repo) {
  if (!repo?.id || unique.has(repo.id)) return false;
  const stars = Number(repo.stargazers_count) || 0;
  if (stars > MEGA_STARS) {
    const mega = [...unique.values()].filter(r => (Number(r.stargazers_count) || 0) > MEGA_STARS).length;
    if (mega >= MEGA_CAP) return false;
  }
  if (unique.size >= MAX_REPOS) return false;
  unique.set(repo.id, repo);
  return true;
}

const ASSET_TYPES = ['skill', 'plugin', 'agent', 'components', 'website'];
const ASSET_QUERIES = {
  skill: [
    { kind: 'code', q: 'filename:SKILL.md', pages: 2, perPage: 50 },
    { q: '"SKILL.md" in:readme archived:false stars:>0', sort: 'updated', pages: 3, perPage: 100 },
    { q: 'topic:claude-skills archived:false', sort: 'stars', pages: 2, perPage: 100 },
    { q: 'topic:agent-skills archived:false', sort: 'stars', pages: 2, perPage: 100 },
    { q: 'topic:claude-code-skills archived:false', sort: 'updated', pages: 2, perPage: 100 }
  ],
  plugin: [
    { q: 'topic:mcp-server archived:false', sort: 'stars', pages: 3, perPage: 100 },
    { q: 'mcp-server in:name archived:false stars:>3', sort: 'updated', pages: 3, perPage: 100 },
    { q: 'topic:mcp archived:false stars:>15', sort: 'updated', pages: 2, perPage: 100 }
  ],
  agent: [
    { q: 'topic:ai-agents archived:false stars:>15', sort: 'stars', pages: 3, perPage: 100 },
    { q: 'topic:coding-agent archived:false', sort: 'updated', pages: 2, perPage: 100 },
    { q: '"coding agent" in:readme archived:false stars:>20', sort: 'updated', pages: 2, perPage: 100 }
  ],
  components: [
    { q: 'topic:shadcn-ui archived:false', sort: 'stars', pages: 2, perPage: 100 },
    { q: 'topic:react-components archived:false stars:>40', sort: 'updated', pages: 3, perPage: 100 },
    { q: 'topic:ui-library language:TypeScript archived:false stars:>30', sort: 'updated', pages: 2, perPage: 100 }
  ],
  website: [
    { q: 'awesome-design-md in:name archived:false', sort: 'stars', pages: 1, perPage: 100 },
    { q: 'topic:awesome-list topic:design-system archived:false', sort: 'stars', pages: 2, perPage: 100 },
    { q: 'awesome-mcp in:name archived:false', sort: 'stars', pages: 2, perPage: 100 },
    { q: 'mcp directory in:readme archived:false stars:>20', sort: 'stars', pages: 2, perPage: 100 },
    { q: 'skills.sh in:readme archived:false', sort: 'updated', pages: 2, perPage: 50 },
    { q: 'topic:awesome-list mcp OR skills archived:false', sort: 'stars', pages: 2, perPage: 100 }
  ]
};



function assetSlug(fullName) {
  return String(fullName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function websiteUrl(repo) {
  const value = String(repo?.homepage || '').trim();
  if (value) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch {}
  }
  return repo.html_url || `https://github.com/${repo.full_name}`;
}

function websiteEntityKey(repo) {
  try { return `domain:${new URL(websiteUrl(repo)).hostname.toLowerCase().replace(/^www\./, '')}`; }
  catch { return `repo:${String(repo.full_name || '').toLowerCase()}`; }
}

async function upsertGithubRepo(repo, at, sourceQuery = null) {
  await query(
    `INSERT INTO repos (
       id, full_name, description, language, topics, stars, forks,
       created_at, pushed_at, updated_at, archived, deleted, source,last_seen_at,source_query,active,missed_runs
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,FALSE,'github',$12,$13,TRUE,0)
     ON CONFLICT (id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       description = EXCLUDED.description,
       language = EXCLUDED.language,
       topics = EXCLUDED.topics,
       stars = EXCLUDED.stars,
       forks = EXCLUDED.forks,
       pushed_at = EXCLUDED.pushed_at,
       updated_at = EXCLUDED.updated_at,
       archived = EXCLUDED.archived,
       deleted = FALSE,
       source = 'github',
       last_seen_at = EXCLUDED.last_seen_at,
       source_query = COALESCE(EXCLUDED.source_query,repos.source_query),
       active = TRUE,
       missed_runs = 0`,
    [
      repo.id,
      repo.full_name,
      repo.description || '',
      repo.language || '',
      JSON.stringify(repo.topics || []),
      repo.stargazers_count,
      repo.forks_count,
      repo.created_at,
      repo.pushed_at,
      repo.updated_at,
      Boolean(repo.archived),
      at,
      sourceQuery
    ]
  );
  await query(
    `INSERT INTO snapshots (repo_id, sampled_at, stars, forks, source)
     VALUES ($1, $2, $3, $4, 'github')
     ON CONFLICT (repo_id, sampled_at) DO UPDATE SET stars = EXCLUDED.stars, forks = EXCLUDED.forks`,
    [repo.id, at, repo.stargazers_count, repo.forks_count]
  );
}

export async function upsertAsset(type, repo, sourceQuery = null, at = new Date().toISOString(), resource = null) {
  const slug = assetSlug(repo.full_name)+(resource?'-'+assetSlug(resource.path):'');
  const id = `${type}-${slug}`;
  const org = String(repo.full_name || '').split('/')[0];
  const topics = repo.topics || [];
  const classified = classify({ type, full_name: repo.full_name, name: repo.name, description: repo.description, topics, category: resource?.name });
  const evidence = officialEvidenceFor({ type, full_name: repo.full_name, org });
  await query(
    `INSERT INTO assets (
       id, type, slug, name, full_name, description, category, category_zh, category_en, use_case,
       official, official_evidence, cluster_id, url, install, language, topics, stars, forks,
       created_at, pushed_at, recommend_rank, recommend_note_zh, recommend_note_en,
       website_url,source_repo_url,last_fetched_at,last_seen_at,source_query,entity_key,ranking_signals,active,missed_runs
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$27,$28,$29,$30::jsonb,TRUE,0
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       full_name = EXCLUDED.full_name,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       category_zh = EXCLUDED.category_zh,
       category_en = EXCLUDED.category_en,
       use_case = EXCLUDED.use_case,
       official = EXCLUDED.official,
       official_evidence = EXCLUDED.official_evidence,
       cluster_id = EXCLUDED.cluster_id,
       url = EXCLUDED.url,
       install = EXCLUDED.install,
       language = EXCLUDED.language,
       topics = EXCLUDED.topics,
       stars = EXCLUDED.stars,
       forks = EXCLUDED.forks,
       pushed_at = EXCLUDED.pushed_at,
       website_url = EXCLUDED.website_url,
       source_repo_url = EXCLUDED.source_repo_url,
       last_fetched_at = EXCLUDED.last_fetched_at,
       last_seen_at = EXCLUDED.last_seen_at,
       source_query = COALESCE(EXCLUDED.source_query,assets.source_query),
       entity_key = EXCLUDED.entity_key,
       ranking_signals = EXCLUDED.ranking_signals,
       active = TRUE,
       missed_runs = 0`,
    [
      id, type, slug, resource?.name || String(repo.full_name).split('/')[1] || repo.full_name, resource?`${repo.full_name} / ${resource.name}`:repo.full_name,
      resource?`${resource.name} skill from ${repo.full_name}.`:repo.description || '', classified.category, classified.categoryZh, classified.categoryEn, classified.useCase,
      isOfficial(evidence), evidence, `${type}:${classified.category}`,
      resource?.url || (type === 'website' ? websiteUrl(repo) : (repo.html_url || `https://github.com/${repo.full_name}`)), resource?`Copy ${resource.path} from ${resource.url}`:null, repo.language || '',
      JSON.stringify(topics), repo.stargazers_count || 0, repo.forks_count || 0,
      repo.created_at, repo.pushed_at, null, null, null,
      type === 'website' ? websiteUrl(repo) : null,
      repo.html_url || `https://github.com/${repo.full_name}`,
      at,
      sourceQuery,
      type === 'website' ? websiteEntityKey(repo) : `repo:${String(repo.full_name || '').toLowerCase()}`,
      JSON.stringify({ associatedRepoStars: repo.stargazers_count || 0, associatedRepoForks: repo.forks_count || 0, contentUpdatedAt: repo.pushed_at || repo.updated_at || null, confidence: 'github-associated', typeVerified: true, resourcePath: resource?.path || null, classificationEvidence: resource?'SKILL.md file':sourceQuery?.startsWith('manual:')?'administrator-approved':type==='website'?'repository-homepage':'primary-purpose-description' })
    ]
  );
  return id;
}

async function recordQueryStat(runId, collectionType, spec, stat, error = null) {
  await query(
    `INSERT INTO sync_query_stats (run_id,collection_type,family,query_text,requested,returned,unique_count,accepted,rate_limited,error,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [runId, collectionType, spec.family || collectionType, spec.q, stat.requested, stat.returned, stat.unique, stat.accepted, /rate limit|429|403/i.test(String(error || '')), error ? String(error).slice(0, 500) : null, new Date().toISOString()]
  );
}

export async function collectTypedAssets(knownRepos, runId, at, manualAssets = new Map(), fetchGithub = github, wait = sleep) {
  const counts = {}, extra = new Map(), executedQueries = [], trees = new Map();
  const skillTree = async repo => {
    if (trees.has(repo.id)) return trees.get(repo.id);
    const branches = [...new Set([repo.default_branch, 'main', 'master'].filter(Boolean))];
    for (const branch of branches) {
      try {
        const body = await fetchGithub('https://api.github.com/repos/' + repo.full_name + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1');
        const resources = body.truncated ? [] : skillResources(repo, body.tree || []);
        trees.set(repo.id, resources);
        return resources;
      } catch (error) {
        if (!/GitHub 404/.test(String(error))) {
          console.warn('[collect] skill tree', repo.full_name, error.message || error);
          trees.set(repo.id, []);
          return [];
        }
      }
    }
    trees.set(repo.id, []);
    return [];
  };
  const skills = async (repo, hintPath) => {
    if (hintPath) {
      const fromPath = skillResources(repo, [{ type: 'blob', path: hintPath }]);
      if (fromPath.length) return fromPath;
    }
    return skillTree(repo);
  };
  for(const type of ASSET_TYPES) {
    const found = new Map();
    const accept = async (repo,source,manual=false,hintPath=null) => {
      if(!repo?.id)return 0;
      if(type!=='skill' && !manual && !acceptsRepoType(type,repo))return 0;
      const resources=type==='skill'?await skills(repo,hintPath):[null];
      let added=0;
      for(const resource of resources){
        const key=repo.id+':'+(resource?.path || '');
        if(found.has(key))continue;
        if(found.size>=MAX_ASSETS_PER_TYPE)break;
        found.set(key,{repo,resource,source});added++;
      }
      return added;
    };
    for(const repo of manualAssets.get(type) || [])await accept(repo,'manual:'+type,true);
    const queryBudget=Math.max(40,Math.ceil(MAX_ASSETS_PER_TYPE/ASSET_QUERIES[type].length));
    for(const spec of ASSET_QUERIES[type]) {
      let added=0;
      const stat={requested:0,returned:0,unique:0,accepted:0};
      try {
        for(let page=1;page<=spec.pages;page++){
          if(found.size>=MAX_ASSETS_PER_TYPE || added>=queryBudget)break;
          const params=new URLSearchParams({q:spec.q,per_page:String(spec.perPage),page:String(page)});
          if(spec.kind!=='code'){
            params.set('sort', spec.sort || 'updated');
            params.set('order','desc');
          }
          const url='https://api.github.com/search/'+(spec.kind==='code'?'code':'repositories')+'?'+params.toString();
          stat.requested++;
          const body=await fetchGithub(url);stat.returned+=(body.items || []).length;
          for(const hit of body.items || []){
            const repo=spec.kind==='code'?(hit.repository || hit):hit;
            if(!repo?.full_name)continue;
            stat.unique++;
            const n=await accept(repo,'asset:'+type+':'+spec.q,false,spec.kind==='code'?hit.path:null);added+=n;stat.accepted+=n;
            if(found.size>=MAX_ASSETS_PER_TYPE || added>=queryBudget)break;
          }
          await wait(spec.kind==='code'?2500:1200);
        }
        executedQueries.push('asset:'+type+':'+spec.q);
        await recordQueryStat(runId,type,{...spec,family:'asset:'+type},stat);
      }catch(error){
        await recordQueryStat(runId,type,{...spec,family:'asset:'+type},stat,error);
        console.error('[collect] asset query', type, spec.q, error);
      }
    }
    for(const repo of knownRepos){
      if(found.size>=MAX_ASSETS_PER_TYPE)break;
      if(type==='skill'){
        const blob=`${repo.full_name||''} ${repo.description||''} ${(repo.topics||[]).join(' ')}`.toLowerCase();
        if(!/skill\.md|agent-skills|claude-skills|claude-skill/.test(blob))continue;
      }
      await accept(repo,'inferred:'+type);
    }
    for(const {repo,resource,source} of found.values()){
      await upsertAsset(type,repo,source,at,resource);
      if(!knownRepos.some(item=>item.id===repo.id))extra.set(repo.id,repo);
    }
    counts[type]=found.size;
  }
  return {counts,extra:[...extra.values()],executedQueries};
}

async function approvedCandidates() {
  const rows = await many("SELECT * FROM catalog_candidates WHERE status='approved' ORDER BY id");
  const repos = [], assets = new Map();
  for (const row of rows) {
    try {
      const parsed = new URL(row.url);
      const match = parsed.hostname.toLowerCase() === 'github.com' ? parsed.pathname.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/) : null;
      if (match) {
        const repo = await github(`https://api.github.com/repos/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`);
        if (row.type === 'github-repo') { repo._trendTopSourceQuery = 'manual:github-repo'; repos.push(repo); }
        else { const list = assets.get(row.type) || []; list.push(repo); assets.set(row.type, list); }
      } else if (row.type === 'website') {
        const id = `manual-${row.id}`;
        await query(
          `INSERT INTO website_sources (id,name,url,collection_method,frequency_hours,trust_level,topics,active,metadata)
           VALUES ($1,$2,$3,'page',24,'reviewed','[]'::jsonb,TRUE,$4::jsonb)
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,active=TRUE`,
          [id, parsed.hostname.replace(/^www\./, ''), parsed.href, JSON.stringify({ candidateId: row.id, submittedBy: row.submitted_by })]
        );
      }
      await query('UPDATE catalog_candidates SET notes=NULL WHERE id=$1', [row.id]);
    } catch (error) {
      await query('UPDATE catalog_candidates SET notes=$1 WHERE id=$2', [`Collection failed: ${String(error).slice(0, 400)}`, row.id]);
    }
  }
  return { repos, assets };
}

export async function copyRepoMetricsToAssets() {
  await query(
    `INSERT INTO asset_daily (asset_id, day, star_created, stars)
     SELECT a.id, d.day, d.star_created, d.stars
     FROM assets a
     JOIN repos r ON lower(r.full_name) = lower(
       CASE
         WHEN a.entity_key LIKE 'repo:%' THEN substr(a.entity_key, 6)
         WHEN position(' / ' in a.full_name) > 0 THEN split_part(a.full_name, ' / ', 1)
         WHEN a.source_repo_url LIKE 'https://github.com/%' THEN regexp_replace(a.source_repo_url, '^https://github.com/(.+?)/?$', '\\1')
         ELSE a.full_name
       END
     )
     JOIN daily_metrics d ON d.repo_id = r.id
     ON CONFLICT (asset_id, day) DO UPDATE SET
       star_created = EXCLUDED.star_created,
       stars = EXCLUDED.stars`
  );
  const today = new Date().toISOString().slice(0, 10);
  await query(
    `INSERT INTO asset_daily (asset_id, day, star_created, stars)
     SELECT id, $1::date, NULL, stars FROM assets
     ON CONFLICT (asset_id, day) DO UPDATE SET stars = EXCLUDED.stars`,
    [today]
  );
  // The sample day and anything later is incomplete; keep the Star total but drop the fake zero gain.
  await query(
    `UPDATE asset_daily SET star_created = NULL
     WHERE star_created IS NOT NULL
       AND day >= (SELECT (timezone('UTC', MAX(sampled_at)))::date FROM snapshots WHERE source = 'github')`
  );
}

async function github(url, version = '2022-11-28') {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': version,
    'User-Agent': 'trend-top',
    Connection: 'close'
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(25000) });
      if (response.ok) return response.json();
      if (response.status === 403 || response.status === 429) {
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        const remaining = Number(response.headers.get('x-ratelimit-remaining'));
        if (remaining === 0 && reset > Date.now() + 60000) throw new Error('GitHub rate limit reached; retry after reset');
      }
      if (![403, 429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
        throw new Error(`GitHub ${response.status}: ${await response.text()}`);
      }
    } catch (error) {
      lastError = error;
      const retryable = /UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|TimeoutError|AbortError/i.test(
        `${error?.code || ''} ${error?.cause?.code || ''} ${error}`
      );
      if (!retryable || attempt === 4) throw error;
    }
    await sleep(1500 * 2 ** attempt);
  }
  throw lastError;
}

export async function syncStarHistory(repositories) {
  if ((process.env.DATA_MODE || 'demo') !== 'live') throw new Error('Set DATA_MODE=live to collect GitHub history');
  const repos = repositories || await many(
    `SELECT id, full_name FROM repos
     WHERE source = 'github' AND deleted = FALSE AND archived = FALSE
     ORDER BY stars DESC`
  );
  let sampled = 0, failed = 0, consecutiveFailures = 0;
  const at = new Date().toISOString();
  for (const repo of repos) {
    try {
      const weeks = await github(`https://api.github.com/repos/${repo.full_name}/stargazers/history?per_page=12`, '2026-03-10');
      if (!Array.isArray(weeks) || !weeks.length) throw new Error('Empty star history');
      for (const week of weeks) {
        if (!Number.isInteger(week.week) || !Array.isArray(week.days) || week.days.length !== 7) continue;
        await query(
          `INSERT INTO star_history (repo_id, week_start, total, days_json, sampled_at)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           ON CONFLICT (repo_id, week_start) DO UPDATE SET
             total = EXCLUDED.total, days_json = EXCLUDED.days_json, sampled_at = EXCLUDED.sampled_at`,
          [repo.id, week.week, Number(week.total) || 0, JSON.stringify(week.days), at]
        );
      }
      sampled++;
      consecutiveFailures = 0;
    } catch (e) {
      failed++;
      consecutiveFailures++;
      if (consecutiveFailures >= 5) throw new Error(`Star history stopped after 5 consecutive failures: ${e}`);
    }
    await sleep(180);
  }
  return { sampled, failed };
}

export async function collect() {
  if ((process.env.DATA_MODE || 'demo') !== 'live') throw new Error('Set DATA_MODE=live to collect GitHub data');
  const started = new Date().toISOString();
  const run = await query(
    'INSERT INTO sync_runs (started_at, status) VALUES ($1, $2) RETURNING id',
    [started, 'running']
  );
  const runId = run.rows[0].id;
  let found = 0, sampled = 0;
  const firecrawlReady = Boolean((await getSettings()).secret.firecrawlApiKey);
  console.log('[collect] firecrawl', firecrawlReady ? 'enabled' : 'disabled (set firecrawl.apiKey in config.json or Site admin)');
  try {
    const unique = new Map();
    const manual = await approvedCandidates();
    for (const repo of manual.repos) keepCandidate(unique, repo);
    const knownLimit = process.env.GITHUB_TOKEN ? 600 : 80;
    const known = await many(
      `SELECT id, full_name FROM repos
       WHERE source = 'github' AND deleted = FALSE
       ORDER BY updated_at ASC
       LIMIT $1`,
      [knownLimit]
    );
    for (const repo of known) {
      try {
        const fresh = await github(`https://api.github.com/repos/${repo.full_name}`);
        unique.set(fresh.id, fresh);
      } catch (e) {
        if (String(e).includes('GitHub 404')) {
          await query('UPDATE repos SET deleted = TRUE WHERE id = $1', [repo.id]);
        } else {
          console.error('[collect] skip known repo', repo.full_name, e);
        }
      }
      await sleep(150);
    }

    const plan = discoveryPlan();
    const executedRepoQueries = [];
    for (const spec of plan.queries) {
      let added = 0;
      const stat = { requested: 0, returned: 0, unique: 0, accepted: 0 };
      try {
        for (let page = 1; page <= spec.pages; page++) {
          if (unique.size >= MAX_REPOS || added >= spec.quota) break;
          const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(spec.q)}&sort=${encodeURIComponent(spec.sort)}&order=desc&per_page=${spec.perPage}&page=${page}`;
          stat.requested++;
          const body = await github(url);
          stat.returned += (body.items || []).length;
          for (const repo of body.items || []) {
            if (!repo?.id || unique.has(repo.id)) continue;
            stat.unique++;
            if (keepCandidate(unique, repo)) {
              repo._trendTopSourceQuery = spec.q;
              stat.accepted++;added++;
            }
            if (unique.size >= MAX_REPOS || added >= spec.quota) break;
          }
          await sleep(1200);
        }
        executedRepoQueries.push(spec.q);
        await recordQueryStat(runId, 'github-repo', spec, stat);
      } catch (error) {
        await recordQueryStat(runId, 'github-repo', spec, stat, error);
        console.error('[collect] repo query', spec.q, error);
      }
    }

    found = unique.size;
    const at = new Date().toISOString();
    for (const repo of unique.values()) {
      await upsertGithubRepo(repo, at, repo._trendTopSourceQuery || null);
      sampled++;
    }

    const assets = await collectTypedAssets([...unique.values()], runId, at, manual.assets);
    for (const repo of assets.extra) {
      await upsertGithubRepo(repo, at, repo._trendTopAssetSourceQuery || null);
      unique.set(repo.id, repo);
    }

    const websites = await collectWebsiteSources();
    let directories = { applied: 0, created: 0 };
    try {
      directories = await collectDirectorySignals({ fetchGithub: github, upsertAsset, wait: sleep });
    } catch (error) {
      console.error('[collect] directory signals', error);
    }
    console.log('[collect] websites', websites, 'directories', directories);
    if (executedRepoQueries.length) {
      await query(
        `UPDATE repos SET missed_runs=missed_runs+1,active=CASE WHEN missed_runs+1>=3 THEN FALSE ELSE active END
         WHERE source='github' AND source_query=ANY($1::text[]) AND (last_seen_at IS NULL OR last_seen_at<$2)`,
        [executedRepoQueries, started]
      );
    }
    if (assets.executedQueries.length) {
      await query(
        `UPDATE assets SET missed_runs=missed_runs+1,active=CASE WHEN missed_runs+1>=3 THEN FALSE ELSE active END
         WHERE source_query=ANY($1::text[]) AND (last_seen_at IS NULL OR last_seen_at<$2)`,
        [assets.executedQueries, started]
      );
    }

    // Star history is a separate GitHub endpoint; if it breaks, keep the snapshots and still rebuild metrics.
    let history = { sampled: 0, failed: 0 }, historyError = null;
    try {
      history = await syncStarHistory([...unique.values()].map(r => ({ id: r.id, full_name: r.full_name })));
    } catch (e) {
      historyError = `star history aborted: ${String(e)}`;
      console.error('[collect]', historyError);
    }
    await rebuildDerivedMetrics();
    await copyRepoMetricsToAssets();
    await query(
      `UPDATE sync_runs SET finished_at = $1, status = $2, found = $3, sampled = $4, error = $5 WHERE id = $6`,
      [new Date().toISOString(), 'ok', found, sampled, historyError || (history.failed ? `${history.failed} star histories unavailable` : null), runId]
    );
    return { found, sampled, history, historyError, assets: assets.counts, websites, directories, firecrawl: firecrawlReady ? (directories.provider || websites.provider || 'firecrawl') : 'skipped' };
  } catch (e) {
    await query(
      `UPDATE sync_runs SET finished_at = $1, status = $2, found = $3, sampled = $4, error = $5 WHERE id = $6`,
      [new Date().toISOString(), 'failed', found, sampled, String(e), runId]
    );
    throw e;
  }
}

function localParts(time, zone) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  });
  const p = Object.fromEntries(f.formatToParts(time).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export async function digest({ force = false } = {}) {
  const now = new Date();
  const last = await one("SELECT MAX(sampled_at) AS t FROM snapshots WHERE source = 'github'");
  if ((process.env.DATA_MODE || 'demo') === 'live' && (!last?.t || now - new Date(last.t) > 36 * 3600000)) {
    throw new Error('Fresh ranking data unavailable; digest skipped');
  }
  const eligible = new Set((await proUsers(now)).map(row => row.user_id));
  const subs = (await many("SELECT * FROM subscriptions WHERE status = 'active'")).filter(sub => eligible.has(sub.user_id));
  let sent = 0, failed = 0;
  for (const sub of subs) {
    const { date, hour } = localParts(now, sub.timezone);
    if (!force && hour < sub.send_hour) continue;
    await query(
      `INSERT INTO deliveries (subscription_id, local_date, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (subscription_id, local_date) DO NOTHING`,
      [sub.id, date]
    );
    const delivery = await one(
      'SELECT * FROM deliveries WHERE subscription_id = $1 AND local_date = $2',
      [sub.id, date]
    );
    if (!delivery || delivery.status === 'sent' || delivery.status === 'skipped' || delivery.status === 'sending' || (delivery.status === 'failed' && asNumber(delivery.attempts) >= 3)) continue;
    const claim = await query(
      `UPDATE deliveries SET status = 'sending', attempts = attempts + 1
       WHERE id = $1 AND status IN ('pending', 'failed')
       RETURNING id`,
      [delivery.id]
    );
    if (!claim.rows.length) continue;
    try {
      const raw = decryptManageToken(sub.manage_hash);
      const previous = await one(
        `SELECT snapshot FROM deliveries WHERE subscription_id = $1 AND status = 'sent' AND snapshot IS NOT NULL
         ORDER BY sent_at DESC LIMIT 1`,
        [sub.id]
      );
      const mail = await buildDigest(sub, raw, { previous: asJson(previous?.snapshot, null) });
      if (!mail.sections.length) {
        await query('UPDATE deliveries SET status = $1, last_error = NULL WHERE id = $2', ['skipped', delivery.id]);
        continue;
      }
      const current = await one('SELECT status FROM subscriptions WHERE id=$1', [sub.id]);
      if (current?.status !== 'active' || !(await proAccess(sub.user_id)).active) {
        await query("UPDATE deliveries SET status='pending' WHERE id=$1", [delivery.id]);
        continue;
      }
      await sendMail(sub.email, mail.subject, mail.text, mail.html, {
        'List-Unsubscribe': `<${mail.oneClick}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }, `digest/${delivery.id}`);
      await query(
        'UPDATE deliveries SET status = $1, sent_at = $2, last_error = NULL, snapshot = $4::jsonb WHERE id = $3',
        ['sent', now.toISOString(), delivery.id, JSON.stringify(mail.snapshot || {})]
      );
      sent++;
    } catch (e) {
      await query(
        'UPDATE deliveries SET status = $1, last_error = $2 WHERE id = $3',
        ['failed', String(e), delivery.id]
      );
      failed++;
    }
  }
  return { sent, failed };
}

const key = crypto.createHash('sha256').update(process.env.ADMIN_TOKEN || 'local-demo-only-key').digest();
export function encryptManageToken(raw) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([c.update(raw, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), encrypted]).toString('base64');
}
export function decryptManageToken(saved) {
  const b = Buffer.from(saved, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
export { token, hash };

if (process.argv[1]?.endsWith('jobs.js')) {
  const task = process.argv[2];
  ready
    .then(() => {
      if (task === 'catalog-audit') return auditCopiedAssets();
      if (task === 'collect') return collect();
      if (task === 'history') return syncStarHistory();
      if (task === 'digest') return digest({ force: process.argv.includes('--force') });
      if (task === 'backfill') return rebuildDerivedMetrics().then(() => ({ ok: true }));
      throw new Error('Use collect, history, digest or backfill');
    })
    .then(x => { if (x !== undefined) console.log(x); })
    .catch(e => { console.error(e); process.exitCode = 1; });
}
