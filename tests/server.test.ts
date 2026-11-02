import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import auth from '../api/auth/[action].ts';
import reddit from '../api/reddit.ts';
import readOnly from '../api/read-only.ts';
import { configuration, seal, unseal, type Session } from '../server/session.ts';
import { comments, listing, post } from '../server/normalize.ts';

const nativeFetch = globalThis.fetch;
let server: Server;
let base: string;
let calls: { url: string; options?: RequestInit }[] = [];
let respond: (url: string, options?: RequestInit) => Response = () => Response.json({});
const origin = 'https://pureddit.vercel.app';
const profile = { id: 'acct1', name: 'reader', karma: 25, created: 1400000000000 };
const session = (expires = Date.now() + 3600000): Session => ({ access: 'test-access', refresh: 'test-refresh', expires, until: Date.now() + 86400000, user: profile });
const sessionCookie = (value = session()) => `__Host-pureddit_session=${seal(value, 'session')}`;
const mutate = (data: unknown, cookie = sessionCookie(), source = origin) => ({ method: 'POST', headers: { Cookie: cookie, Origin: source, 'Content-Type': 'application/json', 'X-Pureddit-Request': '1' }, body: JSON.stringify(data) });
const thing = (id: string, community = 'books', extra = {}) => ({ kind: 't3', data: { id, name: `t3_${id}`, subreddit: community, title: `Post ${id}`, author: 'reader', score: 10, created_utc: 1700000000, num_comments: 3, is_self: true, permalink: `/r/${community}/comments/${id}/post`, ...extra } });

before(async () => {
  server = createServer((req, res) => { void (req.url?.startsWith('/api/auth/') ? auth(req, res) : req.url?.split('?')[0] === '/api/read-only' ? readOnly(req, res) : reddit(req, res)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  globalThis.fetch = (async (input: string | URL | Request, options?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(base)) return nativeFetch(input, options);
    assert.ok(url.startsWith('https://www.reddit.com/') || url.startsWith('https://oauth.reddit.com/'), 'No arbitrary external destinations');
    calls.push({ url, options }); return respond(url, options);
  }) as typeof fetch;
});
beforeEach(() => {
  process.env.REDDIT_CLIENT_ID = 'test-client'; process.env.REDDIT_CLIENT_SECRET = 'test-client-secret';
  process.env.REDDIT_REDIRECT_URI = `${origin}/api/auth/callback`; process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  calls = []; respond = () => Response.json({});
});
after(async () => { globalThis.fetch = nativeFetch; await new Promise<void>(resolve => server.close(() => resolve())); });

test('missing configuration is reported without exposing settings; login returns a useful redirect', async () => {
  delete process.env.REDDIT_CLIENT_SECRET;
  const status = await fetch(`${base}/api/auth/session`);
  assert.deepEqual(await status.json(), { configured: false, authenticated: false });
  const start = await fetch(`${base}/api/auth/start`, { redirect: 'manual' });
  assert.equal(start.headers.get('location'), '/?auth_error=not_configured#/home');
  process.env.REDDIT_CLIENT_SECRET = 'test'; process.env.REDDIT_REDIRECT_URI = 'https://evil.invalid/api/auth/callback?next=evil';
  assert.throws(configuration);
});

test('encrypted sessions authenticate their purpose and reject modifications', () => {
  const original = session(); const value = seal(original, 'session');
  assert.ok(!value.includes('test-access')); assert.deepEqual(unseal(value, 'session'), original);
  assert.equal(unseal(value, 'oauth'), null);
  assert.equal(unseal(value.slice(0, 10) + 'XX' + value.slice(12), 'session'), null);
});

test('authorization redirects to Reddit with state, permanent access, and restricted scopes', async () => {
  const response = await fetch(`${base}/api/auth/start`, { redirect: 'manual' });
  const location = new URL(response.headers.get('location')!);
  assert.equal(location.origin, 'https://www.reddit.com'); assert.equal(location.searchParams.get('response_type'), 'code');
  assert.equal(location.searchParams.get('redirect_uri'), `${origin}/api/auth/callback`);
  assert.equal(location.searchParams.get('duration'), 'permanent'); assert.ok(location.searchParams.get('state')!.length >= 32);
  assert.ok(!location.searchParams.get('scope')!.includes('modposts'));
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Secure/); assert.doesNotMatch(cookie, /Domain=/);
});

test('invalid, expired, and denied OAuth callbacks never exchange a token', async () => {
  for (const [state, until] of [['expected', Date.now() + 600000], ['different', Date.now() - 1]] as const) {
    const cookie = `__Host-pureddit_oauth=${seal({ state, until }, 'oauth')}`;
    const response = await fetch(`${base}/api/auth/callback?code=test-code&state=different`, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(response.headers.get('location'), '/?auth_error=invalid_state#/home');
  }
  const cookie = `__Host-pureddit_oauth=${seal({ state: 'okay', until: Date.now() + 600000 }, 'oauth')}`;
  const denied = await fetch(`${base}/api/auth/callback?state=okay&error=access_denied`, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(denied.headers.get('location'), '/?auth_error=denied#/home'); assert.equal(calls.length, 0);
});

test('callback exchanges the code server-side and exposes only the profile in session status', async () => {
  respond = (url, options) => {
    if (url.endsWith('/access_token')) {
      assert.equal(new URLSearchParams(String(options!.body)).get('grant_type'), 'authorization_code');
      assert.match((options!.headers as Record<string, string>).Authorization, /^Basic /);
      return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
    }
    return Response.json({ id: 'acct1', name: 'reader', link_karma: 20, comment_karma: 5, created_utc: 1400000000 });
  };
  const cookie = `__Host-pureddit_oauth=${seal({ state: 'okay', until: Date.now() + 600000 }, 'oauth')}`;
  const callback = await fetch(`${base}/api/auth/callback?state=okay&code=test-code`, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(callback.headers.get('location'), '/#/home');
  const saved = callback.headers.getSetCookie().find(cookie => cookie.startsWith('__Host-pureddit_session='))!.split(';')[0];
  assert.doesNotMatch(saved, /test-access|test-refresh/);
  const response = await fetch(`${base}/api/auth/session`, { headers: { Cookie: saved } });
  const data = await response.json(); assert.equal(data.user.name, 'reader'); assert.equal(data.user.karma, 25);
  assert.doesNotMatch(JSON.stringify(data), /test-access|test-refresh|test-client-secret/);
  assert.match(response.headers.get('cache-control')!, /no-store/);
});

test('expired access refreshes securely; expired or revoked sessions cannot make API calls', async () => {
  respond = url => url.endsWith('/access_token') ? Response.json({ access_token: 'new-test-access', expires_in: 3600 }) : Response.json({ data: { children: [] } });
  const response = await fetch(`${base}/api/reddit?resource=popular`, { headers: { Cookie: sessionCookie(session(Date.now() - 10)) } });
  assert.equal(response.status, 200); assert.ok(response.headers.get('set-cookie')); assert.ok(calls[0].url.endsWith('/access_token'));
  assert.equal((calls[1].options!.headers as Record<string, string>).Authorization, 'Bearer new-test-access');
  const expired = session(); expired.until = Date.now() - 1;
  assert.equal((await fetch(`${base}/api/reddit?resource=home`, { headers: { Cookie: sessionCookie(expired) } })).status, 401);
  respond = () => Response.json({}, { status: 401 });
  const revoked = await fetch(`${base}/api/auth/session`, { headers: { Cookie: sessionCookie() } });
  const data = await revoked.json(); assert.equal(data.configured, true); assert.equal(data.authenticated, false); assert.match(data.error, /expired/);
});

test('Home exhausts subscription pages and removes ads and unfollowed communities', async () => {
  respond = url => {
    if (url.includes('/subreddits/mine')) return Response.json({ data: { children: [{ data: { display_name: url.includes('after=') ? 'science' : 'books' } }], after: url.includes('after=') ? null : 't5_next' } });
    return Response.json({ data: { children: [thing('a'), thing('b', 'science'), thing('c', 'Outdoors'), thing('d', 'books', { promoted: true })], after: 't3_next' } });
  };
  const response = await fetch(`${base}/api/reddit?resource=home`, { headers: { Cookie: sessionCookie() } });
  const data = await response.json(); assert.deepEqual(data.posts.map((p: { id: string }) => p.id), ['a', 'b']); assert.equal(data.after, 't3_next'); assert.equal(calls.length, 3);
});

test('cross-origin writes, missing custom headers, invalid mutations, and arbitrary proxy paths are rejected', async () => {
  assert.equal((await fetch(`${base}/api/reddit`, mutate({ action: 'vote', id: 't3_test', direction: 1 }, sessionCookie(), 'https://evil.invalid'))).status, 403);
  assert.equal((await fetch(`${base}/api/reddit`, { method: 'POST', headers: { Cookie: sessionCookie(), Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  for (const data of [{ action: 'vote', id: 't3_test', direction: 10 }, { action: 'submit', community: '../bad', title: 'x', kind: 'self', text: '' }, { action: 'submit', community: 'books', title: 'x', kind: 'link', url: 'javascript:alert(1)' }]) {
    assert.equal((await fetch(`${base}/api/reddit`, mutate(data))).status, 400);
  }
  assert.equal((await fetch(`${base}/api/reddit?resource=https://evil.invalid`, { headers: { Cookie: sessionCookie() } })).status, 400);
  assert.equal(calls.length, 0);
});

test('valid vote, subscription, comment, submit, and delete actions target only supported Reddit endpoints', async () => {
  respond = url => url.endsWith('/comment') ? Response.json({ json: { data: { things: [{ kind: 't1', data: { id: 'reply', name: 't1_reply', author: 'reader', body: 'Hello', score: 1, likes: true, created_utc: 1700000000 } }] } } }) : url.endsWith('/submit') ? Response.json({ json: { data: { id: 'newpost' } } }) : Response.json({});
  const cases = [
    [{ action: 'vote', id: 't3_test', direction: -1 }, '/api/vote'],
    [{ action: 'subscribe', community: 'books', join: true }, '/api/subscribe'],
    [{ action: 'comment', id: 't3_test', text: 'Hello' }, '/api/comment'],
    [{ action: 'submit', community: 'books', title: 'Hello', kind: 'self', text: '' }, '/api/submit'],
    [{ action: 'delete', id: 't1_reply' }, '/api/del'],
  ] as const;
  for (const [data, endpoint] of cases) { const response = await fetch(`${base}/api/reddit`, mutate(data)); assert.equal(response.status, 200); assert.ok(calls.at(-1)!.url.endsWith(endpoint)); }
  respond = () => Response.json({ json: { errors: [['RATELIMIT', 'Please wait before posting.', '']] } });
  const failure = await fetch(`${base}/api/reddit`, mutate({ action: 'comment', id: 't3_test', text: 'Hello' })); assert.equal(failure.status, 422);
});

test('sign-out rejects cross-origin requests and revokes the refresh token before clearing cookies', async () => {
  const response = await fetch(`${base}/api/auth/logout`, mutate({}));
  assert.deepEqual(await response.json(), { signedOut: true, revoked: true });
  assert.ok(calls[0].url.endsWith('/revoke_token')); assert.equal(new URLSearchParams(String(calls[0].options!.body)).get('token'), 'test-refresh');
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
  assert.equal((await fetch(`${base}/api/auth/logout`, mutate({}, sessionCookie(), 'https://evil.invalid'))).status, 403);
});

test('normalization preserves nested comments and vote baselines without exposing unsafe HTML or images', () => {
  const item = post(thing('a', 'books', { likes: true, score: 10, thumbnail: 'javascript:alert(1)' }).data);
  assert.equal(item.score, 9); assert.equal(item.vote, 1); assert.equal(item.image, undefined);
  assert.equal(listing({ data: { children: [thing('a'), thing('b', 'books', { promoted: true })] } }).posts.length, 1);
  const thread = comments({ data: { children: [{ kind: 't1', data: { id: 'one', author: 'reader', body: '<script>not HTML</script>', score: 5, created_utc: 1700000000, replies: { data: { children: [{ kind: 't1', data: { id: 'two', author: 'other', body: 'Reply', score: 2, created_utc: 1700000000 } }, { kind: 'more', data: {} }] } } } }] } });
  assert.equal(thread.comments[1].parent, 'one'); assert.equal(thread.more, true); assert.equal(thread.comments[0].body, '<script>not HTML</script>');
});


test('Popular and News use the exact requested OAuth sources with sort and cursor', async () => {
  respond = () => Response.json({ data: { children: [thing('a')], after: 't3_next' } });
  for (const resource of ['popular', 'news']) {
    const response = await fetch(`${base}/api/reddit?resource=${resource}&sort=top&after=t3_next`, { headers: { Cookie: sessionCookie() } });
    assert.equal(response.status, 200);
    const url = new URL(calls.at(-1)!.url);
    assert.equal(url.origin, 'https://oauth.reddit.com'); assert.equal(url.pathname, `/r/${resource}/top`);
    assert.equal(url.searchParams.get('after'), 't3_next'); assert.equal(url.searchParams.get('t'), 'week');
  }
});

test('anonymous live listings and discussions work without OAuth configuration; account actions stay protected', async () => {
  delete process.env.REDDIT_CLIENT_SECRET;
  respond = url => url.includes('/comments/') ? Response.json([{ data: { children: [thing('a')] } }, { data: { children: [] } }]) : Response.json({ data: { children: [thing('a'), thing('ad', 'books', { promoted: true })], after: 't3_next' } });
  for (const resource of ['popular', 'news']) {
    const response = await fetch(`${base}/api/reddit?resource=${resource}&sort=hot&after=t3_next`);
    assert.equal(response.status, 200); assert.equal((await response.json()).posts.length, 1);
    const call = calls.at(-1)!; const url = new URL(call.url);
    assert.equal(url.origin, 'https://www.reddit.com'); assert.equal(url.pathname, `/r/${resource}/hot.json`);
    assert.equal(url.searchParams.get('after'), 't3_next'); assert.equal((call.options!.headers as Record<string, string>).Authorization, undefined);
  }
  assert.equal((await fetch(`${base}/api/reddit?resource=post&id=a`)).status, 200);
  assert.equal((await fetch(`${base}/api/reddit?resource=home`)).status, 401);
  assert.equal((await fetch(`${base}/api/reddit?resource=news&sort=invalid`)).status, 400);
  assert.equal((await fetch(`${base}/api/reddit?resource=news&after=invalid`)).status, 400);
  assert.equal((await fetch(`${base}/api/reddit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'vote', id: 't3_a', direction: 1 }) })).status, 401);
});

test('blocked public access returns the upstream failure without sample data', async () => {
  respond = () => Response.json({}, { status: 403 });
  const response = await fetch(`${base}/api/reddit?resource=popular`);
  assert.equal(response.status, 403); const data = await response.json();
  assert.match(data.error, /blocked public access/); assert.equal(data.posts, undefined);
});

test('Read Only ignores account cookies and fetches only the two public feed sources without credentials', async () => {
  const cookie = sessionCookie();
  delete process.env.REDDIT_CLIENT_SECRET; delete process.env.SESSION_SECRET;
  respond = () => Response.json({ data: { children: [thing('a'), thing('ad', 'news', { promoted: true })], after: 't3_next' } });
  for (const feed of ['popular', 'news']) {
    const response = await fetch(`${base}/api/read-only?feed=${feed}&sort=top&after=t3_next`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.posts.length, 1); assert.equal(data.after, 't3_next');
    const call = calls.at(-1)!; const url = new URL(call.url);
    assert.equal(url.origin, 'https://www.reddit.com'); assert.equal(url.pathname, `/r/${feed}/top.json`);
    assert.equal(url.searchParams.get('t'), 'week'); assert.equal(url.searchParams.get('after'), 't3_next');
    assert.equal((call.options!.headers as Record<string, string>).Authorization, undefined);
    assert.equal((call.options!.headers as Record<string, string>).Cookie, undefined);
  }
});

test('Read Only rejects writes and arbitrary feeds and reports public access blocks', async () => {
  assert.equal((await fetch(`${base}/api/read-only`, { method: 'POST', body: '{}' })).status, 405);
  for (const query of ['feed=worldnews', 'feed=https://evil.invalid', 'sort=invalid', 'after=invalid']) assert.equal((await fetch(`${base}/api/read-only?${query}`)).status, 400);
  assert.equal(calls.length, 0);
  respond = () => Response.json({}, { status: 403 });
  const response = await fetch(`${base}/api/read-only?feed=news`);
  assert.equal(response.status, 403); const data = await response.json(); assert.match(data.error, /blocked this public feed/); assert.equal(data.posts, undefined);
});
