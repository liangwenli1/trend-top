import crypto from 'node:crypto';
import { asJson, many, query } from './db.js';
import { getSettings } from './settings.js';

const SOURCES = [
  { id: '21st-dev', name: '21st.dev', url: 'https://21st.dev', trust: 'curated', topics: ['components', 'design-system'] },
  { id: 'skills-sh', name: 'Skills.sh', url: 'https://skills.sh', trust: 'curated', topics: ['skills', 'directory'] },
  { id: 'smithery', name: 'Smithery', url: 'https://smithery.ai', trust: 'curated', topics: ['mcp', 'directory'] },
  { id: 'glama', name: 'Glama', url: 'https://glama.ai/mcp/servers', trust: 'curated', topics: ['mcp', 'directory'] },
  { id: 'agent-skills', name: 'Agent Skills', url: 'https://agentskills.io', trust: 'official', topics: ['skills', 'specification'] },
  { id: 'shadcn-ui', name: 'shadcn/ui', url: 'https://ui.shadcn.com', trust: 'official', topics: ['components', 'design-system'] }
];

const clean = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const absoluteUrl = (value, base) => { try { return new URL(value, base).href; } catch { return null; } };
const meta = (html, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) { const match = html.match(pattern); if (match) return clean(match[1]); }
  return '';
};

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function allowedByRobots(url) {
  const parsed = new URL(url);
  try {
    const response = await fetchWithTimeout(`${parsed.origin}/robots.txt`, { headers: { 'User-Agent': 'TrendTopBot/1.0' } }, 6000);
    if (!response.ok) return true;
    const text = await response.text();
    const group = text.split(/user-agent\s*:/i).slice(1).find(block => block.trim().startsWith('*')) || '';
    return !/^\s*\*\s*(?:\r?\n)+\s*disallow\s*:\s*\/\s*$/im.test(`*\n${group}`);
  } catch { return true; }
}

async function directMetadata(source) {
  if (!(await allowedByRobots(source.url))) throw new Error('Blocked by robots.txt');
  const response = await fetchWithTimeout(source.url, { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'TrendTopBot/1.0 (+https://trend-top.com)' } });
  if (!response.ok) throw new Error(`Website ${response.status}`);
  const html = (await response.text()).slice(0, 750000);
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || source.name;
  const description = meta(html, 'description') || meta(html, 'og:description');
  const icon = html.match(/<link[^>]+rel=["'][^"']*(?:icon|shortcut)[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1];
  const feed = html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i)?.[1];
  const lastModified = response.headers.get('last-modified');
  return { title, description, favicon: absoluteUrl(icon || '/favicon.ico', source.url), feedUrl: absoluteUrl(feed, source.url), sitemapUrl: absoluteUrl('/sitemap.xml', source.url), lastModified, provider: 'direct' };
}

async function firecrawlMetadata(source, settings) {
  const base = String(settings.public.collection.firecrawlApiUrl || 'https://api.firecrawl.dev').replace(/\/$/, '');
  const response = await fetchWithTimeout(`${base}/v2/scrape`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.secret.firecrawlApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: source.url, formats: ['markdown', 'links'], onlyMainContent: true, maxAge: 21600000, timeout: 30000 })
  }, 45000);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.error || `Firecrawl ${response.status}`);
  const document = result.data || result;
  const metadata = document.metadata || {};
  const links = Array.isArray(document.links) ? document.links : [];
  return {
    title: clean(metadata.title || metadata.ogTitle) || source.name,
    description: clean(metadata.description || metadata.ogDescription || document.summary),
    favicon: absoluteUrl(metadata.favicon || '/favicon.ico', source.url),
    feedUrl: links.find(link => /(?:rss|atom|feed)(?:\.|\/|$)/i.test(link)) || null,
    sitemapUrl: links.find(link => /sitemap\.xml/i.test(link)) || absoluteUrl('/sitemap.xml', source.url),
    lastModified: metadata.modifiedTime || metadata.lastModified || null,
    cacheState: metadata.cacheState || null,
    cachedAt: metadata.cachedAt || null,
    provider: 'firecrawl'
  };
}

export async function ensureWebsiteSources() {
  const now = new Date().toISOString();
  for (const source of SOURCES) {
    await query(
      `INSERT INTO website_sources (id,name,url,collection_method,frequency_hours,trust_level,topics,active,metadata)
       VALUES ($1,$2,$3,'page',24,$4,$5::jsonb,TRUE,$6::jsonb)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,trust_level=EXCLUDED.trust_level,topics=EXCLUDED.topics`,
      [source.id, source.name, source.url, source.trust, JSON.stringify(source.topics), JSON.stringify({ seededAt: now })]
    );
  }
}

async function saveWebsite(source, metadata, now) {
  const slug = source.id;
  const id = `website-source-${slug}`;
  const topics = asJson(source.topics, []);
  const category = topics[0] || 'directory';
  const description = metadata.description || `${source.name} open-source resource.`;
  await query(
    `INSERT INTO assets (
       id,type,slug,name,full_name,description,category,category_zh,category_en,official,official_evidence,
       cluster_id,url,language,topics,stars,forks,created_at,pushed_at,website_url,source_repo_url,favicon_url,
       last_fetched_at,last_seen_at,source_query,entity_key,ranking_signals,active,missed_runs
     ) VALUES ($1,'website',$2,$3,$4,$5,$6,$6,$6,$7,$8,$9,$10,'',$11::jsonb,0,0,$12,$12,$10,$13,$14,$12,$12,$15,$16,$17::jsonb,TRUE,0)
     ON CONFLICT (type,slug) DO UPDATE SET name=EXCLUDED.name,full_name=EXCLUDED.full_name,description=EXCLUDED.description,
       category=EXCLUDED.category,official=EXCLUDED.official,official_evidence=EXCLUDED.official_evidence,url=EXCLUDED.url,
       website_url=EXCLUDED.website_url,source_repo_url=COALESCE(EXCLUDED.source_repo_url,assets.source_repo_url),favicon_url=EXCLUDED.favicon_url,
       topics=EXCLUDED.topics,pushed_at=EXCLUDED.pushed_at,last_fetched_at=EXCLUDED.last_fetched_at,last_seen_at=EXCLUDED.last_seen_at,
       source_query=EXCLUDED.source_query,entity_key=EXCLUDED.entity_key,ranking_signals=EXCLUDED.ranking_signals,active=TRUE,missed_runs=0`,
    [id, slug, metadata.title || source.name, source.name, description, category, source.trust_level === 'official', `Website source registry: ${source.trust_level}`, `website:${slug}`, source.url, JSON.stringify(topics), now, source.source_repo_url, metadata.favicon, `website-source:${slug}`, `domain:${new URL(source.url).hostname.toLowerCase().replace(/^www\./, '')}`, JSON.stringify({ trust: source.trust_level, contentUpdatedAt: metadata.lastModified, provider: metadata.provider, confidence: metadata.lastModified ? 'partial' : 'metadata-only' })]
  );
  await query('UPDATE website_sources SET last_fetched_at=$1,next_retry_at=NULL,failure_count=0,last_error=NULL,metadata=$2::jsonb WHERE id=$3', [now, JSON.stringify(metadata), source.id]);
}

export async function collectWebsiteSources() {
  await ensureWebsiteSources();
  const settings = await getSettings();
  if (settings.public.collection.websiteEnrichment === false) return { found: 0, failed: 0, provider: 'disabled' };
  const sources = await many(`SELECT * FROM website_sources WHERE active=TRUE AND (next_retry_at IS NULL OR next_retry_at<=NOW()) AND (last_fetched_at IS NULL OR last_fetched_at < NOW() - (frequency_hours * INTERVAL '1 hour')) ORDER BY last_fetched_at NULLS FIRST`);
  let found = 0, failed = 0;
  for (const source of sources) {
    const now = new Date().toISOString();
    try {
      const metadata = settings.secret.firecrawlApiKey ? await firecrawlMetadata(source, settings) : await directMetadata(source);
      await saveWebsite(source, metadata, now);
      found++;
    } catch (error) {
      failed++;
      const failures = Math.min(8, Number(source.failure_count || 0) + 1);
      const retryAt = new Date(Date.now() + Math.min(24, 2 ** (failures - 1)) * 3600000).toISOString();
      await query('UPDATE website_sources SET last_fetched_at=$1,next_retry_at=$2,failure_count=$3,last_error=$4 WHERE id=$5', [now, retryAt, failures, String(error).slice(0, 500), source.id]);
    }
    await sleepBetweenSources();
  }
  return { found, failed, provider: settings.secret.firecrawlApiKey ? 'firecrawl' : 'direct' };
}

const sleepBetweenSources = () => new Promise(resolve => setTimeout(resolve, 350));

export function candidateId(url, type) {
  return crypto.createHash('sha256').update(`${type}:${url}`).digest('hex').slice(0, 16);
}
