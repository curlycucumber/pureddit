import { ApiError } from './session.ts';

// Callers supply only validated listing/comment paths, never arbitrary URLs.
export async function publicReddit(path: string) {
  const url = new URL(path, 'https://www.reddit.com');
  if (url.origin !== 'https://www.reddit.com' || !/^\/(r\/(popular|news)\/(new|hot|top)|comments\/[a-z0-9]+)$/.test(url.pathname)) throw new ApiError(400, 'Unknown public Reddit resource.');
  url.pathname += '.json';
  const response = await fetch(url.href, { headers: { 'User-Agent': process.env.REDDIT_USER_AGENT || 'web:pureddit:0.2.0 (https://pureddit.vercel.app)', Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (response.status === 403 || response.status === 401) throw new ApiError(403, 'Reddit blocked public access to this feed. Sign in with Reddit to use authenticated access.');
  if (response.status === 429) throw new ApiError(429, 'Reddit’s rate limit was reached. Please wait a minute before trying again.');
  if (!response.ok) throw new ApiError(response.status === 404 ? 404 : 502, 'Reddit could not load this page. Please try again.');
  const data = await response.json();
  if (data?.error || (!data?.data?.children && !Array.isArray(data))) throw new ApiError(502, 'Reddit did not return a valid listing. Please try again or sign in.');
  return data;
}
