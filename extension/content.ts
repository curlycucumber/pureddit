import { extractPosts } from '../shared/extract';
import { mountReader } from '../shared/reader';
import { DEFAULTS, HOME_URL, normalizePreferences, pageFromUrl, visit, type HomeMode, type HomeFeed, type NativeAction, type Post, type Preferences } from '../shared/model';
import { AD_SELECTOR } from '../shared/feed';
import { HomeFeedController, nativeControl, nativeRoots } from './native';
import { extensionApi, KEY, loadPreferences, savePreferences } from './storage';
declare const __PUREDDIT_THEME__: string;

// Only inspect feed pages the user opens. No fetch/XHR, credentials, API calls,
// history interception, or writes to Reddit are used by this extension.
async function start() {
  if (window.top !== window || location.protocol !== 'https:' || !['www.reddit.com', 'reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(location.hostname)) return;
  let preferences: Preferences; let storageError = false;
  try { preferences = await loadPreferences(); } catch { preferences = normalizePreferences(DEFAULTS); storageError = true; }
  let host: HTMLDivElement | undefined;
  let toggle: HTMLDivElement | undefined;
  let ui: ReturnType<typeof mountReader> | undefined;
  let suppressed = false; let lastVisit = ''; let lastUrl = ''; let timer = 0;
  let overflow: string | undefined;
  let homeMode: HomeMode = 'following'; let homeFeed: HomeFeed | undefined;
  const homeController = new HomeFeedController();
  const nativeStyles = new Map<ShadowRoot, HTMLStyleElement>();
  const observed = new WeakSet<ShadowRoot>();
  let cacheKey = ''; const postCache = new Map<string, Post>();
  const adStyle = document.createElement('style'); adStyle.id = 'pureddit-native-ad-style';
  // Cosmetic ad hiding also applies when the original native feed is visible.
  adStyle.textContent = AD_SELECTOR.split(',').map(selector => `html[data-pureddit-feed] ${selector}`).join(',') + '{display:none!important}';
  function adFiltering(enabled: boolean, roots: Array<Document | ShadowRoot> = []) {
    if (enabled) {
      if (!adStyle.isConnected) document.documentElement.append(adStyle); document.documentElement.setAttribute('data-pureddit-feed', '');
      for (const root of roots) if (root instanceof ShadowRoot && !nativeStyles.has(root)) {
        const style = document.createElement('style'); style.textContent = AD_SELECTOR + '{display:none!important}'; root.append(style); nativeStyles.set(root, style);
      }
      for (const [root, style] of nativeStyles) if (!root.host.isConnected) { style.remove(); nativeStyles.delete(root); }
    } else { document.documentElement.removeAttribute('data-pureddit-feed'); adStyle.remove(); nativeStyles.forEach(style => style.remove()); nativeStyles.clear(); }
  }
  const originals = new Map<HTMLElement, { inert: boolean; hidden: string | null }>();
  const restore = () => {
    originals.forEach((value, node) => { node.inert = value.inert; if (node.getAttribute('aria-hidden') === 'true') { if (value.hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', value.hidden); } });
    originals.clear();
    if (overflow !== undefined) { if (document.body.style.overflow === 'hidden') document.body.style.overflow = overflow; overflow = undefined; }
  };
  async function save(next: Preferences) {
    preferences = normalizePreferences(next); refresh();
    try { await savePreferences(preferences); } catch { ui?.message('Preferences changed for this tab, but browser storage could not save them.'); }
  }
  function showOriginal() { suppressed = true; restore(); if (host) { host.hidden = true; host.style.display = 'none'; } if (toggle) toggle.hidden = false; }
  function native(action: NativeAction) {
    const control = nativeControl(action);
    showOriginal();
    if (control) { control.focus(); control.click(); return; }
    if (action === 'create') {
      const page = pageFromUrl(location.href);
      location.href = page?.community && page.kind !== 'popular' ? `https://www.reddit.com/r/${encodeURIComponent(page.community)}/submit/` : 'https://www.reddit.com/submit';
    } else if (action === 'notifications') location.href = 'https://www.reddit.com/notifications';
    else {
      // Keep Reddit usable when its private selectors change; do not fake an account menu.
      const button = toggle?.shadowRoot?.querySelector('button');
      if (button) button.textContent = 'Use Reddit’s menu above · Return to pureddit';
    }
  }
  function create() {
    host = document.createElement('div'); host.id = 'pureddit-extension-root';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;width:100%;height:100dvh;display:block;';
    // The hidden attribute must also override the inline display declaration.
    const visibility = () => { if (host) host.style.display = host.hidden ? 'none' : 'block'; };
    const root = host.attachShadow({ mode: 'open' });
    ui = mountReader(root, __PUREDDIT_THEME__, {
      original: () => { showOriginal(); visibility(); },
      navigate: url => { if (url === HOME_URL) { homeMode = 'following'; homeController.reset(); } location.href = url; },
      native,
      homeMode: value => { homeMode = value; homeController.reset(); refresh(); },
      more: () => {
        const next = [...document.querySelectorAll<HTMLAnchorElement>('.next-button a')].find(link => { try { const url = new URL(link.href); return url.hostname === location.hostname && Boolean(pageFromUrl(url.href)); } catch { return false; } });
        if (next) { location.href = next.href; return; }
        restore();
        const scroll = document.scrollingElement;
        if (scroll) scroll.scrollTop = scroll.scrollHeight;
        window.dispatchEvent(new Event('scroll'));
        refresh();
        ui?.message('Asked Reddit to load more posts. New posts will appear here when Reddit adds them. Use Show Reddit if its native loader requires interaction.');
      },
      appearance: value => { void save({ ...preferences, appearance: value }); },
      colorScheme: value => { void save({ ...preferences, colorScheme: value }); },
      pin: name => { if (!preferences.pins.some(item => item.toLowerCase() === name.toLowerCase()) && preferences.pins.length < 50) void save({ ...preferences, pins: [...preferences.pins, name] }); },
      unpin: name => { void save({ ...preferences, pins: preferences.pins.filter(item => item !== name) }); },
    });
    document.body.append(host);
    toggle = document.createElement('div'); toggle.id = 'pureddit-return-toggle';
    toggle.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const shadow = toggle.attachShadow({ mode: 'open' }); const button = document.createElement('button');
    button.textContent = 'pureddit · Reading view'; button.style.cssText = 'font:12px -apple-system,BlinkMacSystemFont,Arial,sans-serif;padding:12px 16px;border:1px solid #5f99cf;border-radius:6px;background:#cee3f8;color:#194b7c;cursor:pointer;box-shadow:0 2px 10px #0002;';
    button.addEventListener('click', () => { suppressed = false; refresh(); }); shadow.append(button); toggle.hidden = true; document.body.append(toggle);
  }
  function refresh() {
    const page = pageFromUrl(location.href);
    if (page?.kind !== 'home') homeFeed = undefined;
    const roots = preferences.enabled && page ? nativeRoots() : [];
    adFiltering(preferences.enabled && Boolean(page), roots);
    if (!preferences.enabled || !page) {
      restore(); host?.remove(); toggle?.remove(); host = undefined; toggle = undefined; ui = undefined; homeFeed = undefined; postCache.clear(); return;
    }
    if (page.community && page.community.toLowerCase() !== 'popular' && lastVisit !== page.community.toLowerCase()) {
      lastVisit = page.community.toLowerCase(); const next = visit(preferences, page.community);
      preferences = next; void savePreferences(next).catch(() => { storageError = true; });
    }
    if (host && !host.isConnected) { restore(); toggle?.remove(); host = undefined; ui = undefined; }
    if (!host) create();
    if (suppressed) { if (host) { host.hidden = true; host.style.display = 'none'; } if (toggle) toggle.hidden = false; return; }
    host!.hidden = false; host!.style.display = 'block'; toggle!.hidden = true;
    homeFeed = page.kind === 'home' ? homeController.select(homeMode, restore, roots) : undefined;
    if (overflow === undefined) { overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    for (const child of document.body.children) {
      if (!(child instanceof HTMLElement) || child === host || child === toggle || ['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) continue;
      if (!originals.has(child)) { originals.set(child, { inert: child.inert, hidden: child.getAttribute('aria-hidden') }); child.inert = true; child.setAttribute('aria-hidden', 'true'); }
    }
    const options = { includeRecommendations: page.kind === 'home' && homeMode === 'for-you' };
    const extracted = extractPosts(document, location.href, options);
    for (const root of roots) if (root instanceof ShadowRoot) {
      if (!observed.has(root)) { observer.observe(root, observation); observed.add(root); }
      const extra = extractPosts(root, location.href, options); extracted.posts.push(...extra.posts); extracted.filtered += extra.filtered; extracted.excluded.push(...extra.excluded);
      if (extracted.layout === 'unsupported' && extra.layout !== 'unsupported') extracted.layout = extra.layout;
    }
    const key = `${location.href}:${homeMode}`;
    if (cacheKey !== key || (homeFeed && homeFeed.status !== 'ready')) { postCache.clear(); cacheKey = key; }
    // Never label an unconfirmed native Home feed as Following or For You.
    if (homeFeed && homeFeed.status !== 'ready') extracted.posts = [];
    for (const href of extracted.excluded) postCache.delete(href);
    for (const post of extracted.posts) postCache.set(post.href, post);
    while (postCache.size > 500) postCache.delete(postCache.keys().next().value!);
    extracted.posts = [...postCache.values()];
    ui!.update({ ...extracted, page, preferences, preview: false, homeFeed });
    if (storageError) ui!.message('Browser preferences could not be saved. The reading view still works in this tab.');
  }
  const schedule = () => { if (!timer) timer = window.setTimeout(() => { timer = 0; refresh(); }, 120); };
  const observer = new MutationObserver(schedule);
  const observation: MutationObserverInit = { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-testid', 'aria-selected', 'aria-current', 'aria-pressed', 'data-state', 'selected', 'post-title', 'permalink', 'content-href', 'created-timestamp', 'datetime', 'subreddit-prefixed-name', 'subreddit-name', 'score', 'comment-count', 'promoted', 'is-promoted', 'data-promoted', 'is-ad', 'recommendation-reason', 'is-recommended', 'data-recommended', 'nsfw', 'is-nsfw', 'spoiler', 'is-spoiler', 'src'] };
  observer.observe(document.body, observation);
  window.addEventListener('popstate', () => { suppressed = false; schedule(); });
  const poll = window.setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; suppressed = false; homeController.reset(); schedule(); } else if (!suppressed && homeFeed?.status === 'switching') schedule(); }, 750);
  extensionApi()?.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) {
      const next = normalizePreferences(changes[KEY].newValue);
      if (!preferences.enabled && next.enabled) suppressed = false;
      preferences = next; refresh();
    }
  });
  window.addEventListener('pagehide', event => { if (!event.persisted) { observer.disconnect(); clearInterval(poll); clearTimeout(timer); restore(); adFiltering(false); } });
  lastUrl = location.href; refresh();
}
if (document.body) void start();
else document.addEventListener('DOMContentLoaded', () => { if (document.body) void start(); }, { once: true });
