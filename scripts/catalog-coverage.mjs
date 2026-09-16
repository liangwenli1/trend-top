import fs from 'node:fs/promises';
import { ready, closeDb } from '../server/db.js';
import { getCoverageReport } from '../server/catalog-coverage.js';

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a file path`);
  return value;
};
try {
  const output = option('--output'), baseline = option('--baseline');
  await ready;
  const report = await getCoverageReport();
  if (baseline) {
    const previous = JSON.parse(await fs.readFile(baseline, 'utf8'));
    if (previous.benchmarkVersion !== report.benchmarkVersion || previous.mode !== report.mode || !Array.isArray(previous.entries) || previous.entries.map(entry => entry.id).sort().join(',') !== report.entries.map(entry => entry.id).sort().join(',')) throw new Error('Baseline must use the same benchmark version, sample and database mode');
    const coveredBefore = new Set(previous.entries.filter(entry => entry.status === 'covered').map(entry => entry.id));
    report.comparison = {
      previousGeneratedAt: previous.generatedAt,
      newlyCovered: report.entries.filter(entry => entry.status === 'covered' && !coveredBefore.has(entry.id)).map(entry => entry.id),
      noLongerCovered: report.entries.filter(entry => entry.status !== 'covered' && coveredBefore.has(entry.id)).map(entry => entry.id),
      statusChanges: report.entries.filter(entry => previous.entries.find(old => old.id === entry.id)?.status !== entry.status).map(entry => ({ id: entry.id, before: previous.entries.find(old => old.id === entry.id).status, after: entry.status }))
    };
  }
  const json = JSON.stringify(report, null, 2) + '\n';
  if (output) { await fs.writeFile(output, json); console.log(`Coverage report saved to ${output}`); }
  else console.log(json);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await closeDb(); }
