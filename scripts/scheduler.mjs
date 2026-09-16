import { spawn } from 'node:child_process';
import pg from 'pg';
import { createScheduler } from './scheduler-core.mjs';

const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000 }) : null;
const children = new Set();
let stopping = false, wake;
const run = task => new Promise(resolve => {
  if (stopping) { resolve(false); return; }
  console.log(`[scheduler] ${task}`);
  const child = spawn(process.execPath, ['server/jobs.js', task], { stdio: 'inherit' });
  children.add(child);
  child.once('error', error => { console.error(`[scheduler] could not start ${task}`, error.message); children.delete(child); resolve(false); });
  child.once('close', (code, signal) => {
    children.delete(child);
    if (code !== 0) console.error(`[scheduler] ${task} exited ${code}${signal ? ` ${signal}` : ''}`);
    resolve(code === 0);
  });
});
const latestCollectDay = async () => {
  if (!pool) return '';
  // Use the sampling/start day, not a later completion day of a long collection.
  const result = await pool.query("SELECT MAX(started_at) AS at FROM sync_runs WHERE status IN ('ok','partial')");
  return result.rows[0]?.at ? new Date(result.rows[0].at).toISOString().slice(0, 10) : '';
};
const scheduler = createScheduler({ run, latestCollectDay });
const stop = () => {
  stopping = true;
  wake?.();
  for (const child of children) child.kill('SIGTERM');
  const escalation = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 10000);
  escalation.unref();
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
console.log('[scheduler] daily collection after 02:00 UTC; independent hourly delivery with missed-run recovery');
try {
  while (!stopping) {
    await scheduler.tick();
    if (!stopping) await new Promise(resolve => {
      const timer = setTimeout(() => { wake = undefined; resolve(); }, 30000);
      wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
    });
  }
} finally {
  await scheduler.settle();
  await pool?.end();
}
