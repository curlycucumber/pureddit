import type { ServerResponse } from 'node:http';
import { ApiError, body, fail, headers, json, readSession, redditFetch, sameOrigin, type Request, type Session } from '../server/session.ts';
import { comments, community, listing, post } from '../server/normalize.ts';

function text(value: unknown, name: string, max: number, pattern?: RegExp) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || (pattern && !pattern.test(value))) throw new ApiError(400, `Invalid ${name}.`);
  return value;
}
const namePattern = /^[A-Za-z0-9_]{2,64}$/;
const thingPattern = /^t[13]_[a-z0-9]+$/;
async function subscriptions(session: Session, res: ServerResponse) {
  const result = []; let after = '';
  for (let page = 0; page < 30; page++) {
    const data = await redditFetch(session, res, `/subreddits/mine/subscriber?raw_json=1&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`);
    result.push(...(data.data?.children || []).map((item: { data: Record<string, unknown> }) => community(item.data)));
    after = data.data?.after || '';
    if (!after) return result;
  }
  throw new ApiError(503, 'Your subscription list is too large to load in one request. Please use Reddit to manage it for now.');
}
export default async function handler(req: Request, res: ServerResponse) {
  headers(res);
  try {
    const session = readSession(req);
    if (!session) throw new ApiError(401, 'Sign in to Reddit to use your account.');
    if (req.method === 'GET') {
      const query = new URL(req.url || '/', 'http://localhost').searchParams;
      const resource = query.get('resource');
      const sort = query.get('sort') || 'new';
      if (!['new', 'hot', 'top'].includes(sort)) throw new ApiError(400, 'Invalid sort order.');
      const after = query.get('after');
      if (after && !/^t[135]_[a-z0-9]+$/.test(after)) throw new ApiError(400, 'Invalid pagination cursor.');
      const options = `raw_json=1&limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}${sort === 'top' ? '&t=week' : ''}`;
      if (resource === 'subscriptions') { json(res, 200, { communities: await subscriptions(session, res) }); return; }
      if (resource === 'community') {
        const name = text(query.get('name'), 'community', 64, namePattern);
        const data = await redditFetch(session, res, `/r/${name}/about?raw_json=1`);
        json(res, 200, { community: community(data.data), subscribed: !!data.data.user_is_subscriber }); return;
      }
      if (resource === 'communities') {
        const term = text(query.get('q'), 'community search', 100);
        const data = await redditFetch(session, res, `/subreddits/search?raw_json=1&limit=30&q=${encodeURIComponent(term)}`);
        json(res, 200, { communities: (data.data?.children || []).map((item: { data: Record<string, unknown> }) => community(item.data)) }); return;
      }
      if (resource === 'post') {
        const id = text(query.get('id'), 'post', 30, /^[a-z0-9]+$/);
        const data = await redditFetch(session, res, `/comments/${id}?raw_json=1&limit=100`);
        const item = data?.[0]?.data?.children?.[0]?.data;
        if (!item) throw new ApiError(404, 'This post is no longer available.');
        const thread = comments(data[1]);
        json(res, 200, { post: { ...post(item), comments: thread.comments, moreComments: thread.more } }); return;
      }
      let path: string;
      let joined: Set<string> | undefined;
      if (resource === 'home') {
        joined = new Set((await subscriptions(session, res)).map(c => c.name.toLowerCase()));
        if (!joined.size) { json(res, 200, { posts: [], after: null }); return; }
        path = `/${sort}?${options}`;
      } else if (resource === 'popular') path = `/r/popular/${sort}?${options}`;
      else if (resource === 'news') path = `/r/news+worldnews/${sort}?${options}`;
      else if (resource === 'community-feed') path = `/r/${text(query.get('name'), 'community', 64, namePattern)}/${sort}?${options}`;
      else if (resource === 'saved') path = `/user/${encodeURIComponent(session.user.name)}/saved?${options}`;
      else if (resource === 'profile') path = `/user/${encodeURIComponent(session.user.name)}/submitted?${options}`;
      else if (resource === 'search') path = `/search?${options}&type=link&sort=${sort === 'hot' ? 'relevance' : sort}&q=${encodeURIComponent(text(query.get('q'), 'search query', 300))}`;
      else throw new ApiError(400, 'Unknown Reddit resource.');
      const data = listing(await redditFetch(session, res, path));
      if (joined) data.posts = data.posts.filter(p => joined.has(p.community.toLowerCase()));
      json(res, 200, data); return;
    }
    if (req.method !== 'POST') throw new ApiError(405, 'Method not supported.');
    sameOrigin(req);
    const input = await body(req);
    const parameters = new URLSearchParams({ api_type: 'json', raw_json: '1' });
    let path: string;
    if (input.action === 'vote') {
      parameters.set('id', text(input.id, 'post or comment', 50, thingPattern));
      if (![0, 1, -1].includes(input.direction as number)) throw new ApiError(400, 'Invalid vote direction.');
      parameters.set('dir', String(input.direction)); path = '/api/vote';
    } else if (input.action === 'save' || input.action === 'unsave' || input.action === 'delete') {
      parameters.set('id', text(input.id, 'post or comment', 50, thingPattern)); path = `/api/${input.action === 'delete' ? 'del' : input.action}`;
    } else if (input.action === 'subscribe') {
      parameters.set('sr_name', text(input.community, 'community', 64, namePattern));
      if (typeof input.join !== 'boolean') throw new ApiError(400, 'Invalid subscription action.');
      parameters.set('action', input.join ? 'sub' : 'unsub'); path = '/api/subscribe';
    } else if (input.action === 'comment') {
      parameters.set('thing_id', text(input.id, 'post or comment', 50, thingPattern));
      parameters.set('text', text(input.text, 'comment', 10000)); path = '/api/comment';
    } else if (input.action === 'submit') {
      parameters.set('sr', text(input.community, 'community', 64, namePattern));
      parameters.set('title', text(input.title, 'title', 300));
      if (!['self', 'link'].includes(String(input.kind))) throw new ApiError(400, 'Invalid post type.');
      parameters.set('kind', String(input.kind));
      if (input.kind === 'link') {
        const url = text(input.url, 'URL', 2048);
        let parsed: URL; try { parsed = new URL(url); } catch { throw new ApiError(400, 'Enter a valid URL.'); }
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new ApiError(400, 'Enter an http or https URL.');
        parameters.set('url', parsed.href);
      } else { if (typeof input.text !== 'string' || input.text.length > 40000) throw new ApiError(400, 'Invalid post text.'); parameters.set('text', input.text); }
      parameters.set('resubmit', 'true'); path = '/api/submit';
    } else throw new ApiError(400, 'Unknown Reddit action.');
    const result = await redditFetch(session, res, path, parameters);
    if (result?.json?.errors?.length) throw new ApiError(422, result.json.errors.map((error: string[]) => error[1]).join(' ').slice(0, 500));
    if (input.action === 'comment') {
      const item = result?.json?.data?.things?.[0];
      if (!item) throw new ApiError(502, 'Reddit did not confirm the comment. Refresh the discussion before trying again.');
      json(res, 200, { comment: comments({ data: { children: [item] } }).comments[0] });
    } else if (input.action === 'submit') {
      const id = result?.json?.data?.id;
      if (!id) throw new ApiError(502, 'Reddit did not confirm the post. Check your profile before trying again.');
      json(res, 200, { id });
    } else json(res, 200, { success: true });
  } catch (error) { fail(res, error); }
}
