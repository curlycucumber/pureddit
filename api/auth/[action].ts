import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { ApiError, configuration, cookie, fail, headers, json, readCookie, readSession, redditFetch, sameOrigin, saveSession, seal, tokenRequest, unseal, validState, type Profile, type Request, type Session } from '../../server/session.ts';

export const scopes = 'identity read mysubreddits vote submit edit subscribe save history';
export default async function handler(req: Request, res: ServerResponse) {
  headers(res);
  const action = new URL(req.url || '/', 'http://localhost').pathname.split('/').pop();
  let configured = false;
  try { configuration(); configured = true; } catch { /* Status is intentionally public, configuration values are not. */ }
  if (action === 'session' && req.method === 'GET' && !configured) { json(res, 200, { configured: false, authenticated: false }); return; }
  const redirect = (error?: string) => { res.statusCode = 302; res.setHeader('Location', error ? `/?auth_error=${error}#/home` : '/#/home'); res.end(); };
  try {
    const config = configuration();
    if (action === 'start' && req.method === 'GET') {
      const state = randomBytes(32).toString('base64url');
      cookie(res, 'oauth', seal({ state, until: Date.now() + 600000 }, 'oauth'), 600);
      const query = new URLSearchParams({ client_id: config.clientId, response_type: 'code', state, redirect_uri: config.redirect, duration: 'permanent', scope: scopes });
      res.statusCode = 302; res.setHeader('Location', `https://www.reddit.com/api/v1/authorize?${query}`); res.end(); return;
    }
    if (action === 'callback' && req.method === 'GET') {
      const query = new URL(req.url || '/', config.origin).searchParams;
      const state = unseal<{ state: string; until: number }>(readCookie(req, 'oauth'), 'oauth');
      cookie(res, 'oauth', '', 0);
      if (!state || state.until < Date.now() || !query.get('state') || !validState(query.get('state')!, state.state)) { redirect('invalid_state'); return; }
      if (query.has('error')) { redirect('denied'); return; }
      const code = query.get('code');
      if (!code || code.length > 2000) { redirect('authorization_failed'); return; }
      const token = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.redirect });
      const session: Session = { access: token.access_token, refresh: token.refresh_token || '', expires: Date.now() + token.expires_in * 1000, until: Date.now() + 30 * 86400000, user: { id: '', name: '', karma: 0, created: 0 } };
      const account = await redditFetch(session, res, '/api/v1/me');
      if (!account.id || !account.name) throw new ApiError(502, 'Reddit did not return an account.');
      session.user = { id: account.id, name: account.name, karma: (account.link_karma || 0) + (account.comment_karma || 0), created: account.created_utc * 1000 };
      saveSession(res, session); redirect(); return;
    }
    if (action === 'session' && req.method === 'GET') {
      const session = readSession(req);
      if (!session) { cookie(res, 'session', '', 0); json(res, 200, { configured: true, authenticated: false }); return; }
      const account = await redditFetch(session, res, '/api/v1/me');
      const user: Profile = { id: account.id, name: account.name, karma: (account.link_karma || 0) + (account.comment_karma || 0), created: account.created_utc * 1000 };
      json(res, 200, { configured: true, authenticated: true, user }); return;
    }
    if (action === 'logout' && req.method === 'POST') {
      sameOrigin(req);
      const session = readSession(req);
      let revoked = true;
      if (session) {
        try {
          const response = await fetch('https://www.reddit.com/api/v1/revoke_token', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': config.userAgent }, body: new URLSearchParams({ token: session.refresh || session.access, token_type_hint: session.refresh ? 'refresh_token' : 'access_token' }), signal: AbortSignal.timeout(15000), redirect: 'error' });
          revoked = response.ok;
        } catch { revoked = false; }
      }
      cookie(res, 'session', '', 0); cookie(res, 'oauth', '', 0);
      json(res, 200, { signedOut: true, revoked }); return;
    }
    throw new ApiError(405, 'This authentication action is not supported.');
  } catch (error) {
    if (action === 'callback' || action === 'start') { redirect(!configured ? 'not_configured' : 'authorization_failed'); return; }
    if (action === 'session') {
      if (error instanceof ApiError && error.status === 401 && configured) cookie(res, 'session', '', 0);
      json(res, 200, { configured, authenticated: false, error: error instanceof ApiError ? error.message : 'Could not verify your Reddit session. Please try again.' }); return;
    }
    fail(res, error);
  }
}
