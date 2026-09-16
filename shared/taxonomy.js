export const CLASSIFICATION_VERSION = 1;
export const USE_CASES = {
  browser: { zh: '网页自动化', en: 'Browser automation' },
  database: { zh: '数据库操作', en: 'Database operations' },
  storage: { zh: '数据存储', en: 'Data storage' },
  filesystem: { zh: '文件管理', en: 'File management' },
  documents: { zh: '文档处理', en: 'Document processing' },
  git: { zh: '代码协作', en: 'Code collaboration' },
  coding: { zh: '代码开发', en: 'Coding' },
  research: { zh: '资料研究', en: 'Research' },
  ui: { zh: '界面构建', en: 'UI development' },
  auth: { zh: '身份认证', en: 'Authentication' },
  discovery: { zh: '资源发现', en: 'Resource discovery' },
  other: { zh: '其他', en: 'Other' }
};

export const CATEGORIES = {
  pdf: { zh: 'PDF', en: 'PDF', useCase: 'documents' },
  docs: { zh: '文档', en: 'Docs', useCase: 'documents' },
  xlsx: { zh: '表格', en: 'Spreadsheets', useCase: 'documents' },
  frontend: { zh: '前端', en: 'Frontend', useCase: 'ui' },
  button: { zh: '按钮', en: 'Button', useCase: 'ui' },
  hero: { zh: 'Hero', en: 'Hero', useCase: 'ui' },
  chart: { zh: '图表', en: 'Chart', useCase: 'ui' },
  diagrams: { zh: '架构图', en: 'Diagrams', useCase: 'coding' },
  'auth-form': { zh: '登录表单', en: 'Auth form', useCase: 'auth' },
  git: { zh: 'Git', en: 'Git', useCase: 'git' },
  postgres: { zh: 'Postgres', en: 'Postgres', useCase: 'database' },
  mysql: { zh: 'MySQL', en: 'MySQL', useCase: 'database' },
  sqlite: { zh: 'SQLite', en: 'SQLite', useCase: 'database' },
  redis: { zh: 'Redis', en: 'Redis', useCase: 'database' },
  'vector-db': { zh: '向量库', en: 'Vector DB', useCase: 'database' },
  'object-storage': { zh: '对象存储', en: 'Object storage', useCase: 'storage' },
  browser: { zh: '浏览器', en: 'Browser', useCase: 'browser' },
  github: { zh: 'GitHub', en: 'GitHub', useCase: 'git' },
  filesystem: { zh: '文件系统', en: 'Filesystem', useCase: 'filesystem' },
  coding: { zh: '编程助手', en: 'Coding', useCase: 'coding' },
  research: { zh: '研究', en: 'Research', useCase: 'research' },
  directory: { zh: '目录', en: 'Directory', useCase: 'discovery' },
  playground: { zh: '试用', en: 'Playground', useCase: 'discovery' },
  spec: { zh: '规范', en: 'Spec', useCase: 'coding' },
  database: { zh: '数据库', en: 'Database', useCase: 'database' },
  storage: { zh: '存储', en: 'Storage', useCase: 'storage' }
};

const RULES = [
  { category: 'object-storage', keys: ['minio', 's3', 'r2', 'ceph', 'object-storage', 'blob storage', 'object storage'] },
  { category: 'vector-db', keys: ['chromadb', 'chroma', 'milvus', 'qdrant', 'weaviate', 'pinecone', 'pgvector', 'vector database', 'vector db'] },
  { category: 'postgres', keys: ['postgres', 'postgresql'] },
  { category: 'mysql', keys: ['mysql', 'mariadb'] },
  { category: 'sqlite', keys: ['sqlite'] },
  { category: 'redis', keys: ['redis'] },
  { category: 'browser', keys: ['playwright', 'puppeteer', 'browser-use', 'browser automation', 'headless chrome'] },
  { category: 'diagrams', keys: ['architecture-diagram', 'architecture-as-code', 'mermaid', 'plantuml', 'sequence diagram', 'code-visualization', 'diagrams'] },
  { category: 'pdf', keys: ['pdf'] },
  { category: 'xlsx', keys: ['xlsx', 'spreadsheet', 'excel'] },
  { category: 'docs', keys: ['document-skills', 'docx'] },
  { category: 'filesystem', keys: ['filesystem', 'local files'] },
  { category: 'github', keys: ['github-mcp', 'github mcp', 'github-mcp-server'] },
  { category: 'git', keys: ['git-commit', 'conventional commit', 'force-push'] },
  { category: 'button', keys: ['button', 'shimmer-button'] },
  { category: 'hero', keys: ['hero'] },
  { category: 'chart', keys: ['recharts', 'chart primitive'] },
  { category: 'auth-form', keys: ['login', 'sign-in', 'auth form'] },
  { category: 'frontend', keys: ['frontend-design', 'shadcn', 'ui implementation'] },
  { category: 'coding', keys: ['coding agent', 'claude-code', 'aider', 'continue.dev', 'claude-skill', 'agent-skills', 'agent skill'] },
  { category: 'research', keys: ['gpt-researcher', 'research agent', 'wikipedia-style'] },
  { category: 'playground', keys: ['playground', 'inspector', 'try a server'] },
  { category: 'directory', keys: ['leaderboard', 'directory', 'registry', 'catalog of'] },
  { category: 'spec', keys: ['specification', 'agentskills.io'] },
  { category: 'database', keys: ['database', 'databases', 'sql'] },
  { category: 'storage', keys: ['storage'] },
  { category: 'frontend', keys: ['frontend', 'front-end', 'ui components', 'component library', 'design system'] }
];

export const OFFICIAL_ORGS = new Set([
  'microsoft', 'vercel', 'anthropics', 'openai', 'modelcontextprotocol',
  'shadcn-ui', 'langchain-ai', 'ollama', 'supabase', 'astral-sh', 'github',
  'vercel-labs', 'facebook', 'google', 'google-gemini', 'continuedev',
  'minio', 'clickhouse', 'redis', 'elastic', 'apache'
]);

const hay = item => `${item.full_name || ''} ${item.name || ''} ${item.description || ''} ${(Array.isArray(item.topics) ? item.topics : []).join(' ')} ${item.category || ''} ${item.homepage || ''}`.toLowerCase();

export function normalizeUseCase(value) {
  const id = String(value || '').toLowerCase();
  return ({ github: 'git', directory: 'discovery', playground: 'discovery', spec: 'coding' })[id] || id;
}

function keywordHit(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
}

function topicList(item) {
  return (Array.isArray(item.topics) ? item.topics : []).map(value => String(value || '').toLowerCase());
}

function ruleHit(item) {
  const text = hay(item);
  const topics = topicList(item);
  const signals = item.rankingSignals || item.ranking_signals || {};
  const resourceName = String(signals.resourcePath || '').split('/').slice(0, -1).pop();
  const resourceRule = resourceName && RULES.find(rule => rule.keys.some(key => keywordHit(resourceName, key)));
  return resourceRule || RULES.find(rule => rule.keys.some(key => topics.includes(key) || keywordHit(text, key))) || null;
}

export function classify(item = {}) {
  const stored = String(item.category || '').toLowerCase();
  const known = CATEGORIES[stored] && stored !== 'uncategorized' ? stored : null;
  const category = known || ruleHit(item)?.category || 'uncategorized';
  const meta = CATEGORIES[category];
  const storedUseCase = normalizeUseCase(item.use_case);
  const useCase = USE_CASES[storedUseCase] ? storedUseCase : (meta?.useCase || 'other');
  return {
    category,
    categoryZh: meta?.zh || category,
    categoryEn: meta?.en || category,
    useCase,
    useCaseLabel: USE_CASES[useCase] || USE_CASES.other
  };
}

function directoryEvidence(item) {
  const signals = item.rankingSignals || item.ranking_signals || {};
  if (signals.directory === 'official-mcp-registry' || /directory:official-mcp-registry/i.test(item.source_query || '')) return 'Official MCP Registry';
  if (signals.directory === 'skills-sh') return 'Listed on skills.sh';
  if (signals.directory === 'glama') return 'Listed on Glama MCP directory';
  if (/directory:skills-sh|skills\.sh/i.test(item.source_query || '')) return 'Listed on skills.sh';
  if (/directory:glama|glama\.ai/i.test(item.source_query || '')) return 'Listed on Glama MCP directory';
  return null;
}

export function officialEvidenceFor(item = {}) {
  const org = String(item.org || String(item.full_name || '').split('/')[0] || '').toLowerCase();
  const listed = directoryEvidence(item);
  const reasons = [];
  if (OFFICIAL_ORGS.has(org)) reasons.push(`Verified vendor org ${org}`);
  if (item.type === 'skill' && org === 'anthropics') reasons.push('anthropics/skills');
  if (item.type === 'website' && item.trust === 'official') reasons.push('Website source registry: official');
  if (OFFICIAL_ORGS.has(org) && listed && listed !== 'Official MCP Registry') reasons.push(listed);
  return reasons.length ? [...new Set(reasons)].join(' · ') : null;
}

export function isOfficial(evidence) {
  return Boolean(evidence);
}

function hostsFor(item) {
  // Only explicit source declarations should be presented as compatibility.
  return item.compatibleHosts || (item.rankingSignals || item.ranking_signals)?.compatibleHosts || null;
}

function transportFor(item) {
  const text = hay(item);
  if (item.type !== 'plugin' && item.type !== 'skill') return null;
  if (/streamable.?http|http.?sse|\bsse\b/.test(text)) return 'HTTP / SSE';
  if (/\bstdio\b/.test(text)) return 'stdio';
  return item.type === 'skill' ? 'SKILL.md' : null;
}

export function compareFields(item = {}) {
  const signals = item.rankingSignals || item.ranking_signals || {};
  const source = item.sourceRepoUrl || item.source_repo_url || item.url || null;
  const listed = directoryEvidence(item);
  if (item.type === 'skill') {
    return {
      protocol: 'Agent Skills',
      identity: signals.resourcePath || 'SKILL.md',
      runtime: 'SKILL.md',
      transport: transportFor(item),
      hosts: hostsFor(item),
      listed,
      language: item.language || 'Markdown',
      source
    };
  }
  if (item.type === 'plugin') {
    return {
      protocol: /\bmcp\b|model context protocol/i.test(hay(item)) ? 'MCP' : null,
      identity: item.full_name,
      runtime: item.language || '—',
      transport: transportFor(item),
      hosts: hostsFor(item),
      listed,
      language: item.language || '—',
      source
    };
  }
  if (item.type === 'agent') {
    return {
      protocol: 'Agent',
      identity: item.full_name,
      runtime: item.language || '—',
      transport: null,
      hosts: hostsFor(item),
      listed,
      language: item.language || '—',
      source
    };
  }
  if (item.type === 'components') {
    return {
      protocol: null,
      identity: item.full_name,
      runtime: item.language || 'TypeScript',
      transport: null,
      hosts: hostsFor(item),
      listed,
      language: item.language || 'TypeScript',
      source
    };
  }
  return {
    protocol: item.type === 'website' ? 'Website' : 'GitHub',
    identity: item.full_name,
    runtime: item.language || '—',
    transport: null,
    hosts: hostsFor(item),
    listed,
    language: item.language || '—',
    source
  };
}

export const useCaseOptions = counts => Object.entries(USE_CASES)
  .filter(([id]) => id !== 'other' && (!counts || Number(counts.get(id)) > 0))
  .map(([id, labels]) => ({ id, ...labels, ...(counts ? { count: counts.get(id) } : {}) }));

const TYPE_HINTS = [
  { type: 'skill', keys: ['skill', 'skills', '技能'] },
  { type: 'plugin', keys: ['plugin', 'plugins', 'mcp', '插件'] },
  { type: 'agent', keys: ['agent', 'agents'] },
  { type: 'components', keys: ['component', 'components', '组件'] },
  { type: 'website', keys: ['website', 'directory', '网站', '目录'] },
  { type: 'github-repo', keys: ['repo', 'repository', '仓库'] }
];

export function expandSearch(q) {
  const raw = String(q || '').trim();
  const lower = raw.toLowerCase();
  const tokens = lower.split(/[\s,/|+]+/).filter(token => token.length > 1);
  const useCases = new Set();
  const categories = new Set();
  const types = [];
  for (const [id, labels] of Object.entries(USE_CASES)) {
    if (id === 'other') continue;
    if (keywordHit(lower, id) || lower.includes(labels.zh) || keywordHit(lower, labels.en)) useCases.add(id);
  }
  for (const [id, meta] of Object.entries(CATEGORIES)) {
    if (keywordHit(lower, id) || lower.includes(meta.zh) || keywordHit(lower, meta.en)) {
      categories.add(id);
      useCases.add(meta.useCase);
    }
  }
  for (const rule of RULES) {
    if (rule.keys.some(key => keywordHit(lower, key))) {
      categories.add(rule.category);
      if (CATEGORIES[rule.category]) useCases.add(CATEGORIES[rule.category].useCase);
    }
  }
  for (const hint of TYPE_HINTS) {
    if (hint.keys.some(key => /[\u3400-\u9fff]/.test(key) ? lower.includes(key) : keywordHit(lower, key))) types.push(hint.type);
  }
  return { raw, tokens, useCases: [...useCases], categories: [...categories], types };
}

export function searchScore(item, expanded) {
  const hay = `${item.full_name || ''} ${item.name || ''} ${item.description || ''} ${item.category || ''} ${item.useCase || ''} ${(item.topics || []).join(' ')}`.toLowerCase();
  let score = 0;
  for (const token of expanded.tokens) {
    if (String(item.full_name || '').toLowerCase().includes(token)) score += 8;
    else if (hay.includes(token)) score += 3;
  }
  if (expanded.useCases.includes(item.useCase)) score += 12;
  if (expanded.categories.includes(item.category)) score += 10;
  return score;
}
