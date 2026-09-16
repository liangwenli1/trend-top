// Controlled aliases only: related topics (AI vs LLM, React vs components)
// remain separate. Raw source tags stay in the database for provenance.
const aliases = {
  apis: 'api', 'public-api': 'api', 'public-apis': 'api', 'free-api': 'api', 'free-apis': 'api',
  agent: 'agents', 'ai-agent': 'agents', 'ai-agents': 'agents',
  'mcp-server': 'mcp', 'mcp-servers': 'mcp', 'model-context-protocol': 'mcp',
  reactjs: 'react', 'react-js': 'react', 'next-js': 'nextjs',
  'node-js': 'nodejs', golang: 'go', 'go-lang': 'go',
  'front-end': 'frontend', 'artificial-intelligence': 'ai',
  'large-language-model': 'llm', 'large-language-models': 'llm'
};
const generic = ['public', 'app', 'apps', 'application', 'applications', 'tool', 'tools', 'software', 'project', 'projects', 'repo', 'repository', 'repositories'];
const mapping = { ...aliases, ...Object.fromEntries(generic.map(key => [key, ''])) };
export const canonicalTopic = value => {
  const key = String(value ?? '').trim().toLowerCase().replace(/[_.\s]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return Object.hasOwn(mapping, key) ? mapping[key] : key;
};
export const normalizeTopics = values => [...new Set((Array.isArray(values) ? values : []).map(canonicalTopic).filter(Boolean))];
export const topicFilterValues = value => normalizeTopics((Array.isArray(value) ? value : [value]).flatMap(item => String(item ?? '').split(',')));

// The same rule executes inside SQL filters and facets, including existing rows.
// Values below are code constants, never request input.
const quote = value => "'" + value.replaceAll("'", "''") + "'";
export const topicFunctionSql = `CREATE OR REPLACE FUNCTION canonical_topic(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE key ${Object.entries(mapping).map(([key, value]) => `WHEN ${quote(key)} THEN ${quote(value)}`).join(' ')} ELSE key END
  FROM (SELECT regexp_replace(regexp_replace(regexp_replace(lower(trim(COALESCE(value,''))), '[_.[:space:]]+', '-', 'g'), '-+', '-', 'g'), '^-+|-+$', '', 'g') AS key) normalized
$$`;
