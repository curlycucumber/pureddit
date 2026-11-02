import { postUrl, type Post } from './model';

export type Extraction = { posts: Post[]; filtered: number; layout: 'modern' | 'old' | 'unsupported' };
const text = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
function flagged(element: Element, attributes: string[]) {
  return attributes.some(name => element.hasAttribute(name) && !['false', '0', 'null'].includes(element.getAttribute(name) || ''));
}
function thumbnail(element: Element, base: string) {
  // Keep sensitive previews gated and avoid mistaking a community avatar for media.
  if (element.matches('.over18, .spoiler') || flagged(element, ['nsfw', 'is-nsfw', 'spoiler', 'is-spoiler'])) return;
  const image = element.querySelector<HTMLImageElement>('img[slot="post-media-preview"], [slot="post-media-container"] img, img.preview-img, a.thumbnail img');
  const raw = image?.getAttribute('src');
  if (!raw) return;
  try {
    const url = new URL(raw, base);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return;
    const allowed = ['i.redd.it', 'preview.redd.it', 'external-preview.redd.it', 'a.thumbs.redditmedia.com', 'b.thumbs.redditmedia.com', 'styles.redditmedia.com', new URL(base).hostname];
    if (allowed.includes(url.hostname)) return url.href;
  } catch { /* Unsupported thumbnails stay as placeholders. */ }
}
export function extractPosts(root: ParentNode, base = 'https://www.reddit.com'): Extraction {
  const modern = [...root.querySelectorAll('shreddit-post')];
  const old = [...root.querySelectorAll('.thing.link')];
  const layout = modern.length ? 'modern' : old.length ? 'old' : 'unsupported';
  const posts: Post[] = []; const seen = new Set<string>(); let filtered = 0;
  for (const element of modern.length ? modern : old) {
    if (element.matches('.promotedlink, [data-testid="ad-post"]') || flagged(element, ['promoted', 'is-promoted', 'data-promoted', 'is-recommended', 'data-recommended', 'recommendation-reason']) || element.querySelector('[slot="ad-disclosure"], [data-testid="recommendation-reason"]')) { filtered++; continue; }
    const title = text(element.getAttribute('post-title') || element.querySelector('a.title, [slot="title"], h1, h2, h3')?.textContent);
    const community = text(element.getAttribute('subreddit-prefixed-name') || element.getAttribute('subreddit-name') || element.getAttribute('data-subreddit')).replace(/^r\//, '');
    const rawLink = element.getAttribute('permalink') || element.getAttribute('data-permalink') || element.getAttribute('content-href') || element.querySelector('a.comments, a[slot="full-post-link"], a[href*="/comments/"]')?.getAttribute('href') || '';
    const href = postUrl(rawLink);
    if (!title || !href || !community || seen.has(href)) continue;
    seen.add(href);
    posts.push({ id: element.getAttribute('id') || element.getAttribute('data-fullname') || href, title, community, href,
      author: text(element.getAttribute('author') || element.querySelector('a.author')?.textContent) || undefined,
      score: text(element.getAttribute('score') || element.querySelector('.score.unvoted, .score')?.textContent) || undefined,
      comments: text(element.getAttribute('comment-count') || element.querySelector('a.comments')?.textContent).replace(/\s*comments?$/i, '') || undefined,
      thumbnail: thumbnail(element, base),
    });
  }
  return { posts, filtered, layout };
}
