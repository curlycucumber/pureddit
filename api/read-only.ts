import type { ServerResponse } from 'node:http';
import { ApiError, fail, headers, json, type Request } from '../server/session.ts';
import { publicReddit } from '../server/public-reddit.ts';
import { listing } from '../server/normalize.ts';
import { appConfig, appReddit } from '../server/app-reddit.ts';

// No user sessions or write operations. Server-side app credentials are optional.
export default async function handler(req: Request, res: ServerResponse) {
  headers(res);
  let access: 'app-oauth' | 'public-json' = 'public-json';
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
    const config = appConfig();
    access = config ? 'app-oauth' : 'public-json';
    const path = `/r/${feed}/${sort}?${parameters}`;
    const data = config ? await appReddit(path, config) : await publicReddit(path);
    json(res, 200, { ...listing(data), access });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403 && access === 'public-json') { json(res, 403, { error: 'Reddit blocked this public feed request. The site owner needs approved Reddit app credentials for app-only access. Visitors do not need to sign in.', access }); return; }
    fail(res, error);
  }
}
