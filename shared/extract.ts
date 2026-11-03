import { externalUrl, postUrl, type Post } from './model';
import { isAdvertisement, isRecommendation } from './feed';

export type Extraction = { posts: Post[]; filtered: number; excluded: string[]; layout: 'modern' | 'old' | 'unsupported' };
const text = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
function flagged(element: Element, attributes: string[]) {
  return attributes.some(name => element.hasAttribute(name) && !['false', '0', 'null'].includes(element.getAttribute(name) || ''));
}
function thumbnail(element: Element, base: string) {
  // Keep sensitive previews gated and avoid mistaking a community avatar for media.
  if (element.matches('.over18, .spoiler') || flagged(element, ['nsfw', 'is-nsfw', 'spoiler', 'is-spoiler'])) return;
  const image = element.querySelector<HTMLImageElement>('img[slot="post-media-preview"], [slot="post-media-container"] img, img.preview-img, a.thumbnail img');
  return imageUrl(image?.getAttribute('src'), base);
}
function imageUrl(raw: string | null | undefined, base: string) {
  if (!raw) return;
  try {
    const url = new URL(raw, base);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return;
    const allowed = ['i.redd.it', 'preview.redd.it', 'external-preview.redd.it', 'a.thumbs.redditmedia.com', 'b.thumbs.redditmedia.com', 'styles.redditmedia.com', new URL(base).hostname];
    if (allowed.includes(url.hostname)) return url.href;
  } catch { /* Unsupported thumbnails stay as placeholders. */ }
}
function createdAt(element: Element) {
  const raw = element.getAttribute('created-timestamp') || element.querySelector('time[datetime]')?.getAttribute('datetime') || element.getAttribute('data-timestamp');
  if (!raw) return;
  const numeric = /^\d+$/.test(raw) ? Number(raw) : undefined;
  const date = new Date(numeric === undefined ? raw : numeric < 1e12 ? numeric * 1000 : numeric);
  if (Number.isFinite(date.getTime())) return date.toISOString();
}
export function extractPosts(root: ParentNode, base = 'https://www.reddit.com', options: { includeRecommendations?: boolean; excludeElements?: ReadonlySet<Element>; cache?: WeakMap<Element, Post>; advertisements?: ReadonlySet<Element> } = {}): Extraction {
  const modern = [...root.querySelectorAll('shreddit-post')];
  const old = [...root.querySelectorAll('.thing.link')];
  const layout = modern.length ? 'modern' : old.length ? 'old' : 'unsupported';
  const posts: Post[] = []; const excluded: string[] = []; const seen = new Set<string>(); let filtered = 0;
  for (const element of modern.length ? modern : old) {
    const cached = options.cache?.get(element);
    const href = cached?.href || [element.getAttribute('permalink'), element.getAttribute('data-permalink'), element.querySelector('a.comments, a[slot="full-post-link"], a[href*="/comments/"]')?.getAttribute('href'), element.getAttribute('content-href')]
      .map(value => postUrl(value || '')).find(Boolean);
    if (options.excludeElements?.has(element) || element.closest('[hidden]')) { if (href) excluded.push(href); continue; }
    if (options.advertisements?.has(element) || isAdvertisement(element) || (!options.includeRecommendations && isRecommendation(element))) { filtered++; if (href) excluded.push(href); continue; }
    if (cached && !seen.has(cached.href)) { seen.add(cached.href); posts.push(cached); continue; }
    const title = text(element.getAttribute('post-title') || element.querySelector('a.title, [slot="title"], h1, h2, h3')?.textContent);
    const community = text(element.getAttribute('subreddit-prefixed-name') || element.getAttribute('subreddit-name') || element.getAttribute('data-subreddit')).replace(/^r\//, '');
    if (!title || !href || !community || seen.has(href)) continue;
    seen.add(href);
    const post: Post = { id: element.getAttribute('id') || element.getAttribute('data-fullname') || href, title, community, href,
      author: text(element.getAttribute('author') || element.querySelector('a.author')?.textContent) || undefined,
      score: text(element.getAttribute('score') || element.querySelector('.score.unvoted, .score')?.textContent) || undefined,
      comments: text(element.getAttribute('comment-count') || element.querySelector('a.comments')?.textContent).replace(/\s*comments?$/i, '') || undefined,
      mediaKind: /^(image|gallery)$/.test(element.getAttribute('post-type') || element.getAttribute('data-post-type') || '') ? 'image' : (element.getAttribute('post-type') || element.getAttribute('data-post-type')) === 'video' ? 'video' : undefined,
      thumbnail: thumbnail(element, base),
      communityIcon: imageUrl(element.querySelector('shreddit-subreddit-avatar img, [data-testid="subreddit-icon"] img, img.subreddit-icon')?.getAttribute('src'), base),
      createdAt: createdAt(element),
      externalUrl: externalUrl(element.getAttribute('content-href')) || externalUrl(element.querySelector('a.title, a[data-testid="outbound-link"], a[slot="outbound-link"]')?.getAttribute('href')),
    };
    options.cache?.set(element, post); posts.push(post);
  }
  return { posts, filtered, excluded, layout };
}
