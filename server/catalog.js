import { asDay, asIso, asJson, asNumber, dataSource, DAYS, many, one, query, utcDay } from './db.js';
import { aiEvidence, getChart as getRepoChart, getFilters as getRepoFilters, getRankings as getRepoRankings, getStarSeries } from './rankings.js';

export const TYPES = ['skill', 'plugin', 'agent', 'components', 'website', 'github-repo'];
export const TYPE_META = {
  skill: { zh: 'Skill', en: 'Skills', unitZh: '个 skill', unitEn: 'skills' },
  plugin: { zh: '插件 / MCP', en: 'Plugins', unitZh: '个插件', unitEn: 'plugins' },
  agent: { zh: 'Agent', en: 'Agents', unitZh: '个 agent', unitEn: 'agents' },
  components: { zh: '组件', en: 'Components', unitZh: '个组件', unitEn: 'components' },
  website: { zh: '网站', en: 'Websites', unitZh: '个网站', unitEn: 'websites' },
  'github-repo': { zh: '仓库', en: 'Repositories', unitZh: '个仓库', unitEn: 'repositories' }
};
export const ASSET_BOARDS = {
  hot: { zh: '近期热门', en: 'Trending now', metric: 'score' },
  rising: { zh: '升得最快', en: 'Fastest rising', metric: 'gain' },
  new: { zh: '新秀', en: 'Newcomers', metric: 'gain' },
  official: { zh: '官方', en: 'Official', metric: 'score' },
  stars: { zh: '关注最多', en: 'Most starred', metric: 'stars' }
};

const OFFICIAL_ORGS = new Set([
  'microsoft', 'vercel', 'anthropics', 'openai', 'modelcontextprotocol',
  'shadcn-ui', 'langchain-ai', 'ollama', 'supabase', 'astral-sh'
]);

const catalogItems = [
  ['skill', 'anthropic-pdf', 'pdf', 'PDF', 'PDF', 'anthropics/pdf', 'Anthropic document skill for reading and writing PDFs.', true, 'anthropics/skills · document-skills', 'skill:pdf', 'https://github.com/anthropics/skills', '/plugin install document-skills@anthropic-agent-skills', 'Markdown', ['pdf', 'documents'], 18400, 920, 210, '2025-10-18', 1, '官方文档 skill，适合生产。', 'Official document skill; start here for production.'],
  ['skill', 'pdf-extract-pro', 'pdf', 'PDF', 'PDF', 'community/pdf-extract-pro', 'Community PDF extractor with table and OCR helpers.', false, null, 'skill:pdf', 'https://github.com/anthropics/skills', 'Copy SKILL.md into ~/.claude/skills/pdf-extract-pro', 'Python', ['pdf', 'ocr'], 4200, 310, 280, '2026-03-02', 2, '社区实现，表格和 OCR 更勤。', 'Community build; faster on tables and OCR.'],
  ['skill', 'pdf-skills-fork', 'pdf', 'PDF', 'PDF', 'copies/pdf-skill', 'Republished PDF skill with the same SKILL.md name.', false, null, 'skill:pdf', 'https://github.com/anthropics/skills', null, 'Markdown', ['pdf'], 900, 40, 40, '2026-08-12', null, null, null],
  ['skill', 'frontend-design', 'frontend', '前端', 'Frontend', 'anthropics/frontend-design', 'UI implementation skill for distinctive, production-grade interfaces.', true, 'anthropics/skills', 'skill:frontend', 'https://github.com/anthropics/skills', '/plugin install example-skills@anthropic-agent-skills', 'Markdown', ['frontend', 'design'], 22100, 1100, 340, '2025-10-18', 1, '官方前端 skill，先看这个。', 'Official frontend skill; the default option.'],
  ['skill', 'shadcn-ui-skill', 'frontend', '前端', 'Frontend', 'community/shadcn-ui-skill', 'Install and compose shadcn/ui from a SKILL.md.', false, null, 'skill:frontend', 'https://ui.shadcn.com', 'Copy SKILL.md into ~/.claude/skills/shadcn-ui', 'TypeScript', ['shadcn', 'react'], 6100, 480, 190, '2026-01-20', 2, '更贴近 shadcn CLI，组件向。', 'Closer to the shadcn CLI if you already use it.'],
  ['skill', 'git-commit', 'git', 'Git', 'Git', 'community/git-commit', 'Conventional commit messages from the current diff.', false, null, 'skill:git', 'https://github.com/anthropics/skills', 'Copy SKILL.md into ~/.claude/skills/git-commit', 'Markdown', ['git'], 3800, 220, 95, '2025-12-02', 1, '写 commit message 用这个就够。', 'Enough if you only want commit messages.'],
  ['skill', 'git-safety', 'git', 'Git', 'Git', 'community/git-safety', 'Guardrails before force-push, rebase, and history rewrite.', false, null, 'skill:git', 'https://github.com/anthropics/skills', 'Copy SKILL.md into ~/.claude/skills/git-safety', 'Markdown', ['git', 'safety'], 2100, 90, 70, '2026-04-11', 2, '更保守，适合共享仓库。', 'More conservative; better on shared repos.'],
  ['skill', 'xlsx-anthropic', 'docs', '文档', 'Docs', 'anthropics/xlsx', 'Official spreadsheet skill used in Claude document workflows.', true, 'anthropics/skills · document-skills', 'skill:docs', 'https://github.com/anthropics/skills', '/plugin install document-skills@anthropic-agent-skills', 'Markdown', ['xlsx', 'documents'], 15200, 700, 160, '2025-10-18', 1, '官方表格 skill。', 'Official spreadsheet skill.'],
  ['plugin', 'postgres-official', 'postgres', 'Postgres', 'Postgres', 'modelcontextprotocol/postgres', 'Reference Postgres MCP server from the protocol authors.', true, 'Official MCP Registry · modelcontextprotocol', 'plugin:postgres', 'https://github.com/modelcontextprotocol/servers', 'claude mcp add postgres', 'TypeScript', ['mcp', 'postgres'], 73500, 8500, 420, '2024-11-25', 1, '官方参考实现，生产默认。', 'Official reference; default for production.'],
  ['plugin', 'supabase-mcp', 'postgres', 'Postgres', 'Postgres', 'supabase/mcp', 'Vendor MCP for Supabase projects, auth, and SQL.', true, 'Vendor org supabase', 'plugin:postgres', 'https://github.com/supabase/mcp', 'npx @supabase/mcp-server', 'TypeScript', ['mcp', 'supabase'], 12800, 940, 310, '2025-06-08', 2, '已经用 Supabase 就选厂商源。', 'Pick this if you already run Supabase.'],
  ['plugin', 'postgres-community', 'postgres', 'Postgres', 'Postgres', 'community/pg-mcp-plus', 'Community Postgres MCP with extra inspect tools.', false, null, 'plugin:postgres', 'https://github.com/modelcontextprotocol/servers', 'npx postgres-mcp-plus', 'TypeScript', ['mcp', 'postgres'], 2400, 180, 90, '2026-02-14', 3, '工具更多，维护不如官方勤。', 'More tools; less consistent maintenance.'],
  ['plugin', 'playwright-mcp', 'browser', '浏览器', 'Browser', 'microsoft/playwright-mcp', 'Official Playwright MCP for browser automation.', true, 'microsoft org · Playwright', 'plugin:browser', 'https://github.com/microsoft/playwright-mcp', 'npx @playwright/mcp', 'TypeScript', ['mcp', 'playwright'], 18900, 1600, 360, '2025-03-22', 1, '微软官方，自动化默认。', 'Microsoft official; default for automation.'],
  ['plugin', 'browser-use-mcp', 'browser', '浏览器', 'Browser', 'browser-use/mcp', 'Natural-language browser agent exposed as MCP.', false, null, 'plugin:browser', 'https://github.com/browser-use/browser-use', 'uvx browser-use-mcp', 'Python', ['mcp', 'agents'], 70100, 8200, 510, '2024-10-20', 2, '更偏 agent，安装更重。', 'More agent-like; heavier install.'],
  ['plugin', 'github-mcp', 'github', 'GitHub', 'GitHub', 'github/github-mcp-server', 'Official GitHub MCP for issues, PRs, and repos.', true, 'github org · Official Registry', 'plugin:github', 'https://github.com/github/github-mcp-server', 'claude mcp add github', 'Go', ['mcp', 'github'], 21400, 1900, 250, '2025-04-09', 1, 'GitHub 官方。', 'Official GitHub server.'],
  ['plugin', 'github-plus', 'github', 'GitHub', 'GitHub', 'community/github-mcp-plus', 'Fork of GitHub MCP with extra search tools.', false, null, 'plugin:github', 'https://github.com/github/github-mcp-server', 'npx github-mcp-plus', 'Go', ['mcp', 'github'], 1100, 80, 35, '2026-07-01', null, null, null],
  ['plugin', 'filesystem-official', 'filesystem', '文件系统', 'Filesystem', 'modelcontextprotocol/filesystem', 'Official filesystem MCP with scoped directories.', true, 'Official MCP Registry', 'plugin:filesystem', 'https://github.com/modelcontextprotocol/servers', 'claude mcp add filesystem', 'TypeScript', ['mcp', 'filesystem'], 41200, 3100, 180, '2024-11-25', 1, '官方本地文件接口。', 'Official local files interface.'],
  ['components', 'shadcn-button', 'button', '按钮', 'Button', 'shadcn/ui/button', 'Official shadcn/ui button primitive.', true, 'shadcn official registry', 'ui:button', 'https://ui.shadcn.com/docs/components/button', 'npx shadcn add button', 'TypeScript', ['shadcn', 'button'], 96200, 7100, 140, '2023-01-04', 1, '官方 primitive，应用里先用这个。', 'Official primitive; use this in app UI.'],
  ['components', 'magic-button', 'button', '按钮', 'Button', 'magic-ui/shimmer-button', 'Animated marketing button from Magic UI.', false, null, 'ui:button', 'https://magicui.design', 'npx shadcn add @magicui/shimmer-button', 'TypeScript', ['magic-ui', 'motion'], 22100, 1200, 95, '2024-06-12', 2, '营销页动效；不要当基础按钮。', 'Motion for marketing pages, not a primitive.'],
  ['components', 'button-copy-21st', 'button', '按钮', 'Button', '21st/shimmer-button', 'Registry copy of a shimmer button.', false, null, 'ui:button', 'https://21st.dev', 'npx shadcn add https://21st.dev/r/magic/shimmer-button', 'TypeScript', ['21st', 'button'], 800, 40, 20, '2026-05-03', null, null, null],
  ['components', 'shadcn-login', 'auth-form', '登录表单', 'Auth form', 'shadcn/ui/login-03', 'Official shadcn login block.', true, 'shadcn official blocks', 'ui:auth-form', 'https://ui.shadcn.com', 'npx shadcn add login-03', 'TypeScript', ['shadcn', 'auth'], 18400, 900, 70, '2025-02-11', 1, '官方登录块，字段最少。', 'Official login block; smallest surface.'],
  ['components', 'origin-login', 'auth-form', '登录表单', 'Auth form', 'origin-ui/login', 'Origin UI sign-in with social providers.', false, null, 'ui:auth-form', 'https://originui.com', 'npx shadcn add @origin/login', 'TypeScript', ['origin-ui', 'auth'], 5300, 410, 55, '2025-08-19', 2, '社交登录更全。', 'More social-provider coverage.'],
  ['components', 'magic-hero', 'hero', 'Hero', 'Hero', 'magic-ui/hero', 'Animated SaaS hero from Magic UI.', false, null, 'ui:hero', 'https://magicui.design', 'npx shadcn add @magicui/hero', 'TypeScript', ['magic-ui', 'hero'], 19800, 1500, 88, '2024-06-12', 1, '落地页默认动效 hero。', 'Default motion hero for landing pages.'],
  ['components', 'aceternity-hero', 'hero', 'Hero', 'Hero', 'aceternity/hero-highlight', 'High-contrast glow hero from Aceternity.', false, null, 'ui:hero', 'https://ui.aceternity.com', 'Copy component from Aceternity', 'TypeScript', ['aceternity', 'hero'], 16200, 980, 60, '2024-03-08', 2, '更强光影，适合展示页。', 'Heavier glow; better for showpiece pages.'],
  ['components', 'shadcn-chart', 'chart', '图表', 'Chart', 'shadcn/ui/chart', 'Official shadcn chart primitives on Recharts.', true, 'shadcn official registry', 'ui:chart', 'https://ui.shadcn.com/charts', 'npx shadcn add chart', 'TypeScript', ['shadcn', 'charts'], 12800, 740, 50, '2024-09-01', 1, '官方图表，和 shadcn token 一致。', 'Official charts; matches shadcn tokens.'],
  ['website', 'skills-sh', 'directory', '目录', 'Directory', 'vercel-labs/skills.sh', 'Install-telemetry leaderboard for agent skills.', false, null, 'site:directory', 'https://skills.sh', null, 'TypeScript', ['skills', 'leaderboard'], 876000, 0, 1200, '2025-12-01', 1, '看安装量用这个站。', 'Best for install-count leaderboards.'],
  ['website', 'claude-market', 'directory', '目录', 'Directory', 'claude-market/web', 'Searchable skill index with copyable install commands.', false, null, 'site:directory', 'https://www.claudemarket.ai', null, 'TypeScript', ['skills', 'directory'], 4300, 0, 180, '2026-01-10', 2, '按名字搜 skill 更方便。', 'Easier name search across skills.'],
  ['website', 'glama', 'directory', '目录', 'Directory', 'glama/mcp', 'Large MCP directory with quality tiers.', false, null, 'site:directory', 'https://glama.ai/mcp/servers', null, 'TypeScript', ['mcp', 'directory'], 86800, 0, 400, '2025-01-15', 3, 'MCP 覆盖最全，噪音也最大。', 'Widest MCP coverage; also the noisiest.'],
  ['website', 'smithery', 'playground', '试用', 'Playground', 'smithery/app', 'Hosted MCP playground and registry.', false, null, 'site:playground', 'https://smithery.ai', null, 'TypeScript', ['mcp', 'hosting'], 7200, 0, 90, '2025-02-20', 1, '想先试用再装，用这个。', 'Try a server before installing.'],
  ['website', 'mcp-inspector', 'playground', '试用', 'Playground', 'modelcontextprotocol/inspector', 'Official inspector for MCP servers.', true, 'modelcontextprotocol org', 'site:playground', 'https://github.com/modelcontextprotocol/inspector', 'npx @modelcontextprotocol/inspector', 'TypeScript', ['mcp', 'devtools'], 4100, 380, 40, '2024-12-04', 2, '官方调试器，不是目录。', 'Official debugger, not a directory.'],
  ['website', 'agentskills-io', 'docs', '文档', 'Docs', 'agentskills/spec', 'Agent Skills specification site.', true, 'agentskills.io spec', 'site:docs', 'https://agentskills.io', null, 'Markdown', ['skills', 'spec'], 2100, 0, 15, '2025-10-20', 1, '看规范而不是找现成 skill。', 'Read the spec, not a catalog of skills.'],
  ['agent', 'claude-code', 'coding', '编程助手', 'Coding', 'anthropics/claude-code', 'Official Claude agent for working in a real repository.', true, 'anthropics org', 'agent:coding', 'https://github.com/anthropics/claude-code', 'npm i -g @anthropic-ai/claude-code', 'TypeScript', ['agent', 'coding'], 54200, 4100, 890, '2025-02-24', 1, '官方仓库 agent，默认从这个看。', 'Official repo agent; start here.'],
  ['agent', 'aider', 'coding', '编程助手', 'Coding', 'paul-gauthier/aider', 'Terminal coding agent that commits in small diffs.', false, null, 'agent:coding', 'https://github.com/paul-gauthier/aider', 'pip install aider-chat', 'Python', ['agent', 'coding'], 38700, 3600, 420, '2023-05-01', 2, '终端里改代码、小步 commit。', 'Terminal-first; small-diff commits.'],
  ['agent', 'continue', 'coding', '编程助手', 'Coding', 'continuedev/continue', 'Open-source autocomplete and agent inside the editor.', false, null, 'agent:coding', 'https://github.com/continuedev/continue', 'Install the Continue editor extension', 'TypeScript', ['agent', 'ide'], 31200, 2800, 310, '2023-05-24', 3, '留在 IDE 里补全和改文件。', 'Stays in the editor for autocomplete and edits.'],
  ['agent', 'gpt-researcher', 'research', '研究', 'Research', 'assafelovic/gpt-researcher', 'Autonomous research agent that writes sourced reports.', false, null, 'agent:research', 'https://github.com/assafelovic/gpt-researcher', 'pip install gpt-researcher', 'Python', ['agent', 'research'], 22100, 2400, 180, '2023-06-12', 1, '要带引用的调研报告用这个。', 'Use this when you want sourced research reports.'],
  ['agent', 'storm', 'research', '研究', 'Research', 'stanford-oval/storm', 'Stanford OVAL agent for Wikipedia-style research articles.', false, null, 'agent:research', 'https://github.com/stanford-oval/storm', 'pip install knowledge-storm', 'Python', ['agent', 'research'], 16800, 1500, 95, '2024-03-01', 2, '更像长文写作，不是短报告。', 'Long-form articles, not short briefings.'],
  ['agent', 'browser-use', 'browser', '浏览器', 'Browser', 'browser-use/browser-use', 'Agent that drives a real browser from natural language.', false, null, 'agent:browser', 'https://github.com/browser-use/browser-use', 'pip install browser-use', 'Python', ['agent', 'browser'], 70100, 8200, 510, '2024-10-20', 1, '要真实点击网页就用这个。', 'Pick this when the agent must click a real browser.']
];

function isType(type) {
  return TYPES.includes(type);
}

function filterValues(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap(item => String(item ?? '').split(',')).map(item => item.trim()).filter(Boolean))];
}

function boardsFor(type) {
  return type === 'github-repo'
    ? {
      hot: { zh: '近期热门', en: 'Trending now', metric: 'score' },
      rising: { zh: '升星最快', en: 'Fastest rising', metric: 'gain' },
      new: { zh: '新秀项目', en: 'Newcomers', metric: 'gain' },
      ai: { zh: 'AI 热门', en: 'AI & agents', metric: 'score' },
      topics: { zh: '语言 / 主题', en: 'Language & topics', metric: 'score' },
      stars: { zh: '总星数', en: 'All-time stars', metric: 'stars' },
      forks: { zh: 'Fork 最多', en: 'Most forked', metric: 'forks' }
    }
    : ASSET_BOARDS;
}

function percentile(values, value) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length <= 1) return 0;
  const idx = sorted.filter(v => v <= value).length - 1;
  return (idx / (sorted.length - 1)) * 100;
}

function hotScore(item, cohort, forkReady) {
  if (item.gain == null || item.anomaly) return null;
  const gains = cohort.map(x => Math.log(1 + Math.max(0, x.gain || 0)));
  const rates = cohort.map(x => Math.max(0, x.gain || 0) / (Math.max(0, (x.stars || 0) - (x.gain || 0)) + 100));
  const forks = cohort.map(x => Math.log(1 + Math.max(0, x.forkGain || 0)));
  const starPct = percentile(gains, Math.log(1 + Math.max(0, item.gain)));
  const ratePct = percentile(rates, Math.max(0, item.gain) / (Math.max(0, item.stars - item.gain) + 100));
  const forkPct = percentile(forks, Math.log(1 + Math.max(0, item.forkGain || 0)));
  const recency = Math.max(0, 100 - (item.pushDays || 0) * 8);
  const raw = 0.45 * starPct + 0.20 * ratePct + (forkReady ? 0.15 * forkPct : 0) + 0.20 * recency;
  return Math.round(raw / (forkReady ? 1 : 0.85));
}

async function similarCounts() {
  const rows = await many(
    `SELECT cluster_id, COUNT(*)::int AS n FROM assets WHERE cluster_id IS NOT NULL GROUP BY cluster_id`
  );
  return new Map(rows.map(r => [r.cluster_id, Math.max(0, asNumber(r.n) - 1)]));
}

function mapAsset(row, extras = {}) {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    name: row.name,
    full_name: row.full_name,
    description: row.description,
    category: row.category,
    categoryLabel: { zh: row.category_zh, en: row.category_en },
    official: Boolean(row.official),
    officialEvidence: row.official_evidence,
    clusterId: row.cluster_id,
    similarCount: extras.similarCount || 0,
    url: row.url,
    install: row.install,
    language: row.language,
    topics: asJson(row.topics, []),
    stars: asNumber(row.stars) || 0,
    forks: asNumber(row.forks) || 0,
    created_at: asIso(row.created_at),
    pushed_at: asIso(row.pushed_at),
    recommendRank: asNumber(row.recommend_rank),
    recommendNote: { zh: row.recommend_note_zh, en: row.recommend_note_en },
    gain: extras.gain ?? null,
    prevGain: extras.prevGain ?? null,
    forkGain: extras.forkGain ?? null,
    anomaly: Boolean(extras.anomaly),
    score: extras.score ?? null,
    ageDays: extras.ageDays ?? 0,
    pushDays: extras.pushDays ?? 0,
    rank: extras.rank,
    sampledAt: extras.sampledAt || null
  };
}

function periodBounds(period, endpoint) {
  const days = DAYS[period] || 7;
  const end = utcDay(endpoint);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const prevStart = new Date(start.getTime() - days * 86400000);
  const prevEnd = new Date(start.getTime() - 86400000);
  return { end, start, prevStart, prevEnd };
}

async function periodStatsBatch(assetIds, period, endpoint) {
  const ids = [...new Set(assetIds.map(String).filter(Boolean))];
  if (!ids.length) return new Map();
  const { end, start, prevStart, prevEnd } = periodBounds(period, endpoint);
  const rows = await many(
    `SELECT asset_id,
       SUM(CASE WHEN day BETWEEN $4::date AND $5::date THEN COALESCE(star_created, 0) ELSE 0 END)::bigint AS gain,
       SUM(CASE WHEN day BETWEEN $2::date AND $3::date THEN COALESCE(star_created, 0) ELSE 0 END)::bigint AS prev_gain
     FROM asset_daily
     WHERE asset_id = ANY($1::text[]) AND day BETWEEN $2::date AND $5::date
     GROUP BY asset_id`,
    [
      ids,
      prevStart.toISOString().slice(0, 10),
      prevEnd.toISOString().slice(0, 10),
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10)
    ]
  );
  return new Map(rows.map(row => {
    const gain = asNumber(row.gain) || 0;
    const prevGain = asNumber(row.prev_gain) || 0;
    return [String(row.asset_id), { gain, prevGain, anomaly: prevGain > 0 && gain > prevGain * 3 && gain > 100 }];
  }));
}

async function periodStats(assetId, period, endpoint) {
  const stats = await periodStatsBatch([assetId], period, endpoint);
  return stats.get(String(assetId)) || { gain: 0, prevGain: 0, anomaly: false };
}

async function latestAssetDay() {
  // Only days with known Star counts are complete; the sample day itself stays NULL.
  const row = await one('SELECT MAX(day) AS t FROM asset_daily WHERE star_created IS NOT NULL');
  return row?.t ? new Date(`${asDay(row.t)}T02:00:00Z`) : new Date();
}

export async function seedCatalog() {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2));
  if (base > now) base.setUTCDate(base.getUTCDate() - 1);
  for (let i = 0; i < catalogItems.length; i++) {
    const [
      type, slug, category, categoryZh, categoryEn, fullName, description,
      official, evidence, cluster, url, install, language, topics, stars, forks, daily, created,
      recRank, recZh, recEn
    ] = catalogItems[i];
    const id = `${type}-${slug}`;
    const found = await one('SELECT id FROM assets WHERE id = $1', [id]);
    if (found) continue;
    const createdAt = `${created}T00:00:00Z`;
    const pushed = new Date(now.getTime() - (i % 5) * 86400000).toISOString();
    await query(
      `INSERT INTO assets (
         id, type, slug, name, full_name, description, category, category_zh, category_en,
         official, official_evidence, cluster_id, url, install, language, topics, stars, forks,
         created_at, pushed_at, recommend_rank, recommend_note_zh, recommend_note_en
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21,$22,$23
       )`,
      [
        id, type, slug, fullName.split('/').pop(), fullName, description, category, categoryZh, categoryEn,
        official, evidence, cluster, url, install, language, JSON.stringify(topics), stars, forks,
        createdAt, pushed, recRank, recZh, recEn
      ]
    );
    const back = [0];
    for (let age = 1; age <= 32; age++) {
      const factor = 0.78 + 0.26 * Math.sin((age + i) * 0.83) ** 2 + 0.12 * Math.cos((age + i) * 0.41);
      back[age] = back[age - 1] + Math.max(0, Math.round(daily * factor));
    }
    const rows = [];
    for (let age = 32; age >= 0; age--) {
      const at = new Date(base.getTime() - age * 86400000);
      const dayStars = Math.max(0, stars - back[age]);
      const prev = age === 32 ? dayStars : Math.max(0, stars - back[age + 1]);
      rows.push({ day: at.toISOString().slice(0, 10), stars: dayStars, created: dayStars - prev });
    }
    const args = [];
    const placeholders = rows.map((row, j) => {
      const o = j * 4;
      args.push(id, row.day, row.created, row.stars);
      return `($${o + 1},$${o + 2}::date,$${o + 3},$${o + 4})`;
    });
    await query(
      `INSERT INTO asset_daily (asset_id, day, star_created, stars) VALUES ${placeholders.join(',')}`,
      args
    );
  }
}

function decorateRepo(item) {
  const org = String(item.full_name || '').split('/')[0];
  return {
    ...item,
    type: 'github-repo',
    slug: String(item.id),
    name: String(item.full_name || '').split('/')[1] || item.full_name,
    category: (item.topics && item.topics[0]) || item.language || 'other',
    categoryLabel: { zh: (item.topics && item.topics[0]) || item.language || '其他', en: (item.topics && item.topics[0]) || item.language || 'Other' },
    official: OFFICIAL_ORGS.has(org),
    officialEvidence: OFFICIAL_ORGS.has(org) ? `Verified vendor org ${org}` : null,
    similarCount: 0,
    clusterId: null,
    install: null,
    recommendRank: null,
    recommendNote: { zh: null, en: null }
  };
}

export async function getTypeSummary() {
  const [rows, repos] = await Promise.all([
    many('SELECT type, COUNT(*)::int AS n FROM assets GROUP BY type'),
    one("SELECT COUNT(*)::int AS n FROM repos WHERE deleted = FALSE AND archived = FALSE")
  ]);
  const counts = Object.fromEntries(rows.map(r => [r.type, asNumber(r.n) || 0]));
  counts['github-repo'] = asNumber(repos?.n) || 0;
  return {
    types: TYPES.map(id => ({
      id,
      ...TYPE_META[id],
      count: counts[id] || 0
    })),
    source: dataSource() === 'demo' ? 'demo' : 'live'
  };
}

export async function getCatalogFilters(type) {
  if (!isType(type)) return { languages: [], topics: [], categories: [] };
  if (type === 'github-repo') {
    const base = await getRepoFilters();
    return { ...base, categories: base.topics };
  }
  const [languages, categories, topics] = await Promise.all([
    many(
      `SELECT language AS name, COUNT(*)::int AS count FROM assets
       WHERE type = $1 AND language IS NOT NULL AND language <> ''
       GROUP BY language ORDER BY count DESC, language LIMIT 20`,
      [type]
    ),
    many(
      `SELECT category AS id, MIN(category_zh) AS zh, MIN(category_en) AS en, COUNT(*)::int AS count
       FROM assets WHERE type = $1 GROUP BY category ORDER BY count DESC, category`,
      [type]
    ),
    many(
      `SELECT topic AS name, COUNT(*)::int AS count
       FROM assets a, LATERAL jsonb_array_elements_text(a.topics) AS topic
       WHERE a.type = $1 AND topic <> ''
       GROUP BY topic ORDER BY count DESC, topic LIMIT 80`,
      [type]
    )
  ]);
  return {
    languages: languages.map(r => r.name),
    topics: topics.map(r => r.name),
    categories: categories.map(r => ({ id: r.id, zh: r.zh, en: r.en, count: asNumber(r.count) }))
  };
}

export async function getCatalogRankings(type, query = {}) {
  if (!isType(type)) return { items: [], total: 0 };
  if (type === 'github-repo') {
    const ranking = await getRepoRankings(query);
    let items = ranking.items.map(decorateRepo);
    if (query.official === '1' || query.official === 'true' || query.board === 'official') {
      items = items.filter(item => item.official).map((item, i) => ({ ...item, rank: i + 1 }));
    }
    return {
      ...ranking,
      type,
      board: query.board === 'official' ? 'official' : ranking.board,
      boards: boardsFor(type),
      items,
      total: query.official === '1' || query.board === 'official' ? items.length : ranking.total
    };
  }
  const boards = boardsFor(type);
  let board = boards[query.board] ? query.board : 'hot';
  let period = DAYS[query.period] ? query.period : 'week';
  const language = String(query.language || '');
  const categoryValues = filterValues(query.categories ?? query.category);
  const topicValues = filterValues(query.topics ?? query.topic);
  const q = String(query.q || '');
  const officialOnly = board === 'official' || query.official === '1' || query.official === 'true';
  const endpoint = await latestAssetDay();
  const params = [type];
  let sql = 'SELECT * FROM assets WHERE type = $1';
  if (language) {
    params.push(language);
    sql += ` AND lower(language) = lower($${params.length})`;
  }
  if (categoryValues.length === 1) {
    params.push(categoryValues[0]);
    sql += ` AND category = $${params.length}`;
  } else if (categoryValues.length > 1) {
    params.push(categoryValues);
    sql += ` AND category = ANY($${params.length}::text[])`;
  }
  if (topicValues.length === 1) {
    params.push(topicValues[0]);
    sql += ` AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(topics) t(topic)
      WHERE lower(t.topic) = lower($${params.length})
    )`;
  } else if (topicValues.length > 1) {
    params.push(JSON.stringify(topicValues));
    sql += ` AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(topics) t(topic)
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements_text($${params.length}::jsonb) f(value)
        WHERE lower(t.topic) = lower(f.value)
      )
    )`;
  }
  if (q) {
    params.push(q);
    sql += ` AND (full_name ILIKE '%' || $${params.length} || '%' OR COALESCE(description,'') ILIKE '%' || $${params.length} || '%' OR category ILIKE '%' || $${params.length} || '%')`;
  }
  if (officialOnly) sql += ' AND official = TRUE';
  const rows = await many(sql, params);
  const similars = await similarCounts();
  const statsById = await periodStatsBatch(rows.map(row => row.id), period, endpoint);
  const now = endpoint.getTime();
  const scored = [];
  for (const row of rows) {
    const stats = statsById.get(String(row.id)) || { gain: 0, prevGain: 0, anomaly: false };
    const ageDays = Math.max(0, (now - new Date(row.created_at).getTime()) / 86400000);
    const pushDays = Math.max(0, (now - new Date(row.pushed_at).getTime()) / 86400000);
    if (board === 'new' && (ageDays > 90 || (asNumber(row.stars) || 0) < 5)) continue;
    scored.push(mapAsset(row, {
      ...stats,
      ageDays: Math.round(ageDays),
      pushDays: Math.round(pushDays),
      similarCount: similars.get(row.cluster_id) || 0,
      sampledAt: endpoint.toISOString()
    }));
  }
  const cohort = scored.filter(x => x.gain != null && !x.anomaly);
  const forkReady = cohort.some(x => (x.forks || 0) > 0);
  for (const item of scored) item.score = hotScore(item, cohort, forkReady);
  const metric = boards[board].metric;
  const filtered = scored.filter(item => {
    if (metric === 'score') return item.score != null;
    if (metric === 'gain') return item.gain != null && !item.anomaly;
    return true;
  });
  const order = {
    score: (a, b) => (b.score || 0) - (a.score || 0) || b.stars - a.stars,
    gain: (a, b) => (b.gain || 0) - (a.gain || 0) || b.stars - a.stars,
    stars: (a, b) => b.stars - a.stars
  }[metric];
  filtered.sort(order);
  const page = Math.max(1, Math.min(1000, Number(query.page) || 1));
  const limit = Math.max(1, Math.min(50, Number(query.limit) || 10));
  const total = filtered.length;
  const slice = filtered.slice((page - 1) * limit, page * limit).map((item, i) => ({ ...item, rank: (page - 1) * limit + i + 1 }));
  return {
    type,
    board,
    period,
    items: slice,
    total,
    page,
    limit,
    dataInsufficient: scored.length > 0 && total === 0,
    updatedAt: endpoint.toISOString(),
    stale: false,
    windowStart: new Date(utcDay(endpoint).getTime() - ((DAYS[period] - 1) * 86400000)).toISOString(),
    timezone: 'UTC',
    source: dataSource() === 'demo' ? 'demo' : 'live',
    sample: dataSource() === 'demo',
    growthBasis: 'star_created',
    forkComponent: forkReady,
    coverage: 100,
    boards
  };
}

export async function getCatalogChart(type, query = {}, sampleOverride = null) {
  const sample = sampleOverride || await getCatalogRankings(type, { ...query, limit: 50, page: 1 });
  const includeRanking = query.includeRanking === '1' || query.includeRanking === 'true' || query.includeRanking === true;
  if (type === 'github-repo') {
    const chart = await getRepoChart(query, sample);
    return { ...chart, type, ...(includeRanking ? { ranking: sample } : {}) };
  }
  const ranking = { ...sample, items: sample.items.slice(0, 5), limit: 5 };
  const languageCounts = new Map();
  for (const item of sample.items) {
    const language = item.language || item.category || 'Other';
    languageCounts.set(language, (languageCounts.get(language) || 0) + 1);
  }
  const sorted = [...languageCounts].sort((a, b) => b[1] - a[1]);
  const languages = sorted.slice(0, 5).map(([name, count]) => ({ name, count }));
  const remainder = sorted.slice(5).reduce((sum, [, count]) => sum + count, 0);
  if (remainder) languages.push({ name: 'Other', count: remainder });
  const bars = ranking.items
    .filter(r => r.gain != null && !r.anomaly)
    .map(r => ({ id: r.id, name: r.full_name, value: r.gain, rank: r.rank }));
  const leader = bars[0] || null;
  let points = [];
  if (leader) {
    const days = DAYS[ranking.period] || 7;
    const end = utcDay(new Date(ranking.updatedAt));
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    const rows = await many(
      `SELECT day, star_created FROM asset_daily WHERE asset_id = $1 AND day BETWEEN $2::date AND $3::date ORDER BY day`,
      [leader.id, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    );
    let cumulative = 0;
    points = [
      { date: new Date(start.getTime() - 86400000).toISOString().slice(0, 10), gain: 0 },
      ...rows.map(r => ({ date: asDay(r.day), gain: cumulative += asNumber(r.star_created) || 0 }))
    ];
  }
  return {
    type,
    board: ranking.board,
    period: ranking.period,
    source: ranking.source,
    growthBasis: ranking.growthBasis,
    updatedAt: ranking.updatedAt,
    leader: leader?.name || null,
    metric: 'gain',
    bars,
    points,
    languages,
    languageSampleCount: sample.items.length,
    insufficient: points.filter(x => x.gain != null).length < 2,
    ...(includeRanking ? { ranking: sample } : {})
  };
}

export async function getCatalogItem(type, id) {
  if (type === 'github-repo') {
    const repo = await one(
      'SELECT * FROM repos WHERE id = $1 OR full_name = $2',
      [Number(id) || -1, id]
    );
    if (!repo) return null;
    const [ranking, snapshotRows] = await Promise.all([
      getRepoRankings({ board: 'stars', limit: 50, q: repo.full_name.split('/')[1] || repo.full_name }),
      many(
        'SELECT sampled_at, stars, forks FROM snapshots WHERE repo_id = $1 ORDER BY sampled_at DESC LIMIT 31',
        [repo.id]
      )
    ]);
    const item = ranking.items.find(x => x.id === asNumber(repo.id) || x.full_name === repo.full_name);
    const snapshots = snapshotRows.reverse();
    return {
      ...decorateRepo({
        ...repo,
        id: asNumber(repo.id),
        stars: asNumber(repo.stars),
        forks: asNumber(repo.forks),
        topics: asJson(repo.topics, []),
        created_at: asIso(repo.created_at),
        pushed_at: asIso(repo.pushed_at),
        updated_at: asIso(repo.updated_at),
        gain: item?.gain ?? null,
        prevGain: item?.prevGain ?? null,
        score: item?.score ?? null,
        ageDays: item?.ageDays ?? 0,
        pushDays: item?.pushDays ?? 0,
        aiEvidence: aiEvidence(repo),
        url: `https://github.com/${repo.full_name}`
      }),
      snapshots: snapshots.map(s => ({ sampled_at: asIso(s.sampled_at), stars: asNumber(s.stars), forks: asNumber(s.forks) })),
      similar: [],
      mode: dataSource() === 'demo' ? 'demo' : 'live'
    };
  }
  const [row, endpoint] = await Promise.all([
    one('SELECT * FROM assets WHERE type = $1 AND (id = $2 OR slug = $3)', [type, id, id]),
    latestAssetDay()
  ]);
  if (!row) return null;
  const [week, similars, similarRows, series] = await Promise.all([
    periodStats(row.id, 'week', endpoint),
    similarCounts(),
    row.cluster_id
      ? many('SELECT * FROM assets WHERE cluster_id = $1 AND id <> $2 ORDER BY stars DESC', [row.cluster_id, row.id])
      : Promise.resolve([]),
    many('SELECT day, star_created, stars FROM asset_daily WHERE asset_id = $1 ORDER BY day', [row.id])
  ]);
  const ageDays = Math.round(Math.max(0, (endpoint - new Date(row.created_at)) / 86400000));
  const pushDays = Math.round(Math.max(0, (endpoint - new Date(row.pushed_at)) / 86400000));
  return {
    ...mapAsset(row, {
      ...week,
      ageDays,
      pushDays,
      similarCount: similars.get(row.cluster_id) || 0,
      sampledAt: endpoint.toISOString()
    }),
    similar: similarRows.map(item => mapAsset(item, { similarCount: similars.get(item.cluster_id) || 0 })),
    series: series.map(r => ({ date: asDay(r.day), count: asNumber(r.star_created), stars: asNumber(r.stars) })),
    mode: dataSource() === 'demo' ? 'demo' : 'live'
  };
}

export async function getSimilar(type, id) {
  const item = await getCatalogItem(type, id);
  return item ? { items: item.similar || [], clusterId: item.clusterId } : { items: [] };
}

export async function getCategories(type) {
  if (type === 'github-repo') {
    const filters = await getRepoFilters();
    return {
      items: filters.topics.map(topic => ({
        id: topic, zh: topic, en: topic, count: null
      }))
    };
  }
  const filters = await getCatalogFilters(type);
  return { items: filters.categories };
}

export async function getCategory(type, slug, query = {}) {
  const categoryQuery = { ...query, topic: slug, category: slug };
  const [sample, categories] = await Promise.all([
    getCatalogRankings(type, { ...categoryQuery, limit: 50, page: 1 }),
    getCategories(type)
  ]);
  const ranking = { ...sample, items: sample.items.slice(0, 20), limit: 20 };
  const chart = await getCatalogChart(type, categoryQuery, sample);
  const recommend = ranking.items
    .filter(item => item.recommendRank)
    .sort((a, b) => a.recommendRank - b.recommendRank)
    .slice(0, 4);
  const meta = categories.items.find(x => x.id === slug);
  return {
    type,
    category: slug,
    label: meta ? { zh: meta.zh, en: meta.en } : { zh: slug, en: slug },
    recommend,
    ranking,
    chart
  };
}

export async function getCompare(type, ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : String(ids || '').split(',')).map(x => x.trim()).filter(Boolean))].slice(0, 3);
  const items = (await Promise.all(list.map(id => getCatalogItem(type, id)))).filter(Boolean);
  if (items.length === 1) {
    const item = items[0];
    const seen = new Set([String(item.slug || ''), String(item.id)]);
    const peers = [];
    if (item.similar?.length) peers.push(...item.similar);
    if (peers.length < 2 && item.category) {
      const ranking = await getCatalogRankings(type, { category: item.category, topic: item.category, limit: 8, board: 'stars' });
      peers.push(...ranking.items);
    }
    for (const peer of peers) {
      const key = String(peer.slug || peer.id);
      if (seen.has(key) || seen.has(String(peer.id))) continue;
      seen.add(key);
      items.push(peer);
      if (items.length >= 3) break;
    }
  }
  return { type, items: items.slice(0, 3) };
}

export async function searchCatalog(q, type) {
  const queryText = String(q || '').trim();
  if (!queryText) return { items: [] };
  const types = type && isType(type) ? [type] : TYPES;
  const rankings = await Promise.all(types.map(current =>
    getCatalogRankings(current, { q: queryText, limit: 8, page: 1, board: 'stars' })
  ));
  const items = rankings.flatMap((ranking, index) =>
    ranking.items.map(item => ({ ...item, type: types[index] }))
  );
  items.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  return { q: queryText, items: items.slice(0, 20) };
}

export { isType, boardsFor, getStarSeries };
