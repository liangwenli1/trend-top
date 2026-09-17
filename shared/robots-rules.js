// Applicable user-agent groups, longest matching path, Allow wins equal length.
export function robotsAllows(text, url, agent = 'trendtopbot') {
  const groups = [];
  let group = { agents: [], rules: [] }, startedRules = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const match = raw.replace(/#.*$/, '').trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase(), value = match[2].trim();
    if (key === 'user-agent') {
      if (startedRules) { groups.push(group); group = { agents: [], rules: [] }; startedRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (['allow','disallow'].includes(key) && group.agents.length) {
      startedRules = true;
      if (value) group.rules.push({ allow: key === 'allow', path: value });
    }
  }
  groups.push(group);
  const specificity = g => Math.max(-1, ...g.agents.map(a => a === '*' ? 0 : agent.toLowerCase().includes(a) ? a.length : -1));
  const best = Math.max(-1, ...groups.map(specificity));
  const parsed = new URL(url), path = parsed.pathname + parsed.search;
  let winner = null;
  for (const g of groups.filter(g => specificity(g) === best && best >= 0)) {
    for (const rule of g.rules) {
      const expression = '^' + rule.path.split('*').map(part => part.replace(/[.+?^{}()|[\]\\]/g, '\\$&')).join('.*');
      const length = rule.path.replace(/[*$]/g, '').length;
      if (new RegExp(expression).test(path) && (!winner || length > winner.length || length === winner.length && rule.allow)) winner = { ...rule, length };
    }
  }
  return winner?.allow ?? true;
}
