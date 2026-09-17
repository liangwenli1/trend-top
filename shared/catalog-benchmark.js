// Fixed expectations expose collection gaps. They do not force inclusion or bypass validation.
// The name-only selector intentionally covers the user's awesome-design-md example without guessing its owner.
export const BENCHMARK_VERSION = 2;
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

// Representative expectations, not a claim these are today's 100 most popular projects.
const representatives = {
  'github-repo': ['torvalds/linux','microsoft/vscode','facebook/react','vercel/next.js','vuejs/core','angular/angular','sveltejs/svelte','rust-lang/rust','golang/go','python/cpython','nodejs/node','denoland/deno','oven-sh/bun','kubernetes/kubernetes','docker/compose','redis/redis','postgres/postgres','sqlite/sqlite','mongodb/mongo','elastic/elasticsearch','opensearch-project/OpenSearch','grafana/grafana','prometheus/prometheus','apache/airflow','apache/spark','duckdb/duckdb','dbt-labs/dbt-core','pola-rs/polars','astral-sh/uv','astral-sh/ruff','pytorch/pytorch','tensorflow/tensorflow','huggingface/transformers','ggml-org/llama.cpp','ollama/ollama','vllm-project/vllm','langchain-ai/langchain','run-llama/llama_index','browser-use/browser-use','microsoft/TypeScript','n8n-io/n8n','appwrite/appwrite','pocketbase/pocketbase','nocodb/nocodb','directus/directus','strapi/strapi','discourse/discourse','calcom/cal.com','immich-app/immich','jellyfin/jellyfin','Homebrew/brew','neovim/neovim','helix-editor/helix','zed-industries/zed','git/git','cli/cli'],
  plugin: ['modelcontextprotocol/servers','punkpeye/mcp-proxy','cloudflare/mcp-server-cloudflare','googleapis/genai-toolbox','microsoft/playwright-mcp','upstash/context7'],
  agent: ['continuedev/continue','Aider-AI/aider','All-Hands-AI/OpenHands','assafelovic/gpt-researcher','Cline/cline','RooCodeInc/Roo-Code'],
  components: ['tailwindlabs/headlessui','mui/material-ui','chakra-ui/chakra-ui','ant-design/ant-design','mantinedev/mantine','heroui-inc/heroui','primefaces/primevue','shoelace-style/shoelace'],
};
for (const [type, repos] of Object.entries(representatives)) for (const repo of repos) CATALOG_BENCHMARK.push({ id: `${type}:${repo.toLowerCase()}`, name: repo, type, repo });
for (const name of ['docx','pptx','xlsx','mcp-builder','skill-creator','webapp-testing','canvas-design','algorithmic-art']) CATALOG_BENCHMARK.push({
  id: `anthropic-skill:${name}`, name: `Anthropic ${name} Skill`, type: 'skill', repo: 'anthropics/skills', resourcePath: `skills/${name}/SKILL.md`
});
