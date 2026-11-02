import type { Community, Comment, Post } from '../src/data.ts';

// Only explicitly selected fields are returned to the browser. Never forward tokens or raw HTML.
type Thing = { kind: string; data: Record<string, any> };
export function community(data: Record<string, any>): Community {
  return { name: data.display_name, label: data.display_name?.slice(0, 2).toLowerCase() || 'r', color: '#31597c', background: '#e9f1f8', description: data.public_description || '', members: Number(data.subscribers || 0).toLocaleString(), category: 'Reddit community', redditName: data.name };
}
const vote = (likes: unknown): -1 | 0 | 1 => likes === true ? 1 : likes === false ? -1 : 0;
function safeImage(value: unknown) {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value.replaceAll('&amp;', '&')); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
}
export function post(data: Record<string, any>): Post {
  return { id: data.id, redditName: data.name, community: data.subreddit, title: data.title, author: data.author, score: (data.score || 0) - vote(data.likes), created: data.created_utc * 1000, comments: [], commentCount: data.num_comments || 0, body: data.selftext || undefined, image: safeImage(data.preview?.images?.[0]?.source?.url) || safeImage(data.thumbnail), flair: data.link_flair_text || undefined, url: !data.is_self ? safeImage(data.url) : undefined, permalink: `https://www.reddit.com${data.permalink}`, saved: !!data.saved, vote: vote(data.likes) };
}
export function comments(listing: { data?: { children?: Thing[] } }, parent?: string): { comments: Comment[]; more: boolean } {
  const result: Comment[] = []; let more = false;
  for (const item of listing?.data?.children || []) {
    if (item.kind === 'more') { more = true; continue; }
    if (item.kind !== 't1') continue;
    const data = item.data;
    const id = data.name || data.id;
    result.push({ id, redditName: data.name, author: data.author, body: data.body || '[removed]', score: (data.score || 0) - vote(data.likes), vote: vote(data.likes), created: data.created_utc * 1000, parent });
    if (data.replies && typeof data.replies === 'object') { const nested = comments(data.replies, id); result.push(...nested.comments); more ||= nested.more; }
  }
  return { comments: result, more };
}
export function listing(data: { data?: { children?: Thing[]; after?: string } }) {
  return { posts: (data?.data?.children || []).filter(item => item.kind === 't3' && !item.data.promoted && !item.data.is_created_from_ads_ui).map(item => post(item.data)), after: data?.data?.after || null };
}
