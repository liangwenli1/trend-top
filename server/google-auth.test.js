import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { safeAccountReturn, loginUrl } from '../shared/account-paths.js';

delete process.env.DATABASE_URL;
delete process.env.PUBLIC_URL;
process.env.DATA_MODE = 'demo';
process.env.AUTH_SECRET = 'google-auth-test-secret-with-enough-entropy';
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trend-top-google-'));

const { app } = await import('./index.js');
const { one, query } = await import('./db.js');
const { saveSettings } = await import('./settings.js');

test('account return paths never redirect to an external host', () => {
  for (const value of ['https://evil.invalid', '//evil.invalid', '/en/../../evil', '/en/\\evil', '/en/%2f%2fevil', '/en/%0aevil', '/login', '/admin']) assert.equal(safeAccountReturn(value), '/en/account');
  assert.equal(safeAccountReturn('/en/account/delivery?type=skill'), '/en/account/delivery?type=skill');
  assert.ok(loginUrl('zh', '/zh/account/subscription').startsWith('/login?locale=zh&next='));
});

test('Google OAuth binds PKCE, nonce and one-time state to the browser and reuses verified accounts', async () => {
  const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}`;
  const originals = { getToken: OAuth2Client.prototype.getToken, verifyIdToken: OAuth2Client.prototype.verifyIdToken };
  let claims = {}, tokenOptions, verificationOptions, rejectVerification = false;
  // Mock provider exchange only. Local HTTP routes, database, PKCE and cookies
  // run normally; no Google credentials or network sign-in are used here.
  OAuth2Client.prototype.getToken = async function (options) { tokenOptions = options; return { tokens: { id_token: 'provider-test-id-token' } }; };
  OAuth2Client.prototype.verifyIdToken = async function (options) { verificationOptions = options; if (rejectVerification) throw new Error('Invalid provider signature'); return { getPayload: () => claims }; };
  const get = (url, cookie = '') => fetch(base + url, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const start = async (next = '/en/account/delivery', cookie = '', link = false) => {
    const response = await get(`/api/auth/google?${new URLSearchParams({ locale: 'en', next, ...(link ? { link: '1' } : {}) })}`, cookie);
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.hostname, 'accounts.google.com');
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(location.searchParams.get('scope').includes('openid'));
    assert.ok(!location.searchParams.get('scope').includes('gmail'));
    const binding = response.headers.getSetCookie()[0].split(';')[0];
    return { state: location.searchParams.get('state'), nonce: location.searchParams.get('nonce'), challenge: location.searchParams.get('code_challenge'), cookie: [cookie, binding].filter(Boolean).join('; ') };
  };
  const callback = (flow, cookie = flow.cookie) => get(`/api/auth/google/callback?code=test-code&state=${flow.state}`, cookie);
  const session = response => response.headers.getSetCookie().find(cookie => cookie.startsWith('trend_top_session='))?.split(';')[0] || '';
  const register = async email => {
    assert.equal((await post('/api/auth/register', { email, password: 'a secure test password', locale: 'en' })).status, 200);
    const code = (await one('SELECT text FROM outbox WHERE to_email=$1 ORDER BY id DESC LIMIT 1', [email])).text.match(/code: (\d{6})/)[1];
    const response = await post('/api/auth/register/verify', { email, code });
    const user = (await response.json()).user;
    return { user, cookie: session(response) };
  };
  try {
    assert.equal((await (await get('/api/auth/providers')).json()).google, false);
    await saveSettings({ authentication: { googleEnabled: true, googleClientId: 'test-client.apps.googleusercontent.com' }, secrets: { googleClientSecret: 'test-google-client-secret' } });
    assert.equal((await (await get('/api/auth/providers')).json()).google, true);
    assert.doesNotMatch((await one("SELECT secret_data FROM app_settings WHERE key='site'")).secret_data, /test-google-client-secret/);
    const flow = await start();
    claims = { sub: 'google-new', email: 'new.user@gmail.com', email_verified: true, nonce: flow.nonce };
    const wrongBrowser = await callback(flow, `trend_top_google_state=${'f'.repeat(64)}`);
    assert.ok(wrongBrowser.headers.get('location').includes('error=google_failed'));
    assert.equal(session(wrongBrowser), '');
    const completed = await callback(flow);
    assert.equal(completed.headers.get('location'), '/en/account/delivery');
    assert.equal(verificationOptions.audience, 'test-client.apps.googleusercontent.com');
    assert.equal(verificationOptions.idToken, 'provider-test-id-token');
    assert.equal(crypto.createHash('sha256').update(tokenOptions.codeVerifier).digest('base64url'), flow.challenge);
    assert.equal(tokenOptions.redirect_uri, base + '/api/auth/google/callback');
    const newCookie = session(completed), user = (await (await get('/api/auth/me', newCookie)).json()).user;
    assert.equal(user.email, claims.email);
    assert.equal(user.passwordEnabled, false);
    assert.ok(completed.headers.getSetCookie().some(value => value.includes('Max-Age=0')));
    assert.equal(session(await callback(flow)), '');

    const existing = await register('existing.user@gmail.com'), reuse = await start('/en/account');
    claims = { sub: 'google-existing', email: existing.user.email, email_verified: true, nonce: reuse.nonce };
    assert.equal((await (await get('/api/auth/me', session(await callback(reuse)))).json()).user.id, existing.user.id);
    assert.equal(Number((await one('SELECT COUNT(*) AS n FROM users WHERE email=$1', [existing.user.email])).n), 1);

    const untrustedEmail = await start();
    claims = { sub: 'google-third-party', email: 'external@example.invalid', email_verified: true, nonce: untrustedEmail.nonce };
    assert.ok((await callback(untrustedEmail)).headers.get('location').includes('email_verification_required'));
    assert.equal(await one('SELECT id FROM users WHERE email=$1', [claims.email]), null);
    const thirdParty = await register(claims.email), linking = await start('/en/account', thirdParty.cookie, true);
    claims.nonce = linking.nonce;
    assert.equal((await callback(linking)).headers.get('location'), '/en/account');
    assert.equal((await (await get('/api/auth/methods', thirdParty.cookie)).json()).google.email, thirdParty.user.email);

    const wrongNonce = await start();
    claims = { sub: 'nonce-attacker', email: 'attacker@gmail.com', email_verified: true, nonce: 'different-nonce' };
    assert.equal(session(await callback(wrongNonce)), '');
    const invalidToken = await start(); claims.nonce = invalidToken.nonce; rejectVerification = true;
    assert.equal(session(await callback(invalidToken)), ''); rejectVerification = false;
    const expired = await start();
    await query('UPDATE auth_oauth_states SET expires_at=$1 WHERE state_hash=$2', [new Date(Date.now() - 1000).toISOString(), crypto.createHash('sha256').update(expired.state).digest('hex')]);
    assert.equal(session(await callback(expired)), '');
    const changedSession = await start('/en/account', existing.cookie, true);
    claims = { sub: 'google-existing', email: existing.user.email, email_verified: true, nonce: changedSession.nonce };
    assert.ok((await callback(changedSession, `${newCookie}; ${changedSession.cookie.split('; ').at(-1)}`)).headers.get('location').includes('link_failed'));
    assert.equal(await one("SELECT id FROM users WHERE email='attacker@gmail.com'"), null);
    await saveSettings({ authentication: { googleEnabled: false } });
    assert.equal((await (await get('/api/auth/providers')).json()).google, false);
    assert.ok((await get('/api/auth/google')).headers.get('location').includes('google_unavailable'));
  } finally { OAuth2Client.prototype.getToken = originals.getToken; OAuth2Client.prototype.verifyIdToken = originals.verifyIdToken; server.close(); }
});
