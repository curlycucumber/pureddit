import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Request = IncomingMessage & { body?: unknown };
export type Profile = { id: string; name: string; karma: number; created: number };
export type Session = { access: string; refresh: string; expires: number; until: number; user: Profile };
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function configuration() {
  const { REDDIT_CLIENT_ID: clientId, REDDIT_CLIENT_SECRET: clientSecret, REDDIT_REDIRECT_URI: redirect, SESSION_SECRET: secret } = process.env;
  if (!clientId || !clientSecret || !redirect || !secret || Buffer.byteLength(secret) < 32) throw new ApiError(503, 'Reddit sign-in needs to be configured by the site owner.');
  let url: URL;
  try { url = new URL(redirect); } catch { throw new ApiError(503, 'Invalid Reddit callback configuration.'); }
  if (url.pathname !== '/api/auth/callback' || url.search || url.hash || url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new ApiError(503, 'Invalid Reddit callback configuration.');
  return { clientId, clientSecret, redirect, secret, origin: url.origin, secure: url.protocol === 'https:', userAgent: process.env.REDDIT_USER_AGENT || 'web:pureddit:0.2.0 (https://pureddit.vercel.app)' };
}
export function headers(res: ServerResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}
export function json(res: ServerResponse, status: number, data: unknown) {
  headers(res); res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data));
}
export function fail(res: ServerResponse, error: unknown) {
  json(res, error instanceof ApiError ? error.status : 502, { error: error instanceof ApiError ? error.message : 'Reddit is unavailable right now. Please try again.' });
}
export function seal(value: unknown, purpose: string) {
  const key = createHash('sha256').update(configuration().secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function unseal<T>(value: string | undefined, purpose: string): T | null {
  if (!value || value.length > 6000) return null;
  try {
    const key = createHash('sha256').update(configuration().secret).digest();
    const bytes = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28)); decipher.setAAD(Buffer.from(purpose));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
  } catch { return null; }
}
export function cookieName(purpose: string) { return `${configuration().secure ? '__Host-' : ''}pureddit_${purpose}`; }
export function readCookie(req: Request, purpose: string) {
  const prefix = `${cookieName(purpose)}=`;
  return (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(prefix))?.slice(prefix.length);
}
export function cookie(res: ServerResponse, purpose: string, value: string, seconds: number) {
  if (value.length > 3800) throw new ApiError(502, 'Reddit returned an oversized session. Please try signing in again.');
  const existing = res.getHeader('Set-Cookie');
  const entry = `${cookieName(purpose)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(seconds))}${configuration().secure ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', [...(Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : []), entry]);
}
export function saveSession(res: ServerResponse, session: Session) { cookie(res, 'session', seal(session, 'session'), (session.until - Date.now()) / 1000); }
export function readSession(req: Request) {
  const value = unseal<Session>(readCookie(req, 'session'), 'session');
  return value && typeof value.access === 'string' && typeof value.refresh === 'string' && value.until > Date.now() && value.user?.id && value.user?.name ? value : null;
}
export function validState(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function sameOrigin(req: Request) {
  if (req.headers.origin !== configuration().origin || req.headers['x-pureddit-request'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) throw new ApiError(403, 'This request must come from Pureddit.');
}
export async function body(req: Request): Promise<Record<string, unknown>> {
  let value = req.body;
  if (value === undefined) {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 50000) throw new ApiError(413, 'This request is too large.'); chunks.push(Buffer.from(chunk)); }
    value = Buffer.concat(chunks).toString();
  }
  if (typeof value === 'string') { if (Buffer.byteLength(value) > 50000) throw new ApiError(413, 'This request is too large.'); try { value = JSON.parse(value); } catch { throw new ApiError(400, 'Invalid JSON.'); } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Invalid request.');
  return value as Record<string, unknown>;
}
export async function tokenRequest(parameters: Record<string, string>) {
  const config = configuration();
  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': config.userAgent }, body: new URLSearchParams(parameters), signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, 'Reddit could not authorize this session. Check the app configuration or try again.');
  const result = await response.json();
  if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in <= 0 || result.error) throw new ApiError(401, 'Your Reddit authorization has expired. Please sign in again.');
  return result as { access_token: string; refresh_token?: string; expires_in: number };
}
export async function redditFetch(session: Session, res: ServerResponse, path: string, parameters?: URLSearchParams) {
  if (session.expires < Date.now() + 60000) {
    if (!session.refresh) throw new ApiError(401, 'Your Reddit session has expired. Please sign in again.');
    const token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refresh });
    session.access = token.access_token; session.refresh = token.refresh_token || session.refresh; session.expires = Date.now() + token.expires_in * 1000;
    saveSession(res, session);
  }
  const response = await fetch(`https://oauth.reddit.com${path}`, {
    method: parameters ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.access}`, 'User-Agent': configuration().userAgent, ...(parameters ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: parameters, signal: AbortSignal.timeout(20000), redirect: 'error',
  });
  if (response.status === 401) { cookie(res, 'session', '', 0); throw new ApiError(401, 'Your Reddit session has expired. Please sign in again.'); }
  if (response.status === 429) { res.setHeader('Retry-After', '60'); throw new ApiError(429, 'Reddit’s rate limit was reached. Please wait a minute before trying again.'); }
  if (!response.ok) throw new ApiError(response.status === 403 ? 403 : response.status === 404 ? 404 : 502, response.status === 403 ? 'Reddit denied this request. Check your app permissions and access to this community.' : response.status === 404 ? 'This Reddit post or community could not be found.' : 'Reddit could not complete this request. Please try again.');
  if (response.status === 204) return {};
  return response.json();
}
