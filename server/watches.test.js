import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
delete process.env.DATABASE_URL;
process.env.DATA_MODE = 'demo';
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trend-watch-'));
const { ready, query } = await import('./db.js');
await ready;
const { grantTestPro } = await import('./test-pro-fixture.js');
const { addWatch, removeWatch, watchStatus, listWatches } = await import('./watches.js');

test('Watchlist stores a snapshot and reports changes since last visit', async () => {
  await grantTestPro('watcher');
  const added = await addWatch('watcher', 'skill', 'anthropic-pdf');
  assert.equal(added.watching, true);
  assert.equal((await watchStatus('watcher', 'skill', 'anthropic-pdf')).watching, true);
  await query(
    `UPDATE watches SET snapshot = snapshot || '{"stars":1,"rank":20}'::jsonb WHERE user_id='watcher'`
  );
  const listed = await listWatches('watcher', { markSeen: false });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].full_name.includes('pdf') || listed.items[0].id.includes('pdf'), true);
  assert.ok(listed.items[0].starDelta > 0);
  assert.ok(listed.items[0].rankDelta != null);
  const seen = await listWatches('watcher', { markSeen: true });
  assert.equal(seen.items[0].starDelta > 0, true);
  await removeWatch('watcher', 'skill', 'anthropic-pdf');
  assert.equal((await watchStatus('watcher', 'skill', 'anthropic-pdf')).watching, false);
  assert.equal((await listWatches('watcher', { markSeen: false })).items.length, 0);
});

test('Watchlist rejects missing items', async () => {
  await assert.rejects(() => addWatch('watcher', 'skill', 'missing-skill-id'), /not found/i);
});
