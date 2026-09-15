import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { one, query } from './db.js';
import { sendMail } from './mail.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'trend_top_session';
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const attemptsByIp = new Map();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const respondError = (res, status, error) => res.status(status).json({ error });
const DEFAULT_ADMIN_EMAILS = ['zhangyuge.ghs@gmail.com'];
export const adminEmails = () => new Set(
  String(process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS.join(','))
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
);
export const isAdminEmail = email => adminEmails().has(normalizeEmail(email));
const publicUser = user => user ? { id: user.id, email: user.email, locale: user.locale, isAdmin: isAdminEmail(user.email) } : null;

function codeSecret() {
  const secret = process.env.AUTH_SECRET || process.env.ADMIN_TOKEN;
  if (secret) return secret;
  if ((process.env.DATA_MODE || 'demo') === 'demo') return 'local-demo-code-secret';
  throw new Error('AUTH_SECRET or ADMIN_TOKEN is required for account verification');
}

function codeHash(email, purpose, code) {
  return crypto.createHmac('sha256', codeSecret()).update(`${purpose}:${email}:${code}`).digest('hex');
}

function equalHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const result = await scrypt(password, salt, 64);
  return `${salt}:${result.toString('hex')}`;
}

async function checkPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected || expected.length !== 128) return false;
  const actual = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

function cookieValue(req) {
  const cookie = String(req.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
  return cookie?.slice(COOKIE.length + 1) || '';
}

function sessionCookie(req, token, maxAge) {
  const secure = String(process.env.PUBLIC_URL || '').startsWith('https://') || req.secure;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 86400000);
  await query('INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES ($1,$2,$3,$4)', [digest(token), userId, expires.toISOString(), created.toISOString()]);
  res.set('Set-Cookie', sessionCookie(req, token, SESSION_DAYS * 86400));
}

export async function authUser(req) {
  const token = cookieValue(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return one(
    `SELECT u.id, u.email, u.locale FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [digest(token), new Date().toISOString()]
  );
}

export async function requireUser(req, res, next) {
  const user = await authUser(req);
  if (!user) return respondError(res, 401, 'Sign in to manage your subscription');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.get('origin');
    const expected = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).origin : `${req.protocol}://${req.get('host')}`;
    const localDemoOrigin = (process.env.DATA_MODE || 'demo') === 'demo' && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin || '');
    if (origin && origin !== expected && origin !== `${req.protocol}://${req.get('host')}` && !localDemoOrigin) return respondError(res, 403, 'Invalid request origin');
    if (!req.is('application/json')) return respondError(res, 415, 'JSON request required');
  }
  req.user = user;
  next();
}

function rate(req, res, next) {
  const key = req.ip || 'local';
  const now = Date.now();
  const recent = (attemptsByIp.get(key) || []).filter(time => now - time < 3600000);
  if (recent.length >= 30) return respondError(res, 429, 'Too many account requests. Try again later.');
  recent.push(now);
  attemptsByIp.set(key, recent);
  next();
}

async function sendCode(email, locale, purpose, passwordHash) {
  const existing = await one('SELECT sent_at FROM auth_codes WHERE email = $1 AND purpose = $2', [email, purpose]);
  if (existing && Date.now() - new Date(existing.sent_at).getTime() < 60000) return false;
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = new Date();
  await query(
    `INSERT INTO auth_codes (email, purpose, code_hash, password_hash, locale, expires_at, sent_at, attempts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0)
     ON CONFLICT (email, purpose) DO UPDATE SET code_hash=EXCLUDED.code_hash,
       password_hash=EXCLUDED.password_hash, locale=EXCLUDED.locale,
       expires_at=EXCLUDED.expires_at, sent_at=EXCLUDED.sent_at, attempts=0`,
    [email, purpose, codeHash(email, purpose, code), passwordHash, locale, new Date(now.getTime() + CODE_MINUTES * 60000).toISOString(), now.toISOString()]
  );
  const zh = locale === 'zh';
  const action = purpose === 'register' ? (zh ? '注册' : 'registration') : (zh ? '重设密码' : 'password reset');
  const subject = zh ? `Trend Top ${action}验证码` : `Trend Top ${action} code`;
  const text = zh ? `你的${action}验证码：${code}\n10 分钟内有效。若非本人操作，请忽略。` : `Your ${action} code: ${code}\nIt expires in 10 minutes. Ignore this message if you did not request it.`;
  const html = `<div style="font:16px/1.6 Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#171717"><h1>Trend Top</h1><p>${zh ? `你的${action}验证码：` : `Your ${action} code:`}</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>${zh ? '10 分钟内有效。若非本人操作，请忽略。' : 'Expires in 10 minutes. Ignore if you did not request it.'}</p></div>`;
  try { await sendMail(email, subject, text, html); }
  catch (error) {
    await query('DELETE FROM auth_codes WHERE email = $1 AND purpose = $2 AND code_hash = $3', [email, purpose, codeHash(email, purpose, code)]);
    throw error;
  }
  return true;
}

async function consumeCode(email, purpose, code) {
  const record = await one('SELECT * FROM auth_codes WHERE email = $1 AND purpose = $2', [email, purpose]);
  if (!record || new Date(record.expires_at).getTime() < Date.now() || Number(record.attempts) >= 5) return null;
  await query('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = $1 AND purpose = $2', [email, purpose]);
  if (!equalHex(record.code_hash, codeHash(email, purpose, code))) return null;
  return record;
}

export function registerAuthRoutes(app) {
  app.get('/api/auth/me', async (req, res) => {
    const user = await authUser(req);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/register', rate, async (req, res) => {
    const email = normalizeEmail(req.body?.email), password = String(req.body?.password || ''), locale = req.body?.locale === 'en' ? 'en' : 'zh';
    if (!emailRe.test(email) || email.length > 254 || password.length < 10 || password.length > 128) return respondError(res, 400, 'Enter a valid email and a password of 10–128 characters');
    if (await one('SELECT id FROM users WHERE email = $1', [email])) return respondError(res, 409, 'Account already exists. Sign in.');
    try {
      if (!await sendCode(email, locale, 'register', await hashPassword(password))) return respondError(res, 429, 'Wait one minute before requesting another code');
      res.json({ ok: true });
    } catch { respondError(res, 503, 'Verification email could not be sent'); }
  });

  app.post('/api/auth/register/verify', rate, async (req, res) => {
    const email = normalizeEmail(req.body?.email), code = String(req.body?.code || '');
    if (!/^\d{6}$/.test(code)) return respondError(res, 400, 'Invalid verification code');
    const record = await consumeCode(email, 'register', code);
    if (!record) return respondError(res, 400, 'Code expired or incorrect');
    const id = crypto.randomUUID(), now = new Date().toISOString();
    const result = await query(
      `INSERT INTO users (id, email, password_hash, locale, created_at, verified_at)
       VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [id, email, record.password_hash, record.locale, now]
    );
    if (!result.rows.length) return respondError(res, 409, 'Account already exists. Sign in.');
    await query('UPDATE subscriptions SET user_id = $1, status = CASE WHEN status = $3 THEN $4 ELSE status END, verified_at = COALESCE(verified_at, $5) WHERE email = $2 AND user_id IS NULL', [id, email, 'pending', 'active', now]);
    await query('DELETE FROM auth_codes WHERE email = $1 AND purpose = $2', [email, 'register']);
    await createSession(req, res, id);
    res.json({ ok: true, user: publicUser({ id, email, locale: record.locale }) });
  });

  app.post('/api/auth/login', rate, async (req, res) => {
    const email = normalizeEmail(req.body?.email), password = String(req.body?.password || '');
    const user = await one('SELECT id, email, locale, password_hash FROM users WHERE email = $1', [email]);
    if (!user || !await checkPassword(password, user.password_hash)) return respondError(res, 401, 'Incorrect email or password');
    await createSession(req, res, user.id);
    res.json({ ok: true, user: publicUser(user) });
  });

  app.post('/api/auth/logout', requireUser, async (req, res) => {
    const token = cookieValue(req);
    await query('DELETE FROM auth_sessions WHERE token_hash = $1', [digest(token)]);
    res.set('Set-Cookie', sessionCookie(req, '', 0));
    res.json({ ok: true });
  });

  app.post('/api/auth/password/reset/request', rate, async (req, res) => {
    const email = normalizeEmail(req.body?.email), locale = req.body?.locale === 'en' ? 'en' : 'zh';
    if (!emailRe.test(email)) return respondError(res, 400, 'Invalid email address');
    if (await one('SELECT id FROM users WHERE email = $1', [email])) {
      try { await sendCode(email, locale, 'reset', null); }
      catch { return respondError(res, 503, 'Reset email could not be sent'); }
    }
    res.json({ ok: true });
  });

  app.post('/api/auth/password/reset', rate, async (req, res) => {
    const email = normalizeEmail(req.body?.email), code = String(req.body?.code || ''), password = String(req.body?.password || '');
    if (!/^\d{6}$/.test(code) || password.length < 10 || password.length > 128) return respondError(res, 400, 'Invalid code or password');
    const record = await consumeCode(email, 'reset', code);
    if (!record) return respondError(res, 400, 'Code expired or incorrect');
    const user = await one('SELECT id FROM users WHERE email = $1', [email]);
    if (!user) return respondError(res, 400, 'Code expired or incorrect');
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), user.id]);
    await query('DELETE FROM auth_sessions WHERE user_id = $1', [user.id]);
    await query('DELETE FROM auth_codes WHERE email = $1 AND purpose = $2', [email, 'reset']);
    res.json({ ok: true });
  });
}
