import { spawn } from 'node:child_process';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = task => new Promise(resolve => {
  console.log(`[scheduler] ${task}`);
  const child = spawn('node', ['server/jobs.js', task], { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (code) console.error(`[scheduler] ${task} exited ${code}${signal ? ` ${signal}` : ''}`);
    resolve();
  });
});

let lastCollectDay = '';
let lastDigestHour = '';
console.log('[scheduler] waiting for collect at 02:00 UTC and digest each hour');
for (;;) {
  const now = new Date();
  const utcDay = now.toISOString().slice(0, 10);
  const utcHour = now.toISOString().slice(0, 13);
  if (now.getUTCHours() === 2 && now.getUTCMinutes() < 10 && lastCollectDay !== utcDay) {
    lastCollectDay = utcDay;
    await run('collect');
  }
  if (now.getUTCMinutes() < 10 && lastDigestHour !== utcHour) {
    lastDigestHour = utcHour;
    await run('digest');
  }
  await sleep(30_000);
}
