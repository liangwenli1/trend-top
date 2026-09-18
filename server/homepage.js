import { many, dataSource } from './db.js';
import { TYPES, getTypeSummary, getCatalogRankings } from './catalog.js';
import { USE_CASES } from '../shared/taxonomy.js';
import { selectHomeItems } from '../shared/home-discovery.js';

const taskIds = ['browser', 'coding', 'ui', 'documents', 'research', 'git'];

export async function getHomeDiscovery({ type = '', useCase = '' } = {}) {
  const selectedTypes = type ? [type] : TYPES;
  const [summary, collections, taskRows] = await Promise.all([
    getTypeSummary(),
    Promise.all(selectedTypes.map(async type => {
      const hot = await getCatalogRankings(type, { board: 'hot', period: 'week', limit: 12, useCase });
      if (hot.items.length) return hot;
      // A catalog fallback remains useful without pretending that unknown momentum is a trend.
      return getCatalogRankings(type, { board: 'stars', period: 'week', limit: 12, useCase });
    })),
    many(`SELECT DISTINCT use_case FROM assets WHERE active=TRUE
      UNION SELECT DISTINCT use_case FROM repos WHERE active=TRUE AND deleted=FALSE AND archived=FALSE AND source=$1`, [dataSource()])
  ]);
  const available = new Set(taskRows.map(row => row.use_case));
  return {
    ...summary, period: 'week', type, useCase,
    items: selectHomeItems(collections),
    tasks: taskIds.filter(id => available.has(id)).map(id => ({ id, ...USE_CASES[id] })),
    generatedAt: new Date().toISOString(),
    partial: collections.some(collection => collection.stale || collection.dataInsufficient),
    selection: 'type-board-round-robin',
    // Actual sample dates belong to each item. This is not a synchronized global leaderboard.
    collections: collections.map(collection => ({ type: collection.type, board: collection.board, updatedAt: collection.updatedAt || null }))
  };
}
