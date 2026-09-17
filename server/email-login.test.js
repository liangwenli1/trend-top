import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

delete process.env.DATABASE_URL;
delete process.env.PUBLIC_URL;
process.env.DATA_MODE = 'demo';
process.env.AUTH_SECRET = 'email-login-isolated-test-secret';
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trend-top-email-'));
const { app } = await import('./index.js');
const { ready, one, query } = await import('./db.js');
const { hashPassword } = await import('./auth.js');
const { grantTestPro } = await import('./test-pro-fixture.js');
await ready;

test('passwordless email sign-in preserves accounts and enforces ownership, expiry and one-time codes', async () => {
  const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}`;
  let sequence = 0;
  // Different synthetic client IPs isolate per-code checks from the hourly IP limit.
  const post = (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${++sequence}`, ...headers }, body: JSON.stringify(body) });
  const request = email => post('/api/auth/email/request', { email, locale: 'en' });
  const verify = (email, code) => post('/api/auth/email/verify', { email, code });
  const codeFor = async email => (await one('SELECT text FROM outbox WHERE to_email=$1 ORDER BY id DESC LIMIT 1', [email])).text.match(/code: (\d{6})/)[1];
  try {
    assert.equal((await request('not-an-email')).status, 400);
    assert.equal((await post('/api/auth/email/request', { email: 'blocked@example.invalid' }, { Origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await post('/api/auth/email/request', {}, { 'Content-Type': 'text/plain' })).status, 415);

    const email = 'new@example.invalid';
    assert.equal((await request(' NEW@example.invalid ')).status, 200);
    assert.equal(await one('SELECT id FROM users WHERE email=$1', [email]), null);
    const code = await codeFor(email);
    const stored = await one("SELECT * FROM auth_codes WHERE email=$1 AND purpose='login'", [email]);
    assert.notEqual(stored.code_hash, code);
    assert.equal(stored.password_hash, null);
    assert.equal((await request(email)).status, 429);
    assert.equal((await verify(email, '123')).status, 400);
    const wrongCode = code === '111111' ? '222222' : '111111';
    assert.equal((await verify(email, wrongCode)).status, 400);
    const loggedIn = await verify(email, code);
    assert.equal(loggedIn.status, 200);
    const user = (await loggedIn.json()).user;
    assert.equal(user.email, email);
    assert.equal(user.passwordEnabled, false);
    const cookie = loggedIn.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const headers = { Cookie: cookie.split(';')[0] };
    assert.equal((await (await fetch(base + '/api/auth/me', { headers })).json()).user.id, user.id);
    assert.equal((await (await fetch(base + '/api/billing/access', { headers })).json()).active, false);
    assert.equal((await verify(email, code)).status, 400);

    const oldEmail = 'existing@example.invalid', id = crypto.randomUUID(), passwordHash = await hashPassword('existing password remains');
    const now = new Date().toISOString();
    await query('INSERT INTO users(id,email,password_hash,password_enabled,locale,created_at,verified_at) VALUES($1,$2,$3,TRUE,$4,$5,$5)', [id, oldEmail, passwordHash, 'zh', now]);
    await grantTestPro(id);
    await query("INSERT INTO auth_identities(provider,subject,user_id,email,created_at) VALUES('google','existing-google-subject',$1,$2,$3)", [id, oldEmail, now]);
    await query("INSERT INTO subscriptions(id,email,user_id,locale,boards,send_hour,timezone,status,manage_hash,created_at,verified_at) VALUES('existing-delivery',$1,$2,'zh','[\"hot\"]',17,'Asia/Shanghai','unsubscribed','test-manage-hash',$3,$3)", [oldEmail,id,now]);
    assert.equal((await request(oldEmail)).status, 200);
    const oldLogin = await verify(oldEmail, await codeFor(oldEmail));
    assert.equal(oldLogin.status, 200);
    assert.equal((await oldLogin.json()).user.id, id);
    assert.deepEqual(await one('SELECT password_hash,locale,password_enabled FROM users WHERE id=$1', [id]), { password_hash: passwordHash, locale: 'zh', password_enabled: true });
    assert.equal((await (await fetch(base + '/api/billing/access', { headers: { Cookie: oldLogin.headers.get('set-cookie').split(';')[0] } })).json()).active, true);
    assert.equal((await post('/api/auth/login', { email: oldEmail, password: 'existing password remains' })).status, 200);
    assert.equal((await one("SELECT user_id FROM auth_identities WHERE subject='existing-google-subject'")).user_id, id);
    assert.deepEqual(await one("SELECT user_id,status,send_hour,timezone FROM subscriptions WHERE id='existing-delivery'"), { user_id:id,status:'unsubscribed',send_hour:17,timezone:'Asia/Shanghai' });

    const expired = 'expired@example.invalid';
    assert.equal((await request(expired)).status, 200);
    const expiredCode = await codeFor(expired);
    await query("UPDATE auth_codes SET expires_at=$1 WHERE email=$2 AND purpose='login'", [new Date(Date.now() - 1000).toISOString(), expired]);
    assert.equal((await verify(expired, expiredCode)).status, 400);
    assert.equal(await one('SELECT id FROM users WHERE email=$1', [expired]), null);

    const exhausted = 'attempts@example.invalid';
    assert.equal((await request(exhausted)).status, 200);
    const exhaustedCode = await codeFor(exhausted);
    for (let i = 0; i < 5; i++) assert.equal((await verify(exhausted, exhaustedCode === '333333' ? '444444' : '333333')).status, 400);
    assert.equal((await verify(exhausted, exhaustedCode)).status, 400);
    assert.equal(await one('SELECT id FROM users WHERE email=$1', [exhausted]), null);

    const raced = 'race@example.invalid';
    assert.deepEqual((await Promise.all([request(raced), request(raced)])).map(response => response.status).sort(), [200, 429]);
    assert.equal((await one('SELECT COUNT(*) AS n FROM outbox WHERE to_email=$1', [raced])).n, 1);
    const racedCode = await codeFor(raced);
    assert.deepEqual((await Promise.all([verify(raced, racedCode), verify(raced, racedCode)])).map(response => response.status).sort(), [200, 400]);
    assert.equal((await one('SELECT COUNT(*) AS n FROM users WHERE email=$1', [raced])).n, 1);

    const resendEmail = 'resend@example.invalid';
    assert.equal((await request(resendEmail)).status, 200);

    await query("UPDATE auth_codes SET sent_at=$1 WHERE email=$2 AND purpose='login'", [new Date(Date.now() - 61000).toISOString(), resendEmail]);
    assert.equal((await request(resendEmail)).status, 200);
    assert.equal((await one("SELECT COUNT(*) AS n FROM outbox WHERE to_email=$1", [resendEmail])).n, 2);
    assert.equal((await verify(resendEmail, await codeFor(resendEmail))).status, 200);

    const limitedIp = { 'X-Forwarded-For': '198.51.100.10' };
    for (let i = 0; i < 30; i++) assert.equal((await post('/api/auth/email/verify', { email:'limited@example.invalid',code:'000000' }, limitedIp)).status, 400);
    assert.equal((await post('/api/auth/email/request', { email:'limited@example.invalid' }, limitedIp)).status, 429);

    const purposeEmail = 'purpose@example.invalid';
    assert.equal((await post('/api/auth/register', { email: purposeEmail, password: 'legacy register password', locale: 'en' })).status, 200);
    const registerCode = await codeFor(purposeEmail);
    assert.equal((await verify(purposeEmail, registerCode)).status, 400);
    assert.equal((await post('/api/auth/register/verify', { email: purposeEmail, code: registerCode })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
