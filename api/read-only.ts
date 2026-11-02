import type { ServerResponse } from 'node:http';
import { ApiError, fail, headers, json, type Request } from '../server/session.ts';
import { publicReddit } from '../server/public-reddit.ts';
import { listing } from '../server/normalize.ts';

// An isolated public-feed experiment: no account cookies, OAuth, or write operations.
export default async function handler(req: Request, res: ServerResponse) {
  headers(res);
  try {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); throw new ApiError(405, 'This page supports read-only requests.'); }
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    const feed = query.get('feed') || 'popular';
    const sort = query.get('sort') || 'hot';
    const after = query.get('after');
    if (!['popular', 'news'].includes(feed)) throw new ApiError(400, 'Choose r/popular or r/news.');
    if (!['hot', 'new', 'top'].includes(sort)) throw new ApiError(400, 'Invalid sort order.');
    if (after && !/^t3_[a-z0-9]+$/.test(after)) throw new ApiError(400, 'Invalid pagination cursor.');
    const parameters = new URLSearchParams({ raw_json: '1', limit: '50', ...(after ? { after } : {}), ...(sort === 'top' ? { t: 'week' } : {}) });
    const data = await publicReddit(`/r/${feed}/${sort}?${parameters}`);
    json(res, 200, listing(data));
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) { json(res, 403, { error: 'Reddit blocked this public feed request. Read-only browsing still depends on Reddit allowing access.' }); return; }
    fail(res, error);
  }
}
