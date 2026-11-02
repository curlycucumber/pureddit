import { createHash } from 'node:crypto';
import { ApiError } from './session.ts';

type AppConfig = { id: string; secret: string; userAgent: string; key: string };
let cached: { key: string; token: string; until: number } | undefined;
let pending: { key: string; request: Promise<string> } | undefined;

export function appConfig(): AppConfig | null {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id && !secret) return null;
  if (!id || !secret) throw new ApiError(503, 'The site owner needs to finish configuring Reddit application access.');
  return { id, secret, userAgent: process.env.REDDIT_USER_AGENT || 'web:pureddit:0.2.0 (https://pureddit.vercel.app)', key: createHash('sha256').update(JSON.stringify([id, secret])).digest('hex') };
}

async function issueToken(config: AppConfig) {
  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.id}:${config.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': config.userAgent },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'read' }), signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (response.status === 429) throw new ApiError(429, 'Reddit rate-limited application authorization. Please wait before retrying.');
  if ([400, 401, 403].includes(response.status)) throw new ApiError(403, 'Reddit denied application authorization. The site owner must check the app credentials and approved API access.');
  if (!response.ok) throw new ApiError(502, 'Reddit could not authorize this application. Please try again later.');
  let data;
  try { data = await response.json(); } catch { throw new ApiError(502, 'Reddit returned an invalid application authorization response.'); }
  if (data?.error || typeof data?.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || String(data.token_type).toLowerCase() !== 'bearer') throw new ApiError(403, 'Reddit did not grant an application token. The site owner must check approved API access.');
  cached = { key: config.key, token: data.access_token, until: Date.now() + data.expires_in * 1000 - 30000 };
  return data.access_token as string;
}

async function accessToken(config: AppConfig) {
  if (cached?.key === config.key && cached.until > Date.now()) return cached.token;
  if (pending?.key === config.key) return pending.request;
  const request = issueToken(config);
  pending = { key: config.key, request };
  try { return await request; } finally { if (pending?.request === request) pending = undefined; }
}

export async function appReddit(path: string, config: AppConfig) {
  const url = new URL(path, 'https://oauth.reddit.com');
  if (url.origin !== 'https://oauth.reddit.com' || !/^\/r\/(popular|news)\/(hot|new|top)$/.test(url.pathname)) throw new ApiError(400, 'Unknown read-only Reddit resource.');
  const token = await accessToken(config);
  const response = await fetch(url.href, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': config.userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (response.status === 401) {
    if (cached?.key === config.key) cached = undefined;
    throw new ApiError(401, 'Reddit rejected the application token. Please retry; the site owner may need to check API access.');
  }
  if (response.status === 403) throw new ApiError(403, 'Reddit denied this app access to the feed. The site owner must verify Reddit API approval.');
  if (response.status === 429) throw new ApiError(429, 'Reddit’s rate limit was reached. Please wait a minute before trying again.');
  if (!response.ok) throw new ApiError(502, 'Reddit could not load this feed. Please try again later.');
  let data;
  try { data = await response.json(); } catch { throw new ApiError(502, 'Reddit returned a non-JSON feed response.'); }
  if (data?.error || !Array.isArray(data?.data?.children)) throw new ApiError(502, 'Reddit did not return a valid feed.');
  return data;
}
