import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DAYS = { day: 1, week: 7, month: 30 };
export const HISTORY_DAYS = 14;

const schemaSql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');

export function dataSource() {
  return (process.env.DATA_MODE || 'demo') === 'demo' ? 'demo' : 'github';
}

export function asNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function asIso(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function asDay(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function asJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

export function utcDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

let adapter;

async function createAdapter() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, max: 8 });
    return {
      kind: 'postgres',
      async exec(sql) { await pool.query(sql); },
      async query(text, params = []) { return pool.query(text, params); },
      async close() { await pool.end(); }
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || path.resolve('./data/pglite');
  if (process.env.PGLITE_DIR !== ':memory:') fs.mkdirSync(dir, { recursive: true });
  const lite = new PGlite(process.env.PGLITE_DIR === ':memory:' ? undefined : dir);
  await lite.waitReady;
  return {
    kind: 'pglite',
    async exec(sql) { await lite.exec(sql); },
    async query(text, params = []) {
      const result = await lite.query(text, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
    async close() { await lite.close?.(); }
  };
}

async function init() {
  adapter = await createAdapter();
  await adapter.exec(schemaSql);
  // Keep existing deployments compatible with the multi-topic subscription form.
  await adapter.exec("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '[]'::jsonb");
  if (dataSource() === 'demo') {
    await seedDemo();
    const { seedCatalog } = await import('./catalog.js');
    await seedCatalog();
  }
  await rebuildDerivedMetrics();
  return adapter;
}

export function dbKind() {
  return adapter?.kind || 'unknown';
}

export const ready = init();

async function db() {
  if (!adapter) await ready;
  return adapter;
}

export async function query(text, params = []) {
  return (await db()).query(text, params);
}

export async function one(text, params = []) {
  return (await query(text, params)).rows[0] || null;
}

export async function many(text, params = []) {
  return (await query(text, params)).rows;
}

const samples = [
  ['vercel/next.js', 'The React framework for the web.', 'TypeScript', ['nextjs', 'react', 'web'], 132400, 29500, 1500, 230, '2023-10-23', false],
  ['microsoft/vscode', 'Visual Studio Code.', 'TypeScript', ['editor', 'developer-tools'], 178900, 34900, 1130, 180, '2015-09-03', false],
  ['langchain-ai/langchain', 'Build context-aware reasoning applications.', 'Python', ['llm', 'agents', 'ai'], 104800, 17200, 2460, 390, '2022-10-16', true],
  ['ollama/ollama', 'Get up and running with large language models.', 'Go', ['llm', 'inference', 'ai'], 156700, 12900, 3840, 540, '2023-06-26', true],
  ['openai/codex', 'Lightweight coding agent that runs in your terminal.', 'Rust', ['agent', 'coding-agent', 'ai'], 49600, 5700, 3150, 460, '2025-04-13', true],
  ['anthropics/claude-code', 'An agentic coding tool that lives in your terminal.', 'Shell', ['agent', 'developer-tools', 'ai'], 43800, 3200, 2700, 270, '2025-02-24', true],
  ['astral-sh/uv', 'An extremely fast Python package and project manager.', 'Rust', ['python', 'developer-tools'], 74300, 2200, 1910, 88, '2024-02-15', false],
  ['shadcn-ui/ui', 'Beautifully designed components that you can copy and paste.', 'TypeScript', ['components', 'react', 'design-system'], 96200, 7100, 2100, 175, '2023-01-04', false],
  ['modelcontextprotocol/servers', 'Model Context Protocol servers.', 'TypeScript', ['mcp', 'agents', 'ai'], 73500, 8500, 3300, 560, '2024-11-25', true],
  ['turborepo/turborepo', 'The build system optimized for JavaScript and TypeScript.', 'TypeScript', ['monorepo', 'build'], 29200, 2100, 380, 60, '2021-04-18', false],
  ['browser-use/browser-use', 'Make websites accessible for AI agents.', 'Python', ['agents', 'browser-automation', 'ai'], 70100, 8200, 3660, 480, '2024-10-20', true],
  ['a2a-project/A2A', 'An open protocol for agent-to-agent communication.', 'Python', ['agents', 'protocol', 'ai'], 18300, 1900, 1550, 180, '2026-07-03', true]
];

export async function seedDemo() {
  const existing = await one('SELECT COUNT(*)::int AS n FROM repos');
  if (asNumber(existing?.n)) return;
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2));
  if (base > now) base.setUTCDate(base.getUTCDate() - 1);
  for (let i = 0; i < samples.length; i++) {
    const id = i + 1;
    const [name, description, language, topics, stars, forks, daily, forkDaily, created] = samples[i];
    await query(
      `INSERT INTO repos (id, full_name, description, language, topics, stars, forks, created_at, pushed_at, updated_at, source)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,'demo')`,
      [id, name, description, language, JSON.stringify(topics), stars, forks, created + 'T00:00:00Z', new Date(now.getTime() - (i % 4) * 86400000).toISOString(), base.toISOString()]
    );
    const starBack = [0];
    const forkBack = [0];
    for (let age = 1; age <= 32; age++) {
      const factor = 0.78 + 0.26 * Math.sin((age + i) * 0.83) ** 2 + 0.15 * Math.cos((age + i) * 0.47);
      starBack[age] = starBack[age - 1] + Math.round(daily * factor);
      forkBack[age] = forkBack[age - 1] + Math.round(forkDaily * (0.8 + 0.2 * Math.sin((age + i) * 0.62) ** 2));
    }
    const snapshotRows = [];
    const metricRows = [];
    for (let age = 32; age >= 0; age--) {
      const at = new Date(base.getTime() - age * 86400000);
      const dayStars = Math.max(0, stars - starBack[age]);
      const dayForks = Math.max(0, forks - forkBack[age]);
      const prevStars = age === 32 ? dayStars : Math.max(0, stars - starBack[age + 1]);
      snapshotRows.push({ at: at.toISOString(), dayStars, dayForks });
      metricRows.push({ day: at.toISOString().slice(0, 10), dayStars, dayForks, created: dayStars - prevStars });
    }
    for (const group of chunk(snapshotRows, 33)) {
      const args = [];
      const placeholders = group.map((row, i) => {
        const o = i * 5;
        args.push(id, row.at, row.dayStars, row.dayForks, 'demo');
        return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5})`;
      });
      await query(`INSERT INTO snapshots (repo_id, sampled_at, stars, forks, source) VALUES ${placeholders.join(',')}`, args);
    }
    for (const group of chunk(metricRows, 33)) {
      const args = [];
      const placeholders = group.map((row, i) => {
        const o = i * 6;
        args.push(id, row.day, 'demo', row.dayStars, row.dayForks, row.created);
        return `($${o + 1},$${o + 2}::date,$${o + 3},$${o + 4},$${o + 5},$${o + 6})`;
      });
      await query(
        `INSERT INTO daily_metrics (repo_id, day, source, stars, forks, star_created) VALUES ${placeholders.join(',')}
         ON CONFLICT (repo_id, day, source) DO UPDATE SET stars=EXCLUDED.stars, forks=EXCLUDED.forks, star_created=EXCLUDED.star_created`,
        args
      );
    }
  }
}

export async function expandStarHistoryToDaily(repoId = null) {
  const rows = repoId == null
    ? await many('SELECT repo_id, week_start, days_json FROM star_history')
    : await many('SELECT repo_id, week_start, days_json FROM star_history WHERE repo_id=$1', [repoId]);
  const values = [];
  for (const row of rows) {
    const days = asJson(row.days_json, []);
    const weekStart = Number(row.week_start);
    days.forEach((count, i) => {
      values.push({
        repo_id: asNumber(row.repo_id),
        day: new Date((weekStart + i * 86400) * 1000).toISOString().slice(0, 10),
        count: Number(count) || 0
      });
    });
  }
  for (const group of chunk(values, 150)) {
    const args = [];
    const placeholders = group.map((row, i) => {
      const o = i * 4;
      args.push(row.repo_id, row.day, 'github', row.count);
      return `($${o + 1},$${o + 2}::date,$${o + 3},$${o + 4})`;
    });
    await query(
      `INSERT INTO daily_metrics (repo_id, day, source, star_created)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (repo_id, day, source) DO UPDATE SET star_created=EXCLUDED.star_created`,
      args
    );
  }
  const params = repoId == null ? [] : [repoId];
  const repoFilter = repoId == null ? '' : 'AND d.repo_id=$1';
  await query(
    `UPDATE daily_metrics d
     SET stars = GREATEST(0, r.stars - COALESCE((
       SELECT SUM(x.star_created) FROM daily_metrics x
       WHERE x.repo_id=d.repo_id AND x.source=d.source AND x.day > d.day AND x.star_created IS NOT NULL
     ), 0))
     FROM repos r
     WHERE r.id=d.repo_id AND d.source='github' ${repoFilter}`,
    params
  );
}

export async function applySnapshotsToDaily() {
  await query(`
    INSERT INTO daily_metrics (repo_id, day, source, stars, forks)
    SELECT repo_id, (timezone('UTC', sampled_at))::date, source, stars, forks
    FROM snapshots
    ON CONFLICT (repo_id, day, source) DO UPDATE SET
      forks=EXCLUDED.forks,
      stars=COALESCE(daily_metrics.stars, EXCLUDED.stars)
  `);
}

export async function rebuildPeriodMetrics() {
  const source = dataSource();
  const latestRow = await one('SELECT MAX(sampled_at) AS t FROM snapshots WHERE source=$1', [source]);
  const endpoint = latestRow?.t ? new Date(latestRow.t) : new Date();
  const live = source === 'github';
  const currentDay = utcDay(endpoint);
  for (const [period, days] of Object.entries(DAYS)) {
    const startDate = live
      ? new Date(currentDay.getTime() - (days - 1) * 86400000)
      : new Date(endpoint.getTime() - days * 86400000);
    const snapshotStart = new Date(endpoint.getTime() - days * 86400000);
    const previous = new Date(snapshotStart.getTime() - days * 86400000);
    const windowEnd = live ? currentDay : endpoint;
    const start = startDate.toISOString().slice(0, 10);
    const end = windowEnd.toISOString().slice(0, 10);
    await query('DELETE FROM period_metrics WHERE period=$1 AND source=$2', [period, source]);
    await query(
      `INSERT INTO period_metrics (
         repo_id, period, source, window_start, window_end,
         gain, fork_gain, prev_gain, anomaly, sampled_at
       )
       SELECT
         r.id, $1, $2, $3::date, $4::date,
         CASE WHEN $8 THEN created_gain.gain ELSE snap.gain END,
         snap.fork_gain,
         CASE WHEN $8 THEN prev_created.gain ELSE snap.prev_gain END,
         (
           (CASE WHEN $8 THEN created_gain.gain ELSE snap.gain END) IS NOT NULL
           AND (CASE WHEN $8 THEN prev_created.gain ELSE snap.prev_gain END) IS NOT NULL
           AND (CASE WHEN $8 THEN created_gain.gain ELSE snap.gain END)
             > GREATEST(100, (CASE WHEN $8 THEN prev_created.gain ELSE snap.prev_gain END) * 3)
         ),
         snap.sampled_at
       FROM repos r
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN (
             SELECT COUNT(*) FROM generate_series($3::date, $4::date, interval '1 day') g(day)
             WHERE r.created_at IS NULL OR g.day >= (timezone('UTC', r.created_at))::date
           ) = (
             SELECT COUNT(*) FROM daily_metrics d
             WHERE d.repo_id=r.id AND d.source=$2 AND d.star_created IS NOT NULL
               AND d.day BETWEEN $3::date AND $4::date
               AND (r.created_at IS NULL OR d.day >= (timezone('UTC', r.created_at))::date)
           )
           THEN COALESCE((
             SELECT SUM(d.star_created) FROM daily_metrics d
             WHERE d.repo_id=r.id AND d.source=$2 AND d.day BETWEEN $3::date AND $4::date
           ), 0)
         END AS gain
       ) created_gain ON TRUE
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN (
             SELECT COUNT(*) FROM generate_series(($3::date - $9::int), ($3::date - 1), interval '1 day') g(day)
             WHERE r.created_at IS NULL OR g.day >= (timezone('UTC', r.created_at))::date
           ) = (
             SELECT COUNT(*) FROM daily_metrics d
             WHERE d.repo_id=r.id AND d.source=$2 AND d.star_created IS NOT NULL
               AND d.day BETWEEN ($3::date - $9::int) AND ($3::date - 1)
               AND (r.created_at IS NULL OR d.day >= (timezone('UTC', r.created_at))::date)
           )
           THEN COALESCE((
             SELECT SUM(d.star_created) FROM daily_metrics d
             WHERE d.repo_id=r.id AND d.source=$2 AND d.day BETWEEN ($3::date - $9::int) AND ($3::date - 1)
           ), 0)
         END AS gain
       ) prev_created ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           CASE WHEN latest.stars IS NOT NULL AND first.stars IS NOT NULL THEN latest.stars - first.stars END AS gain,
           CASE WHEN latest.forks IS NOT NULL AND first.forks IS NOT NULL THEN latest.forks - first.forks END AS fork_gain,
           CASE WHEN first.stars IS NOT NULL AND prev.stars IS NOT NULL THEN first.stars - prev.stars END AS prev_gain,
           latest.sampled_at
         FROM (
           SELECT stars, forks, sampled_at FROM snapshots
           WHERE repo_id=r.id AND source=$2
             AND sampled_at BETWEEN $5::timestamptz - interval '6 hours' AND $5::timestamptz + interval '6 hours'
           ORDER BY ABS(EXTRACT(EPOCH FROM (sampled_at - $5::timestamptz)))
           LIMIT 1
         ) latest
         LEFT JOIN LATERAL (
           SELECT stars, forks FROM snapshots
           WHERE repo_id=r.id AND source=$2
             AND sampled_at BETWEEN $6::timestamptz - interval '6 hours' AND $6::timestamptz + interval '6 hours'
           ORDER BY ABS(EXTRACT(EPOCH FROM (sampled_at - $6::timestamptz)))
           LIMIT 1
         ) first ON TRUE
         LEFT JOIN LATERAL (
           SELECT stars FROM snapshots
           WHERE repo_id=r.id AND source=$2
             AND sampled_at BETWEEN $7::timestamptz - interval '6 hours' AND $7::timestamptz + interval '6 hours'
           ORDER BY ABS(EXTRACT(EPOCH FROM (sampled_at - $7::timestamptz)))
           LIMIT 1
         ) prev ON TRUE
       ) snap ON TRUE
       WHERE r.deleted=FALSE AND r.archived=FALSE AND r.source=$2`,
      [period, source, start, end, endpoint.toISOString(), snapshotStart.toISOString(), previous.toISOString(), live, days]
    );
  }
}

export async function rebuildDerivedMetrics() {
  if (dataSource() === 'github') await expandStarHistoryToDaily();
  await applySnapshotsToDaily();
  await rebuildPeriodMetrics();
}

export async function closeDb() {
  if (adapter) await adapter.close();
  adapter = null;
}
