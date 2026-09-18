import {
  asDay, asIso, asJson, asNumber, dataSource, DAYS, lastCompleteDay, many, one, utcDay
} from './db.js';
import { normalizeTopics, topicFilterValues } from '../shared/topics.js';
import { normalizeUseCase, OFFICIAL_ORGS } from '../shared/taxonomy.js';

export const boards = {
  hot: { zh: '近期热门', en: 'Trending now', metric: 'score' },
  rising: { zh: '升星最快', en: 'Fastest rising', metric: 'gain' },
  new: { zh: '新秀项目', en: 'Newcomers', metric: 'gain' },
  ai: { zh: 'AI 热门', en: 'AI & agents', metric: 'score' },
  topics: { zh: '语言 / 主题', en: 'Language & topics', metric: 'score' },
  stars: { zh: '总星数', en: 'All-time stars', metric: 'stars' },
  forks: { zh: 'Fork 最多', en: 'Most forked', metric: 'forks' }
};

const aiTerms = ['ai', 'llm', 'agent', 'agents', 'inference', 'rag', 'machine-learning', 'model', 'mcp'];

function filterValues(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap(item => String(item ?? '').split(',')).map(item => item.trim()).filter(Boolean))];
}

export function aiEvidence(repo) {
  const topics = Array.isArray(repo.topics) ? repo.topics : asJson(repo.topics, []);
  const topicEvidence = topics
    .filter(x => aiTerms.some(y => {
      const value = String(x).toLowerCase();
      return value === y || value.includes(`${y}-`) || value.includes(`-${y}`);
    }))
    .map(x => `topic:${x}`);
  const description = String(repo.description || '');
  const match = description.match(/\b(ai|llm|agents?|inference|rag|machine learning|model|mcp)\b/i);
  return [...topicEvidence, ...(match ? [`description:${match[0]}`] : [])];
}

function pctExpr(orderSql) {
  return `CASE WHEN COUNT(*) OVER() <= 1 THEN 0
    ELSE (CUME_DIST() OVER (ORDER BY ${orderSql}) * COUNT(*) OVER() - 1) / (COUNT(*) OVER() - 1) * 100
  END`;
}

function rankingCte(params, { board, language, languages, topic, topics, q, age, endpoint, useCase, official }) {
  let sql = `
    WITH base AS (
      SELECT
        r.id, r.full_name, r.description, r.language, r.topics, r.stars, r.forks,
        r.created_at, r.pushed_at, r.updated_at, r.archived, r.deleted, r.source, r.use_case,
        p.gain, p.fork_gain, p.prev_gain, p.anomaly, p.sampled_at,
        CASE WHEN r.created_at IS NULL THEN NULL ELSE GREATEST(0, EXTRACT(EPOCH FROM ($3::timestamptz - r.created_at)) / 86400) END AS age_days,
        CASE WHEN r.pushed_at IS NULL THEN NULL ELSE GREATEST(0, EXTRACT(EPOCH FROM ($3::timestamptz - r.pushed_at)) / 86400) END AS push_days
      FROM repos r
      LEFT JOIN period_metrics p
        ON p.repo_id = r.id AND p.period = $2 AND p.source = $1
      WHERE r.deleted = FALSE AND r.archived = FALSE AND r.active = TRUE AND r.source = $1
    ), filtered AS (
      SELECT * FROM base r WHERE TRUE`;

  if (useCase) {
    params.push(normalizeUseCase(useCase));
    sql += ` AND r.use_case = $${params.length}`;
  }
  if (official === '1' || official === 'true') {
    params.push([...OFFICIAL_ORGS]);
    sql += ` AND lower(split_part(r.full_name,'/',1)) = ANY($${params.length}::text[])`;
  }
  const languageValues = filterValues(languages?.length ? languages : language);
  if (languageValues.length === 1) {
    params.push(languageValues[0]);
    sql += ` AND lower(r.language) = lower($${params.length})`;
  } else if (languageValues.length > 1) {
    params.push(JSON.stringify(languageValues));
    sql += ` AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text($${params.length}::jsonb) l(lang)
      WHERE lower(r.language) = lower(l.lang)
    )`;
  }
  const topicValues = topicFilterValues(topics?.length ? topics : topic);
  if (topicValues.length === 1) {
    params.push(topicValues[0]);
    sql += ` AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(r.topics) t(topic)
      WHERE canonical_topic(t.topic) = $${params.length}
    )`;
  } else if (topicValues.length > 1) {
    params.push(JSON.stringify(topicValues));
    sql += ` AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(r.topics) t(topic)
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements_text($${params.length}::jsonb) f(value)
        WHERE canonical_topic(t.topic) = f.value
      )
    )`;
  }
  if (q) {
    params.push(q);
    sql += ` AND (
      r.full_name ILIKE '%' || $${params.length} || '%'
      OR COALESCE(r.description, '') ILIKE '%' || $${params.length} || '%'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(r.topics) t(topic)
        WHERE t.topic ILIKE '%' || $${params.length} || '%'
      )
    )`;
  }
  if (age) {
    params.push(Number(age));
    sql += ` AND r.age_days <= $${params.length}`;
  }
  if (board === 'new') {
    sql += ` AND r.age_days <= 90 AND r.stars >= 20`;
  }
  if (board === 'ai') {
    params.push(JSON.stringify(aiTerms));
    sql += ` AND (
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(r.topics) t(topic)
        CROSS JOIN jsonb_array_elements_text($${params.length}::jsonb) term
        WHERE lower(t.topic) = lower(term)
           OR lower(t.topic) LIKE lower(term) || '-%'
           OR lower(t.topic) LIKE '%-' || lower(term)
      )
      OR COALESCE(r.description, '') ~* '\\y(ai|llm|agents?|inference|rag|machine learning|model|mcp)\\y'
    )`;
  }

  sql += `
    ),
    valid AS (
      SELECT * FROM base WHERE gain IS NOT NULL AND anomaly IS NOT TRUE
    ),
    ranked AS (
      SELECT
        v.id,
        ${pctExpr('LN(1 + GREATEST(0, v.gain))')} AS star_pct,
        ${pctExpr('GREATEST(0, v.gain) / (GREATEST(0, v.stars - v.gain) + 100.0)')} AS rate_pct,
        ${pctExpr('LN(1 + GREATEST(0, COALESCE(v.fork_gain, 0)))')} AS fork_pct
      FROM valid v
    ),
    meta AS (
      SELECT
        (SELECT COUNT(*)::int FROM filtered) AS candidate_count,
        (SELECT COUNT(*)::int FROM filtered WHERE gain IS NOT NULL AND anomaly IS NOT TRUE) AS valid_count,
        (SELECT COUNT(*)::int FROM repos WHERE deleted = FALSE AND archived = FALSE AND active = TRUE AND source = $1) AS universe,
        COALESCE((SELECT BOOL_AND(fork_gain IS NOT NULL) FROM valid), FALSE) AS fork_ready
    ),
    scored AS (
      SELECT
        f.*,
        CASE
          WHEN f.gain IS NULL OR f.anomaly IS TRUE THEN NULL
          ELSE ROUND(
            (
              0.45 * COALESCE(r.star_pct, 0)
              + 0.20 * COALESCE(r.rate_pct, 0)
              + CASE WHEN m.fork_ready THEN 0.15 * COALESCE(r.fork_pct, 0) ELSE 0 END
              + 0.20 * CASE WHEN f.push_days IS NULL THEN 0 ELSE GREATEST(0, 100 - f.push_days * 8) END
            ) / CASE WHEN m.fork_ready THEN 1.0 ELSE 0.85 END
          )
        END AS score,
        m.fork_ready,
        m.candidate_count,
        m.valid_count,
        m.universe
      FROM base f
      LEFT JOIN ranked r ON r.id = f.id
      CROSS JOIN meta m
    )`;

  void endpoint;
  return sql;
}

function mapItem(row, rank) {
  const topics = asJson(row.topics, []);
  return {
    id: asNumber(row.id),
    use_case: row.use_case,
    full_name: row.full_name,
    description: row.description,
    language: row.language,
    topics: normalizeTopics(topics).slice(0, 5),
    stars: asNumber(row.stars),
    forks: asNumber(row.forks),
    created_at: asIso(row.created_at),
    pushed_at: asIso(row.pushed_at),
    updated_at: asIso(row.updated_at),
    archived: Boolean(row.archived),
    deleted: Boolean(row.deleted),
    source: row.source,
    sampledAt: asIso(row.sampled_at),
    gain: asNumber(row.gain),
    forkGain: asNumber(row.fork_gain),
    prevGain: asNumber(row.prev_gain),
    anomaly: Boolean(row.anomaly),
    ageDays: asNumber(row.age_days),
    pushDays: asNumber(row.push_days),
    score: asNumber(row.score),
    aiEvidence: aiEvidence({ topics, description: row.description }),
    rank,
    url: `https://github.com/${row.full_name}`
  };
}

export async function getStarSeries(repoId, endpoint, days, createdAt) {
  const latest = await one('SELECT MAX(sampled_at) AS t FROM star_history WHERE repo_id = $1', [repoId]);
  if (!latest?.t) return { complete: false, points: [] };
  if (new Date(latest.t).getTime() < endpoint.getTime() - 6 * 3600000) return { complete: false, points: [] };

  const endDate = utcDay(endpoint);
  const startDate = new Date(endDate.getTime() - (days - 1) * 86400000);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);
  const rows = await many(
    `SELECT day, star_created FROM daily_metrics
     WHERE repo_id = $1 AND source = 'github' AND day BETWEEN $2::date AND $3::date`,
    [repoId, start, end]
  );
  const byDate = new Map(rows.map(r => [asDay(r.day), asNumber(r.star_created)]));
  const points = Array.from({ length: days }, (_, i) => {
    const date = new Date(startDate.getTime() + i * 86400000).toISOString().slice(0, 10);
    return { date, count: byDate.has(date) ? byDate.get(date) : null };
  });
  const created = createdAt ? new Date(createdAt).toISOString().slice(0, 10) : null;
  const complete = points.every(p => p.count !== null || (created && p.date < created));
  return {
    complete,
    points: points.map(p => ({ ...p, count: p.count ?? (created && p.date < created ? 0 : null) }))
  };
}

export async function getFilters() {
  const source = dataSource();
  const languages = await many(
    `SELECT language AS name, COUNT(*)::int AS count
     FROM repos
     WHERE deleted = FALSE AND archived = FALSE AND active = TRUE AND source = $1
       AND language IS NOT NULL AND language <> ''
     GROUP BY language
     ORDER BY count DESC, language
     LIMIT 20`,
    [source]
  );
  const topics = await many(
    `SELECT canonical_topic(topic) AS name, COUNT(DISTINCT r.id)::int AS count
     FROM repos r, LATERAL jsonb_array_elements_text(r.topics) AS topic
     WHERE r.deleted = FALSE AND r.archived = FALSE AND r.active = TRUE AND r.source = $1 AND canonical_topic(topic) <> ''
     GROUP BY canonical_topic(topic)
     ORDER BY count DESC, name
     LIMIT 20`,
    [source]
  );
  return {
    languages: languages.map(r => r.name),
    topics: topics.map(r => r.name)
  };
}

export async function getRankings({
  board = 'hot', period = 'week', language = '', languages = [], topic = '', topics = [], age = '', q = '', page = 1, limit = 10, useCase = '', use_case = '', official = ''
} = {}, { all = false } = {}) {
  if (!boards[board]) board = 'hot';
  if (!DAYS[period]) period = 'week';
  const source = dataSource();
  const latestRow = await one('SELECT MAX(sampled_at) AS t FROM snapshots WHERE source = $1', [source]);
  const latestTime = latestRow?.t || null;
  const endpoint = latestTime ? new Date(latestTime) : new Date();
  const live = source === 'github';
  const currentDay = live ? lastCompleteDay(endpoint) : utcDay(endpoint);
  const days = DAYS[period];
  const start = live
    ? new Date(currentDay.getTime() - (days - 1) * 86400000)
    : new Date(endpoint.getTime() - days * 86400000);
  const safePage = Math.max(1, Math.min(1000, Number(page) || 1));
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const offset = all ? 0 : (safePage - 1) * safeLimit;
  const metric = boards[board].metric;
  const params = [source, period, endpoint.toISOString()];
  const cte = rankingCte(params, { board, language, languages, topic, topics, q, age, endpoint, useCase: useCase || use_case, official });
  const extra = metric === 'score'
    ? 's.score IS NOT NULL'
    : metric === 'gain'
      ? 's.gain IS NOT NULL AND s.anomaly IS NOT TRUE'
      : 'TRUE';
  const orderExpr = {
    score: 's.score DESC NULLS LAST, s.stars DESC',
    gain: 's.gain DESC NULLS LAST, s.stars DESC',
    stars: 's.stars DESC',
    forks: 's.forks DESC'
  }[metric];

  const filterParams = [...params];
  params.push(safeLimit, offset);
  const rows = await many(
    `${cte}
     SELECT s.*, COUNT(*) OVER() AS result_total
     FROM scored s
     JOIN filtered view_rows ON view_rows.id = s.id
     WHERE ${extra}
     ORDER BY ${orderExpr}
     ${all ? '' : `LIMIT $${params.length - 1} OFFSET $${params.length}`}`,
    all ? filterParams : params
  );

  let candidateCount = asNumber(rows[0]?.candidate_count);
  let forkReady = Boolean(rows[0]?.fork_ready);
  let universe = asNumber(rows[0]?.universe);
  let validCount = asNumber(rows[0]?.valid_count);
  const total = asNumber(rows[0]?.result_total) || 0;

  if (!rows.length) {
    const meta = await one(`${cte} SELECT * FROM meta`, filterParams);
    candidateCount = asNumber(meta?.candidate_count) || 0;
    forkReady = Boolean(meta?.fork_ready);
    universe = asNumber(meta?.universe) || 0;
    validCount = asNumber(meta?.valid_count) || 0;
  }

  return {
    board,
    period,
    items: rows.map((row, i) => mapItem(row, offset + i + 1)),
    total,
    page: safePage,
    limit: safeLimit,
    dataInsufficient: candidateCount > 0 && total === 0,
    updatedAt: asIso(latestTime),
    stale: !latestTime || Date.now() - new Date(latestTime).getTime() > 36 * 3600000,
    windowStart: start.toISOString(),
    timezone: live ? 'GitHub calendar days' : 'UTC',
    source: source === 'demo' ? 'demo' : 'GitHub REST API',
    sample: !live,
    growthBasis: live ? 'star_created' : 'snapshot_net',
    forkComponent: forkReady,
    scoreScope: 'type-period',
    coverage: universe ? Math.round(100 * validCount / universe) : 0
  };
}

export async function getChart(query, sampleOverride = null) {
  const sample = sampleOverride || await getRankings({ ...query, limit: 50, page: 1 });
  const ranking = { ...sample, items: sample.items.slice(0, 5), limit: 5 };
  const languageCounts = new Map();
  for (const item of sample.items) {
    const language = item.language || 'Other';
    languageCounts.set(language, (languageCounts.get(language) || 0) + 1);
  }
  const sortedLanguages = [...languageCounts].sort((a, b) => b[1] - a[1]);
  const languages = sortedLanguages.slice(0, 5).map(([name, count]) => ({ name, count }));
  const remainder = sortedLanguages.slice(5).reduce((sum, [, count]) => sum + count, 0);
  if (remainder) languages.push({ name: 'Other', count: remainder });

  const source = dataSource();
  const start = new Date(ranking.windowStart).getTime();
  const end = ranking.updatedAt ? new Date(ranking.updatedAt).getTime() : Date.now();
  let metric = 'gain';
  let bars = ranking.items
    .filter(r => r.gain !== null && !r.anomaly)
    .map(r => ({ id: r.id, name: r.full_name, value: r.gain, rank: r.rank }));
  if (!bars.length && (ranking.board === 'stars' || ranking.board === 'forks')) {
    metric = ranking.board;
    bars = ranking.items.map(r => ({ id: r.id, name: r.full_name, value: r[metric], rank: r.rank }));
  }
  const requested = query.id == null || query.id === '' ? null : String(query.id);
  const chosen = requested
    ? sample.items.find(item => String(item.id) === requested || String(item.slug || '') === requested)
    : null;
  const leader = metric === 'gain'
    ? (chosen && chosen.gain != null && !chosen.anomaly
      ? { id: chosen.id, name: chosen.full_name, value: chosen.gain, rank: chosen.rank }
      : bars[0] || null)
    : null;
  let points = [];
  if (leader) {
    const days = DAYS[ranking.period];
    if (ranking.growthBasis === 'star_created') {
      const repo = await one('SELECT created_at FROM repos WHERE id = $1', [leader.id]);
      const series = await getStarSeries(leader.id, dataSource() === 'github' ? lastCompleteDay(new Date(ranking.updatedAt)) : new Date(ranking.updatedAt), days, repo?.created_at);
      if (series.complete) {
        let cumulative = 0;
        points = [
          { date: new Date(Date.parse(series.points[0].date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10), gain: 0 },
          ...series.points.map(p => ({ date: p.date, gain: cumulative += p.count }))
        ];
      }
    } else {
      const first = await one(
        `SELECT stars, sampled_at FROM snapshots
         WHERE repo_id = $1 AND source = $2
         ORDER BY ABS(EXTRACT(EPOCH FROM (sampled_at - $3::timestamptz)))
         LIMIT 1`,
        [leader.id, source, ranking.windowStart]
      );
      if (first && Math.abs(new Date(first.sampled_at).getTime() - start) <= 6 * 3600000) {
        const snapshots = await many(
          `SELECT sampled_at, stars FROM snapshots
           WHERE repo_id = $1 AND source = $2 AND sampled_at >= $3 AND sampled_at <= $4
           ORDER BY sampled_at`,
          [
            leader.id,
            source,
            new Date(start - 6 * 3600000).toISOString(),
            new Date(end + 6 * 3600000).toISOString()
          ]
        );
        points = Array.from({ length: days + 1 }, (_, i) => {
          const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
          const snapshot = snapshots.find(x => asIso(x.sampled_at).slice(0, 10) === date);
          return { date, gain: snapshot ? asNumber(snapshot.stars) - asNumber(first.stars) : null };
        });
      }
    }
  }

  return {
    board: ranking.board,
    period: ranking.period,
    source: ranking.source,
    growthBasis: ranking.growthBasis,
    updatedAt: ranking.updatedAt,
    leader: leader?.name || null,
    metric,
    bars,
    points,
    languages,
    languageSampleCount: sample.items.length,
    insufficient: points.filter(x => x.gain !== null).length < 2
  };
}
