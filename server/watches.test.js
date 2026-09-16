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

test('reading or re-adding a Watch does not consume changes; explicit acknowledgement does', async () => {
  const { markWatchesSeen } = await import('./watches.js');
  await addWatch('watcher','skill','anthropic-pdf');
  await query(`UPDATE watches SET snapshot=snapshot || '{"stars":1}'::jsonb WHERE user_id='watcher'`);
  await addWatch('watcher','skill','anthropic-pdf');
  const first = await listWatches('watcher');
  const second = await listWatches('watcher');
  assert.ok(first.items[0].starDelta > 0);
  assert.equal(second.items[0].starDelta,first.items[0].starDelta);
  await markWatchesSeen('watcher',[{...second.items[0],sampledAt:'2000-01-01T00:00:00Z'}]);
  assert.equal((await listWatches('watcher')).items[0].starDelta,first.items[0].starDelta);
  const viewed = await listWatches('watcher');
  await markWatchesSeen('watcher',viewed.items);
  assert.equal((await listWatches('watcher')).items[0].starDelta,0);
  await removeWatch('watcher','skill','anthropic-pdf');
});

test('Watch ranks are available past the public page-size limit', async () => {
  const { getCatalogRankings } = await import('./catalog.js');
  const ids = [];
  try {
    for (let i=0;i<65;i++) {
      const id='watch-rank-limit-'+i; ids.push(id);
      await query(`INSERT INTO assets(id,type,slug,name,full_name,category,url,stars,forks,ranking_signals)
        VALUES($1,'skill',$1,$1,$1,'pdf','https://example.invalid',10,0,$2::jsonb)`,[id,JSON.stringify({installs:1000-i})]);
    }
    const publicPage = await getCatalogRankings('skill',{board:'hot',limit:200});
    assert.equal(publicPage.items.length,50);
    const all = await getCatalogRankings('skill',{board:'hot'},{all:true});
    const target=all.items[55];
    assert.ok(target);
    await addWatch('watcher','skill',target.slug);
    const item=(await listWatches('watcher')).items[0];
    assert.equal(item.rank,56);
    await removeWatch('watcher','skill',target.slug);
  } finally { await query('DELETE FROM assets WHERE id=ANY($1::text[])',[ids]); }
});

test('repository Watches match their own id rather than an absent slug', async () => {
  const { getCatalogRankings } = await import('./catalog.js');
  const ranking = await getCatalogRankings('github-repo',{board:'hot'});
  const target=ranking.items[1];
  assert.ok(target);
  await addWatch('watcher','github-repo',String(target.id));
  assert.equal((await listWatches('watcher')).items[0].rank,2);
  const { savedWatches } = await import('./watches.js');
  const saved=(await savedWatches('watcher')).items[0];
  assert.equal(saved.rank,undefined); assert.equal(saved.starDelta,undefined);
  await removeWatch('watcher','github-repo',String(target.id));
});
