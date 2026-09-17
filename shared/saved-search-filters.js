import { normalizeTopics } from './topics.js';
import { normalizeUseCase } from './taxonomy.js';
const types=['skill','plugin','agent','components','website','github-repo'];
const boards=['hot','rising','new','stars','official','ai','topics','forks'];
export function normalizeSavedFilters(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input))input={};
  const type=types.includes(input.type)?input.type:'github-repo';
  const supported=type==='github-repo'?boards:boards.filter(board=>!['ai','topics','forks'].includes(board));
  return { type,board:supported.includes(input.board)?input.board:'hot',period:['day','week','month'].includes(input.period)?input.period:'week',
    q:String(input.q || '').trim().slice(0,200),language:String(input.language || '').trim().slice(0,80),
    topic:normalizeTopics(String(input.topic || '').split(',')).slice(0,20).join(','),
    useCase:normalizeUseCase(input.useCase)||'',age:['30','90'].includes(String(input.age))?String(input.age):'' };
}
export function savedSearchPath(l,filters) {
  const {type,...query}=normalizeSavedFilters(filters);
  return `/${l==='zh'?'zh':'en'}/${type}/ranking?${new URLSearchParams(query)}`;
}
