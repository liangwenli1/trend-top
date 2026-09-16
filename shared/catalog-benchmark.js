// Fixed expectations expose collection gaps. They do not force inclusion or bypass validation.
// The name-only selector intentionally covers the user's awesome-design-md example without guessing its owner.
export const BENCHMARK_VERSION = 1;
export const CATALOG_BENCHMARK = [
  { id: 'firecrawl-repository', name: 'Firecrawl repository', type: 'github-repo', repo: 'firecrawl/firecrawl' },
  { id: 'awesome-design-md', name: 'awesome-design-md', type: 'github-repo', repoName: 'awesome-design-md' },
  { id: 'playwright', name: 'Playwright', type: 'github-repo', repo: 'microsoft/playwright' },
  { id: 'supabase', name: 'Supabase', type: 'github-repo', repo: 'supabase/supabase' },
  { id: 'pdf-skill', name: 'Anthropic PDF Skill', type: 'skill', repo: 'anthropics/skills', resourcePath: 'skills/pdf/SKILL.md' },
  { id: 'frontend-design-skill', name: 'Anthropic frontend-design Skill', type: 'skill', repo: 'anthropics/skills', resourcePath: 'skills/frontend-design/SKILL.md' },
  { id: 'firecrawl-mcp', name: 'Firecrawl MCP server', type: 'plugin', repo: 'firecrawl/firecrawl-mcp-server' },
  { id: 'github-mcp', name: 'GitHub MCP server', type: 'plugin', repo: 'github/github-mcp-server' },
  { id: 'codex', name: 'Codex', type: 'agent', repo: 'openai/codex' },
  { id: 'claude-code', name: 'Claude Code', type: 'agent', repo: 'anthropics/claude-code' },
  { id: 'shadcn-components', name: 'shadcn/ui component library', type: 'components', repo: 'shadcn-ui/ui' },
  { id: 'radix-components', name: 'Radix UI primitives', type: 'components', repo: 'radix-ui/primitives' },
  { id: '21st-website', name: '21st.dev', type: 'website', website: 'https://21st.dev' },
  { id: 'skills-website', name: 'Skills.sh', type: 'website', website: 'https://skills.sh' },
  { id: 'smithery-website', name: 'Smithery', type: 'website', website: 'https://smithery.ai' },
  { id: 'glama-website', name: 'Glama MCP directory', type: 'website', website: 'https://glama.ai/mcp/servers' }
];
