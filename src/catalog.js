export const TYPES = ['skill', 'plugin', 'agent', 'components', 'website', 'github-repo'];
export const TYPE_META = {
  skill: { zh: 'Skill', en: 'Skills' },
  plugin: { zh: '插件 / MCP', en: 'Plugins' },
  agent: { zh: 'Agent', en: 'Agents' },
  components: { zh: '组件', en: 'Components' },
  website: { zh: '网站', en: 'Websites' },
  'github-repo': { zh: '仓库', en: 'Repositories' }
};
export const ASSET_BOARDS = {
  hot: ['热门', 'Hot'],
  rising: ['升得最快', 'Fastest rising'],
  new: ['新秀', 'Newcomers'],
  stars: ['关注最多', 'Most starred']
};
export const REPO_BOARDS = {
  hot: ['热门', 'Hot'],
  rising: ['升星最快', 'Fastest rising'],
  new: ['新秀项目', 'Newcomers'],
  ai: ['AI 热门', 'AI & agents'],
  topics: ['语言 / 主题', 'Language & topics'],
  stars: ['总星数', 'All-time stars'],
  forks: ['Fork 最多', 'Most forked']
};
export const boardNames = type => type === 'github-repo' ? REPO_BOARDS : ASSET_BOARDS;
export const typeLabel = (type, l) => (TYPE_META[type] || TYPE_META['github-repo'])[l === 'zh' ? 'zh' : 'en'];
export const itemPath = (l, type, id) => `/${l}/${type}/${encodeURI(String(id))}`;
export const typePath = (l, type, page = '', query = '') => {
  const suffix = page ? `/${page}` : '';
  return `/${l}/${type}${suffix}${query ? `?${query}` : ''}`;
};
export const TRENDING_COPY = {
  skill: {
    zh: { title: '正在被用起来的 Skill', sub: '看近窗口里涨得快的 Skill。官方和同类会标出来，选哪个由你。' },
    en: { title: 'Skills gaining ground', sub: 'What is rising in this window. Official and similar items are marked. You choose.' }
  },
  plugin: {
    zh: { title: '插件和 MCP 的热度', sub: '近窗口里动量最高的插件与 MCP。重复项收进同类。' },
    en: { title: 'Plugins and MCP on the move', sub: 'Servers and plugins with the strongest recent momentum. Duplicates are clustered.' }
  },
  agent: {
    zh: { title: '正在被用的 Agent', sub: '编程、研究、浏览器——同类 agent 很多时，先看近窗口前几名。' },
    en: { title: 'Agents people are actually running', sub: 'Coding, research, browser agents. When a category is crowded, start with the top movers.' }
  },
  components: {
    zh: { title: '组件库里正在涨的', sub: '按钮、Hero、原语——同类很多时，先看近窗口前几名。' },
    en: { title: 'Components picking up steam', sub: 'Buttons, heros, primitives. When a category is crowded, start with the top movers.' }
  },
  website: {
    zh: { title: '开源相关网站', sub: '目录站和项目官网。有关联仓库时按仓库热度排，有用量也会标出来。' },
    en: { title: 'Open-source sites', sub: 'Directories and project sites. Ranked by associated repository momentum, and by usage when we have it.' }
  },
  'github-repo': {
    zh: { title: '仓库近窗口热度', sub: 'Star 正在增加的仓库。这不是总榜，是最近在动的那些。' },
    en: { title: 'Repositories moving now', sub: 'Repos gaining stars in this window — not the all-time list, the ones in motion.' }
  }
};
export const trendingCopy = (type, l) => (TRENDING_COPY[type] || TRENDING_COPY['github-repo'])[l === 'zh' ? 'zh' : 'en'];
