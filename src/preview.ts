import { mountReader } from '../shared/reader';
import { extractPosts } from '../shared/extract';
import { communityUrl, DEFAULTS, HOME_URL, normalizePreferences, pageFromUrl, postUrl, visit, type HomeMode, type Post } from '../shared/model';
import theme from '../shared/theme.css?inline';
import { createFixture } from './fixtures';
import { createDiscussionState, mountDiscussion, type DiscussionState } from './discussion';
import discussionTheme from './discussion.css?inline';
import './preview.css';

const root = document.querySelector<HTMLElement>('#app')!;
root.innerHTML = `<header class="preview-header"><div><p class="preview-kicker">Pureddit WebExtension</p><h1>One reading view. Across your browsers.</h1><p>Interactive preview with sample content. Click a post or comment count to explore a discussion.</p></div><a class="guide" href="https://github.com/curlycucumber/pureddit/blob/main/docs/INSTALL.md" target="_blank" rel="noopener noreferrer">Installation guide ↗</a></header><section class="preview-controls" aria-label="Preview controls"><div class="devices" aria-label="Browser preview"><button data-device="firefox" aria-pressed="true">Firefox · desktop</button><button data-device="chrome" aria-pressed="false">Chrome · desktop</button><button data-device="safari" aria-pressed="false">Safari · iPhone</button></div></section><p class="preview-caption" role="status">Click a post or comment count to try a sample discussion. Demo comments and votes stay in this page.</p><div class="device-wrap"><div class="device-frame"><div class="browser-bar"><span class="browser-dots">● ● ●</span><span id="address">reddit.com/r/popular</span><span class="preview-badge">Sample page</span></div><div id="reader-host"></div></div></div><div class="preview-message" role="status" hidden></div><section class="downloads"><div><h2>Try the extension</h2><p>Unsigned development packages. Browser-store publication is a separate step.</p></div><div class="download-links"><a href="/downloads/pureddit-firefox.zip" download>Firefox package ↓</a><a href="/downloads/pureddit-chrome.zip" download>Chrome package ↓</a><a href="/downloads/pureddit-safari.zip" download>Safari source ↓</a></div><p class="safari-note">Safari on iPhone needs an Xcode wrapper built and signed on a Mac. The Safari ZIP is extension source, not an installable iPhone app.</p></section><footer class="preview-footer">Pureddit · Source on <a href="https://github.com/curlycucumber/pureddit">GitHub</a> · No Reddit API, account connection, or database.</footer>`;
const KEY = 'pureddit:preview:v2';
let preferences = normalizePreferences({ ...DEFAULTS, pins: ['Design', 'technology', 'photography'] });
try {
  // Remove only the retired web app's local demo records, never unrelated site data.
  const oldKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
  oldKeys.forEach(key => { if (key === 'pureddit:v1' || key?.startsWith('pureddit:recent:')) localStorage.removeItem(key); });
  const stored = localStorage.getItem(KEY); if (stored) preferences = normalizePreferences(JSON.parse(stored));
} catch { /* Preview remains usable without storage. */ }
let page = pageFromUrl('https://www.reddit.com/r/popular/')!;
let homeMode: HomeMode = 'following';
let feedUrl = 'https://www.reddit.com/r/popular/';
let activePost: Post | undefined;
let discussion: ReturnType<typeof mountDiscussion> | undefined;
let lastRoute: string | undefined;
const sessions = new Map<string, DiscussionState>();
const catalog = extractPosts(createFixture('modern', 'popular'), location.href).posts;
const savedScroll = new Map<string, { main: number; layout: number }>();
const host = document.querySelector<HTMLElement>('#reader-host')!;
const shadow = host.attachShadow({ mode: 'open' });
let openComments = false;
shadow.addEventListener('click', event => { openComments = event.composedPath().some(element => element instanceof Element && element.classList.contains('comment-pill')); }, true);
function persist() { try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { reader.message('Preview preferences could not be saved in this browser.'); } }
const reader = mountReader(shadow, theme + discussionTheme, {
  preview: true,
  more() { reader.message('The installed extension asks Reddit’s native feed to load more posts. This preview has sample content only.'); },
  homeMode(value) { homeMode = value; updateRoute(activePost); },
  native(action) { const notice = document.querySelector<HTMLElement>('.preview-message')!; notice.hidden = false; notice.textContent = `In the installed extension, this opens Reddit’s native ${action === 'create' ? 'post composer' : action === 'navigation' ? 'navigation and subscriptions' : action === 'account' ? 'account menu' : 'notifications'}. This preview does not connect to a Reddit account.`; },
  appearance(value) { preferences = { ...preferences, appearance: value }; persist(); render(); },
  colorScheme(value) { preferences = { ...preferences, colorScheme: value }; persist(); render(); },
  original() { const notice = document.querySelector<HTMLElement>('.preview-message')!; notice.hidden = false; notice.textContent = 'In the installed extension, Show Reddit restores the original page and native account controls. This preview contains illustrative fixtures only.'; },
  navigate,
  pin(name) { if (!preferences.pins.some(item => item.toLowerCase() === name.toLowerCase()) && preferences.pins.length < 50) { preferences = { ...preferences, pins: [...preferences.pins, name] }; persist(); render(); } },
  unpin(name) { preferences = { ...preferences, pins: preferences.pins.filter(item => item !== name) }; persist(); render(); },
});
function previewUrl(post?: Post) {
  const params = new URLSearchParams({ feed: feedUrl, mode: homeMode }); if (post) params.set('post', post.id);
  return `${location.pathname}${location.search}#${params}`;
}
function updateRoute(post?: Post, replace = false) {
  history[replace ? 'replaceState' : 'pushState']({ puredditPreview: true, discussion: Boolean(post) }, '', previewUrl(post));
  readRoute();
}
function navigate(url: string) {
  const next = pageFromUrl(url);
  if (next) {
    if (url === HOME_URL) homeMode = 'following';
    feedUrl = url; page = next;
    if (next.community) { preferences = visit(preferences, next.community); persist(); }
    updateRoute(); return;
  }
  const post = catalog.find(item => item.href === postUrl(url));
  if (post) { updateRoute(post); if (openComments) discussion?.focusComposer(); return; }
  const notice = document.querySelector<HTMLElement>('.preview-message')!; notice.hidden = false;
  notice.textContent = 'This source link belongs to illustrative sample content. Use a sample post title or comments link to explore its local discussion.';
}
function readRoute() {
  if (lastRoute === location.hash) return;
  lastRoute = location.hash;
  const previousFeedUrl = feedUrl;
  const params = new URLSearchParams(location.hash.slice(1));
  const requestedFeed = params.get('feed') || 'https://www.reddit.com/r/popular/';
  page = pageFromUrl(requestedFeed) || pageFromUrl('https://www.reddit.com/r/popular/')!;
  feedUrl = pageFromUrl(requestedFeed) ? requestedFeed : 'https://www.reddit.com/r/popular/';
  homeMode = params.get('mode') === 'for-you' ? 'for-you' : 'following';
  const nextPost = catalog.find(post => post.id === params.get('post'));
  const main = shadow.querySelector<HTMLElement>('main')!, layout = shadow.querySelector<HTMLElement>('.layout')!;
  if (!activePost && nextPost && previousFeedUrl === feedUrl) savedScroll.set(feedUrl, { main: main.scrollTop, layout: layout.scrollTop });
  const priorPost = activePost;
  activePost = nextPost;
  discussion?.element.remove(); discussion = undefined;
  shadow.querySelector<HTMLElement>('.reader')!.dataset.view = nextPost ? 'discussion' : 'feed';
  render();
  if (nextPost) {
    let state = sessions.get(nextPost.href); if (!state) { state = createDiscussionState(); sessions.set(nextPost.href, state); }
    discussion = mountDiscussion(nextPost, state, {
      back() {
        if (history.state?.puredditPreview && history.state.discussion) history.back();
        else updateRoute(undefined, true);
      },
      navigate,
    });
    main.append(discussion.element); main.scrollTop = 0; layout.scrollTop = 0; discussion.focusTitle();
  } else if (priorPost) {
    const scroll = savedScroll.get(feedUrl); main.scrollTop = scroll?.main || 0; layout.scrollTop = scroll?.layout || 0;
    shadow.querySelector<HTMLElement>('.post-title')?.focus({ preventScroll: true });
  } else { main.scrollTop = 0; layout.scrollTop = 0; }
  document.querySelector<HTMLElement>('.preview-message')!.hidden = true;
}
function render() {
  const fixture = createFixture(preferences.appearance, page.kind === 'home' && homeMode === 'following' ? 'home' : page.kind === 'home' ? 'popular' : page.community || 'popular');
  if (page.kind === 'home' && homeMode === 'following') [...fixture.children].slice(3).forEach(node => node.remove());
  reader.update({ ...extractPosts(fixture, location.href, { includeRecommendations: page.kind === 'home' && homeMode === 'for-you' }), page, preferences, preview: true, homeFeed: page.kind === 'home' ? { mode: homeMode, status: 'ready' } : undefined });
  document.querySelector('#address')!.textContent = activePost ? `reddit.com${new URL(activePost.href).pathname}` : page.kind === 'home' ? 'reddit.com' : communityUrl(page.community!).replace('https://www.', '').replace(/\/$/, '');
  // Default new-tab/copy-link actions should also point at the local preview.
  shadow.querySelectorAll<HTMLAnchorElement>('.posts a[href]').forEach(link => {
    const post = catalog.find(item => item.href === postUrl(link.href)); if (post) link.href = new URL(previewUrl(post), location.href).href;
  });
  shadow.querySelectorAll<HTMLElement>('.native-note').forEach(note => { note.textContent = 'Open sample discussion'; });
}
document.querySelectorAll<HTMLButtonElement>('[data-device]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-device]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  const mobile = button.dataset.device === 'safari'; document.querySelector('.device-frame')!.classList.toggle('iphone', mobile);
  document.querySelector('.preview-caption')!.textContent = mobile ? 'iPhone-sized design preview. Safari installation requires a Mac, Xcode, signing, and testing on an iPhone.' : 'Click a post or comment count to try a sample discussion. Demo comments and votes stay in this page.';
}));
window.addEventListener('popstate', readRoute);
window.addEventListener('hashchange', readRoute);
readRoute();
