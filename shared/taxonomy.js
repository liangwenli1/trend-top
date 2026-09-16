export const USE_CASES = {
  browser: { zh: '浏览器', en: 'Browser' },
  database: { zh: '数据库', en: 'Database' },
  storage: { zh: '存储', en: 'Storage' },
  filesystem: { zh: '文件系统', en: 'Filesystem' },
  documents: { zh: '文档', en: 'Documents' },
  git: { zh: 'Git', en: 'Git' },
  coding: { zh: '编程', en: 'Coding' },
  research: { zh: '研究', en: 'Research' },
  ui: { zh: '界面', en: 'UI' },
  github: { zh: 'GitHub', en: 'GitHub' },
  auth: { zh: '认证', en: 'Auth' },
  directory: { zh: '目录', en: 'Directory' },
  playground: { zh: '试用', en: 'Playground' },
  spec: { zh: '规范', en: 'Spec' },
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
  github: { zh: 'GitHub', en: 'GitHub', useCase: 'github' },
  filesystem: { zh: '文件系统', en: 'Filesystem', useCase: 'filesystem' },
  coding: { zh: '编程助手', en: 'Coding', useCase: 'coding' },
  research: { zh: '研究', en: 'Research', useCase: 'research' },
  directory: { zh: '目录', en: 'Directory', useCase: 'directory' },
  playground: { zh: '试用', en: 'Playground', useCase: 'playground' },
  spec: { zh: '规范', en: 'Spec', useCase: 'spec' }
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
  { category: 'spec', keys: ['specification', 'agentskills.io'] }
];

export const OFFICIAL_ORGS = new Set([
  'microsoft', 'vercel', 'anthropics', 'openai', 'modelcontextprotocol',
  'shadcn-ui', 'langchain-ai', 'ollama', 'supabase', 'astral-sh', 'github',
  'vercel-labs', 'facebook', 'google', 'google-gemini', 'continuedev',
  'minio', 'clickhouse', 'redis', 'elastic', 'apache'
]);

const hay = item => `${item.full_name || ''} ${item.name || ''} ${item.description || ''} ${(item.topics || []).join(' ')} ${item.category || ''} ${item.homepage || ''} ${item.source_query || ''}`.toLowerCase();

function topicList(item) {
  return (item.topics || []).map(value => String(value || '').toLowerCase());
}

function ruleHit(item) {
  const text = hay(item);
  const topics = topicList(item);
  return RULES.find(rule => rule.keys.some(key => topics.includes(key) || text.includes(key))) || null;
}

export function classify(item = {}) {
  const stored = String(item.category || '').toLowerCase();
  const known = CATEGORIES[stored] && stored !== 'uncategorized' ? stored : null;
  const category = known || ruleHit(item)?.category || 'uncategorized';
  const meta = CATEGORIES[category];
  const useCase = item.use_case && USE_CASES[item.use_case] ? item.use_case : (meta?.useCase || 'other');
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
  if (signals.directory === 'skills-sh') return 'Listed on skills.sh';
  if (signals.directory === 'glama') return 'Listed on Glama MCP directory';
  if (/directory:skills-sh|skills\.sh/i.test(item.source_query || '')) return 'Listed on skills.sh';
  if (/directory:glama|glama\.ai/i.test(item.source_query || '')) return 'Listed on Glama MCP directory';
  return null;
}

export function officialEvidenceFor(item = {}) {
  const org = String(item.org || String(item.full_name || '').split('/')[0] || '').toLowerCase();
  const text = hay(item);
  const reasons = [];
  if (OFFICIAL_ORGS.has(org)) reasons.push(`Verified vendor org ${org}`);
  if (item.type === 'plugin' && (org === 'modelcontextprotocol' || /registry\.modelcontextprotocol\.io|official mcp registry/.test(text))) {
    reasons.push('Official MCP Registry');
  }
  if (item.type === 'skill' && org === 'anthropics') reasons.push('anthropics/skills');
  if (item.type === 'website' && item.trust === 'official') reasons.push('Website source registry: official');
  if (OFFICIAL_ORGS.has(org) && directoryEvidence(item)) reasons.push(directoryEvidence(item));
  return reasons.length ? [...new Set(reasons)].join(' · ') : null;
}

export function isOfficial(evidence) {
  return Boolean(evidence);
}

function hostsFor(item) {
  const text = hay(item);
  const hosts = [];
  if (/claude|anthropic/.test(text)) hosts.push('Claude');
  if (/cursor/.test(text)) hosts.push('Cursor');
  if (/windsurf/.test(text)) hosts.push('Windsurf');
  if (/copilot|vscode|visual studio code/.test(text)) hosts.push('VS Code');
  if (/codex/.test(text)) hosts.push('Codex');
  if (item.type === 'plugin') return hosts.length ? hosts.join(' / ') : 'MCP hosts';
  if (item.type === 'skill') return hosts.length ? hosts.join(' / ') : 'Claude / compatible agents';
  if (item.type === 'components') return 'shadcn-compatible apps';
  return hosts.length ? hosts.join(' / ') : (classify(item).useCaseLabel?.en || '—');
}

function transportFor(item) {
  const text = hay(item);
  if (item.type !== 'plugin' && item.type !== 'skill') return null;
  if (/streamable.?http|http.?sse|\bsse\b/.test(text)) return 'HTTP / SSE';
  if (/\bstdio\b/.test(text)) return 'stdio';
  return item.type === 'plugin' ? 'MCP transport unspecified' : 'SKILL.md';
}

export function compareFields(item = {}) {
  const classified = classify(item);
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
      protocol: 'MCP',
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
      hosts: classified.useCase === 'coding' ? 'CLI / editor' : hostsFor(item),
      listed,
      language: item.language || '—',
      source
    };
  }
  if (item.type === 'components') {
    return {
      protocol: 'UI registry',
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

export const useCaseOptions = () => Object.entries(USE_CASES)
  .filter(([id]) => id !== 'other')
  .map(([id, labels]) => ({ id, ...labels }));

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
    if (lower.includes(id) || lower.includes(String(labels.zh).toLowerCase()) || lower.includes(String(labels.en).toLowerCase())) useCases.add(id);
  }
  for (const [id, meta] of Object.entries(CATEGORIES)) {
    if (lower.includes(id) || lower.includes(String(meta.zh).toLowerCase()) || lower.includes(String(meta.en).toLowerCase())) {
      categories.add(id);
      useCases.add(meta.useCase);
    }
  }
  for (const rule of RULES) {
    if (rule.keys.some(key => lower.includes(key))) {
      categories.add(rule.category);
      if (CATEGORIES[rule.category]) useCases.add(CATEGORIES[rule.category].useCase);
    }
  }
  for (const hint of TYPE_HINTS) {
    if (hint.keys.some(key => lower.includes(key))) types.push(hint.type);
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
