import { spawn } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = task => new Promise(resolve => {
  console.log(`[scheduler] ${task}`);
  const child = spawn('node', ['server/jobs.js', task], { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (code) console.error(`[scheduler] ${task} exited ${code}${signal ? ` ${signal}` : ''}`);
    resolve(code === 0);
  });
});

async function latestSuccessfulCollectDay() {
  if (!pool) return '';
  try {
    // A completed partial run keeps valid catalog updates. Optional directory failures
    // must not trigger an expensive full recollection every hour.
    const result = await pool.query("SELECT MAX(finished_at) AS finished_at FROM sync_runs WHERE status IN ('ok','partial')");
    return result.rows[0]?.finished_at ? new Date(result.rows[0].finished_at).toISOString().slice(0, 10) : '';
  } catch (error) {
    console.error('[scheduler] could not read last collection time', error.message);
    return '';
  }
}

let lastCollectAttemptHour = '';
let fallbackCollectDay = '';
let lastDigestHour = '';
console.log('[scheduler] collect after 02:00 UTC with missed-run recovery; digest each hour');
for (;;) {
  const now = new Date();
  const utcDay = now.toISOString().slice(0, 10);
  const utcHour = now.toISOString().slice(0, 13);
  const collectionDue = pool
    ? now.getUTCHours() >= 2 && lastCollectAttemptHour !== utcHour
    : now.getUTCHours() === 2 && now.getUTCMinutes() < 10 && fallbackCollectDay !== utcDay;
  if (collectionDue) {
    const latestDay = pool ? await latestSuccessfulCollectDay() : '';
    if (!pool || latestDay !== utcDay) {
      lastCollectAttemptHour = utcHour;
      fallbackCollectDay = utcDay;
      await run('collect');
    }
  }
  if (now.getUTCMinutes() < 10 && lastDigestHour !== utcHour) {
    lastDigestHour = utcHour;
    await run('digest');
  }
  await sleep(30_000);
}
