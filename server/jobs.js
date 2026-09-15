import 'dotenv/config';
import crypto from 'node:crypto';
import { asNumber, many, one, query, ready, rebuildDerivedMetrics } from './db.js';
import { sendMail } from './mail.js';
import { buildDigest } from './digest.js';

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
    { q: `stars:>80000 pushed:>${pushed180} archived:false`, sort: 'updated', pages: 1, perPage: 100 },
    { q: 'topic:design-system stars:>100 archived:false', sort: 'stars', pages: 1, perPage: 100 },
    { q: `stars:50..80000 pushed:>${pushed180} archived:false`, sort: 'updated', pages: 5, perPage: 100 },
    { q: `created:>${created90} stars:5..5000 archived:false`, sort: 'stars', pages: 3, perPage: 100 },
    { q: 'topic:ai stars:>20 archived:false', sort: 'updated', pages: 3, perPage: 100 },
    ...languages.map(language => ({
      q: `language:${language} stars:20..40000 pushed:>${pushed180} archived:false`,
      sort: 'updated',
      pages: 2,
      perPage: 100
    })),
    ...topics.map(topic => ({
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
const OFFICIAL_ORGS = new Set([
  'microsoft', 'vercel', 'anthropics', 'openai', 'modelcontextprotocol',
  'shadcn-ui', 'langchain-ai', 'ollama', 'supabase', 'astral-sh', 'github',
  'vercel-labs', 'facebook', 'google', 'google-gemini', 'continuedev'
]);
const ASSET_QUERIES = {
  skill: [
    { q: 'SKILL.md in:readme archived:false stars:>1', sort: 'updated', pages: 3, perPage: 100 },
    { q: 'topic:claude-skills archived:false', sort: 'stars', pages: 2, perPage: 100 },
    { q: 'topic:agent-skills archived:false', sort: 'stars', pages: 2, perPage: 100 },
    { q: '"claude skill" in:readme archived:false stars:>2', sort: 'updated', pages: 2, perPage: 100 }
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

function inferAssetType(repo) {
  const topics = (repo.topics || []).map(item => String(item).toLowerCase());
  const blob = `${repo.full_name} ${repo.description || ''} ${topics.join(' ')}`.toLowerCase();
  if (topics.some(item => item.includes('mcp')) || /\bmcp[- ]server\b/.test(blob) || blob.includes('model context protocol')) return 'plugin';
  if (topics.some(item => item.includes('skill')) || blob.includes('skill.md') || blob.includes('claude skill')) return 'skill';
  if (topics.some(item => ['ai-agent', 'ai-agents', 'coding-agent', 'autonomous-agent'].includes(item)) || /\b(coding agent|ai agent)\b/.test(blob)) return 'agent';
  if (topics.some(item => ['shadcn-ui', 'react-components', 'ui-components', 'component-library', 'ui-library'].includes(item))) return 'components';
  if (topics.includes('awesome-list') || /\b(directory|registry|awesome mcp|skills\.sh)\b/.test(blob)) return 'website';
  return null;
}

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

async function upsertGithubRepo(repo, at) {
  await query(
    `INSERT INTO repos (
       id, full_name, description, language, topics, stars, forks,
       created_at, pushed_at, updated_at, archived, deleted, source
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,FALSE,'github')
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
       source = 'github'`,
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
      Boolean(repo.archived)
    ]
  );
  await query(
    `INSERT INTO snapshots (repo_id, sampled_at, stars, forks, source)
     VALUES ($1, $2, $3, $4, 'github')
     ON CONFLICT (repo_id, sampled_at) DO UPDATE SET stars = EXCLUDED.stars, forks = EXCLUDED.forks`,
    [repo.id, at, repo.stargazers_count, repo.forks_count]
  );
}

async function upsertAsset(type, repo) {
  const slug = assetSlug(repo.full_name);
  const id = `${type}-${slug}`;
  const org = String(repo.full_name || '').split('/')[0];
  const official = OFFICIAL_ORGS.has(org.toLowerCase());
  const topics = repo.topics || [];
  const category = topics[0] || type;
  await query(
    `INSERT INTO assets (
       id, type, slug, name, full_name, description, category, category_zh, category_en,
       official, official_evidence, cluster_id, url, install, language, topics, stars, forks,
       created_at, pushed_at, recommend_rank, recommend_note_zh, recommend_note_en
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21,$22,$23
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       full_name = EXCLUDED.full_name,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       category_zh = EXCLUDED.category_zh,
       category_en = EXCLUDED.category_en,
       official = EXCLUDED.official,
       official_evidence = EXCLUDED.official_evidence,
       cluster_id = EXCLUDED.cluster_id,
       url = EXCLUDED.url,
       language = EXCLUDED.language,
       topics = EXCLUDED.topics,
       stars = EXCLUDED.stars,
       forks = EXCLUDED.forks,
       pushed_at = EXCLUDED.pushed_at`,
    [
      id, type, slug, String(repo.full_name).split('/')[1] || repo.full_name, repo.full_name,
      repo.description || '', category, category, category, official,
      official ? `Verified vendor org ${org}` : null, `${type}:${category}`,
      type === 'website' ? websiteUrl(repo) : (repo.html_url || `https://github.com/${repo.full_name}`), null, repo.language || '',
      JSON.stringify(topics), repo.stargazers_count || 0, repo.forks_count || 0,
      repo.created_at, repo.pushed_at, null, null, null
    ]
  );
  return id;
}

async function collectTypedAssets(knownRepos) {
  const counts = {};
  const extra = new Map();
  for (const type of ASSET_TYPES) {
    const found = new Map();
    const queryBudget = Math.max(40, Math.ceil(MAX_ASSETS_PER_TYPE / ASSET_QUERIES[type].length));
    for (const spec of ASSET_QUERIES[type]) {
      let added = 0;
      for (let page = 1; page <= spec.pages; page++) {
        if (found.size >= MAX_ASSETS_PER_TYPE || added >= queryBudget) break;
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(spec.q)}&sort=${encodeURIComponent(spec.sort)}&order=desc&per_page=${spec.perPage}&page=${page}`;
        const body = await github(url);
        for (const repo of body.items || []) {
          if (!repo?.id || found.has(repo.id)) continue;
          found.set(repo.id, repo);
          added++;
          if (found.size >= MAX_ASSETS_PER_TYPE || added >= queryBudget) break;
        }
        await sleep(1200);
      }
    }
    for (const repo of knownRepos) {
      if (found.size >= MAX_ASSETS_PER_TYPE) break;
      if (inferAssetType(repo) === type) found.set(repo.id, repo);
    }
    for (const repo of found.values()) {
      await upsertAsset(type, repo);
      if (!knownRepos.some(item => item.id === repo.id)) extra.set(repo.id, repo);
    }
    counts[type] = found.size;
  }
  return { counts, extra: [...extra.values()] };
}

async function copyRepoMetricsToAssets() {
  await query(
    `INSERT INTO asset_daily (asset_id, day, star_created, stars)
     SELECT a.id, d.day, COALESCE(d.star_created, 0), d.stars
     FROM assets a
     JOIN repos r ON lower(r.full_name) = lower(a.full_name)
     JOIN daily_metrics d ON d.repo_id = r.id
     ON CONFLICT (asset_id, day) DO UPDATE SET
       star_created = EXCLUDED.star_created,
       stars = EXCLUDED.stars`
  );
  const today = new Date().toISOString().slice(0, 10);
  await query(
    `INSERT INTO asset_daily (asset_id, day, star_created, stars)
     SELECT id, $1::date, 0, stars FROM assets
     ON CONFLICT (asset_id, day) DO UPDATE SET stars = EXCLUDED.stars`,
    [today]
  );
}

async function github(url, version = '2022-11-28') {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': version,
    'User-Agent': 'trend-top'
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers });
    if (response.ok) return response.json();
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      if (reset > Date.now() + 60000) throw new Error('GitHub rate limit reached; retry after reset');
    }
    if (![403, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
      throw new Error(`GitHub ${response.status}: ${await response.text()}`);
    }
    await sleep(1000 * 2 ** attempt);
  }
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
  try {
    const unique = new Map();
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
        if (String(e).startsWith('Error: GitHub 404')) {
          await query('UPDATE repos SET deleted = TRUE WHERE id = $1', [repo.id]);
        } else throw e;
      }
      await sleep(150);
    }

    const plan = discoveryPlan();
    for (const spec of plan.queries) {
      for (let page = 1; page <= spec.pages; page++) {
        if (unique.size >= MAX_REPOS) break;
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(spec.q)}&sort=${encodeURIComponent(spec.sort)}&order=desc&per_page=${spec.perPage}&page=${page}`;
        const body = await github(url);
        for (const repo of body.items || []) keepCandidate(unique, repo);
        await sleep(1200);
      }
    }

    found = unique.size;
    const at = new Date().toISOString();
    for (const repo of unique.values()) {
      await upsertGithubRepo(repo, at);
      sampled++;
    }

    const assets = await collectTypedAssets([...unique.values()]);
    for (const repo of assets.extra) {
      await upsertGithubRepo(repo, at);
      unique.set(repo.id, repo);
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
    return { found, sampled, history, historyError, assets: assets.counts };
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
  const subs = await many("SELECT * FROM subscriptions WHERE status = 'active'");
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
      const mail = await buildDigest(sub, raw);
      if (!mail.sections.length) {
        await query('UPDATE deliveries SET status = $1, last_error = NULL WHERE id = $2', ['skipped', delivery.id]);
        continue;
      }
      await sendMail(sub.email, mail.subject, mail.text, mail.html, {
        'List-Unsubscribe': `<${mail.oneClick}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }, `digest/${delivery.id}`);
      await query(
        'UPDATE deliveries SET status = $1, sent_at = $2, last_error = NULL WHERE id = $3',
        ['sent', now.toISOString(), delivery.id]
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
      if (task === 'collect') return collect();
      if (task === 'history') return syncStarHistory();
      if (task === 'digest') return digest({ force: process.argv.includes('--force') });
      if (task === 'backfill') return rebuildDerivedMetrics().then(() => ({ ok: true }));
      throw new Error('Use collect, history, digest or backfill');
    })
    .then(x => { if (x !== undefined) console.log(x); })
    .catch(e => { console.error(e); process.exitCode = 1; });
}
