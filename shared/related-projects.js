import { normalizeTopics } from './topics.js';
import { productKey } from './product-resources.js';

export const broadTopics = new Set(['ai','llm','agents','mcp','api','web','python','javascript','typescript','rust','go','developer-tools','open-source','awesome-list']);
const narrowTopics = item => normalizeTopics(item.topics || []).filter(topic => !broadTopics.has(topic));
const purposePatterns = [ /\b(pdf|ocr)\b/i, /\b(scraping|scrape|crawler|crawling)\b/i, /\b(browser automation|browser testing)\b/i, /\b(sql|postgres|postgresql|database client)\b/i, /\b(design system|ui components|component library)\b/i, /\b(coding agent|code assistant)\b/i, /\b(research agent|research assistant)\b/i ];
const purposes = item => purposePatterns.flatMap((pattern, index) => pattern.test(`${item.full_name || ''} ${item.description || ''}`) ? [index] : []);

export function rankRelated(item, candidates) {
  const topics = new Set(narrowTopics(item)), uses = new Set(purposes(item));
  const category = String(item.category || '').toLowerCase();
  const seen = new Set([productKey(item)]);
  const scored = candidates.filter(other => other.type === item.type && String(other.id) !== String(item.id)).map(other => {
    const shared = narrowTopics(other).filter(topic => topics.has(topic)).length;
    const purpose = purposes(other).filter(use => uses.has(use)).length;
    const sameCategory = category && !broadTopics.has(category) && category !== item.type && category === String(other.category || '').toLowerCase();
    return { item: other, score: shared * 4 + purpose * 5 + (sameCategory ? 6 : 0) };
  }).filter(entry => entry.score >= 4).sort((a,b) => b.score-a.score || Number(b.item.stars || 0)-Number(a.item.stars || 0) || String(a.item.id).localeCompare(String(b.item.id)));
  return scored.filter(entry => { const key=productKey(entry.item); if(seen.has(key))return false;seen.add(key);return true; }).map(entry => entry.item);
}
