import { CLASSIFICATION_VERSION, classify, officialEvidenceFor } from '../shared/taxonomy.js';

// Uses the initialized adapter directly so this can also run during database startup.
export async function backfillUseCases(adapter) {
  // Legacy directory counts were copied to every Skill in a repository.
  // Keep provenance, but discard those unscoped counts until the directory matches a resource.
  await adapter.query(`UPDATE assets SET ranking_signals=ranking_signals - 'installs' - 'usage' - 'downloads'
    WHERE type='skill' AND taxonomy_version<>$1 AND ranking_signals ? 'directory'
      AND NOT (ranking_signals ? 'directoryMetrics')`, [CLASSIFICATION_VERSION]);
  const registryRows = await adapter.query(`SELECT * FROM assets WHERE taxonomy_version<>$1
    AND official_evidence='Official MCP Registry'`, [CLASSIFICATION_VERSION]);
  for (const row of registryRows.rows) {
    const evidence = officialEvidenceFor(row);
    await adapter.query('UPDATE assets SET official_evidence=$1,official=$2 WHERE id=$3', [evidence, Boolean(evidence), row.id]);
  }
  let updated = 0;
  for (const table of ['repos', 'assets']) {
    const { rows } = await adapter.query(`SELECT * FROM ${table} WHERE use_case IS NULL OR taxonomy_version <> $1`, [CLASSIFICATION_VERSION]);
    for (let offset = 0; offset < rows.length; offset += 500) {
      const values = rows.slice(offset, offset + 500).map(row => {
        const topics = typeof row.topics === 'string' ? JSON.parse(row.topics) : row.topics;
        const signals = typeof row.ranking_signals === 'string' ? JSON.parse(row.ranking_signals) : row.ranking_signals;
        const result = classify({ ...row, topics, ranking_signals: signals, use_case: null });
        return { id: String(row.id), use_case: result.useCase };
      });
      await adapter.query(`UPDATE ${table} t SET use_case=v.use_case, taxonomy_version=$2
        FROM jsonb_to_recordset($1::jsonb) AS v(id text,use_case text) WHERE t.id::text=v.id`, [JSON.stringify(values), CLASSIFICATION_VERSION]);
      updated += values.length;
    }
  }
  return { updated, version: CLASSIFICATION_VERSION };
}
