import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { one, query } from './db.js';
import { getSettings } from './settings.js';
import { authUser, authRate, createSession, hashPassword } from './auth.js';
import { loginUrl, safeAccountReturn } from '../shared/account-paths.js';

const COOKIE = 'trend_top_google_state';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const browserToken = req => String(req.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
const publicOrigin = req => new URL(process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).origin;
export const googleCallbackUrl = req => `${publicOrigin(req)}/api/auth/google/callback`;
const stateCookie = (req, value, age) => `${COOKIE}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${age}${publicOrigin(req).startsWith('https:') ? '; Secure' : ''}`;
const clientFor = (settings, req) => new OAuth2Client({ clientId: settings.public.authentication.googleClientId, clientSecret: settings.secret.googleClientSecret, redirectUri: googleCallbackUrl(req), transporterOptions: { timeout: 12000 } });
const enabled = settings => Boolean(settings.public.authentication.googleEnabled && settings.public.authentication.googleClientId && settings.secret.googleClientSecret);

async function googleUser(claims, state, req) {
  const email = String(claims.email || '').trim().toLowerCase();
  if (!claims.sub || String(claims.sub).length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || claims.email_verified !== true) throw new Error('unverified');
  const identity = await one("SELECT u.* FROM auth_identities i JOIN users u ON u.id=i.user_id WHERE i.provider='google' AND i.subject=$1", [claims.sub]);
  let user;
  if (state.link_user_id) {
    // Linking needs the same authenticated browser session at both ends of OAuth.
    user = await authUser(req);
    if (!user || user.id !== state.link_user_id || user.email !== email || (identity && identity.id !== user.id)) throw new Error('link_failed');
  } else if (identity) return identity;
  else {
    // Google is authoritative for Gmail / verified Workspace addresses only.
    // Third-party email accounts must verify ownership with our email code first.
    if (!email.endsWith('@gmail.com') && !claims.hd) throw new Error('email_verification_required');
    user = await one('SELECT * FROM users WHERE email=$1', [email]);
    if (!user) {
      const now = new Date().toISOString(), id = crypto.randomUUID();
      const result = await query(`INSERT INTO users (id,email,password_hash,password_enabled,locale,created_at,verified_at)
        VALUES ($1,$2,$3,FALSE,$4,$5,$5) ON CONFLICT (email) DO NOTHING RETURNING *`, [id, email, await hashPassword(crypto.randomBytes(48).toString('hex')), state.locale, now]);
      user = result.rows[0] || await one('SELECT * FROM users WHERE email=$1', [email]);
      await query(`UPDATE subscriptions SET user_id=$1, status=CASE WHEN status='pending' THEN 'active' ELSE status END,
        verified_at=COALESCE(verified_at,$3) WHERE email=$2 AND user_id IS NULL`, [user.id, email, now]);
    }
  }
  const result = await query(`INSERT INTO auth_identities (provider,subject,user_id,email,created_at)
    VALUES ('google',$1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING subject`, [claims.sub, user.id, email, new Date().toISOString()]);
  if (!result.rows.length && !(await one("SELECT subject FROM auth_identities WHERE provider='google' AND subject=$1 AND user_id=$2", [claims.sub, user.id]))) throw new Error('link_failed');
  return user;
}

export function registerGoogleAuthRoutes(app) {
  app.get('/api/auth/providers', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ google: enabled(await getSettings()) });
  });
  app.get('/api/auth/google', authRate, async (req, res) => {
    const settings = await getSettings(), locale = req.query.locale === 'zh' ? 'zh' : 'en', next = safeAccountReturn(req.query.next, locale);
    if (!enabled(settings)) return res.redirect(loginUrl(locale, next) + '&error=google_unavailable');
    const linkUser = req.query.link === '1' ? await authUser(req) : null;
    if (req.query.link === '1' && !linkUser) return res.redirect(loginUrl(locale, next));
    const state = crypto.randomBytes(32).toString('hex'), binding = crypto.randomBytes(32).toString('hex'), nonce = crypto.randomBytes(32).toString('hex');
    const client = clientFor(settings, req), { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    await query('DELETE FROM auth_oauth_states WHERE expires_at<$1', [new Date().toISOString()]);
    await query(`INSERT INTO auth_oauth_states (state_hash,browser_hash,code_verifier,nonce,next_path,locale,link_user_id,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [hash(state), hash(binding), codeVerifier, nonce, next, locale, linkUser?.id || null, new Date(Date.now() + 600000).toISOString()]);
    res.set('Cache-Control', 'no-store').append('Set-Cookie', stateCookie(req, binding, 600));
    const url = new URL(client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], access_type: 'online', prompt: 'select_account', state, code_challenge: codeChallenge, code_challenge_method: 'S256' }));
    url.searchParams.set('nonce', nonce);
    res.redirect(url.toString());
  });
  app.get('/api/auth/google/callback', authRate, async (req, res) => {
    res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer');
    const stateValue = String(req.query.state || ''), binding = browserToken(req);
    if (!/^[a-f0-9]{64}$/.test(stateValue) || !/^[a-f0-9]{64}$/.test(binding)) return res.redirect(loginUrl('en') + '&error=google_failed');
    const result = await query(`DELETE FROM auth_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>$3 RETURNING *`, [hash(stateValue), hash(binding), new Date().toISOString()]);
    const state = result.rows[0];
    res.append('Set-Cookie', stateCookie(req, '', 0));
    if (!state) return res.redirect(loginUrl('en') + '&error=google_failed');
    try {
      if (req.query.error || !req.query.code || String(req.query.code).length > 2048) throw new Error('google_failed');
      const settings = await getSettings();
      if (!enabled(settings)) throw new Error('google_unavailable');
      const client = clientFor(settings, req), { tokens } = await client.getToken({ code: String(req.query.code), codeVerifier: state.code_verifier, redirect_uri: googleCallbackUrl(req) });
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: settings.public.authentication.googleClientId });
      const claims = ticket.getPayload();
      if (!claims || claims.nonce !== state.nonce) throw new Error('google_failed');
      const user = await googleUser(claims, state, req);
      await createSession(req, res, user.id);
      res.redirect(safeAccountReturn(state.next_path, state.locale));
    } catch (error) {
      const code = ['email_verification_required', 'link_failed', 'google_unavailable'].includes(error.message) ? error.message : 'google_failed';
      // Never include provider tokens or raw errors in the browser URL/logs.
      res.redirect(loginUrl(state.locale, state.next_path) + `&error=${code}`);
    }
  });
}
