import { extractPosts } from '../shared/extract';
import { mountReader } from '../shared/reader';
import { DEFAULTS, HOME_URL, normalizePreferences, pageFromUrl, visit, type HomeMode, type HomeFeed, type NativeAction, type Post, type Preferences } from '../shared/model';
import { AD_SELECTOR } from '../shared/feed';
import { HomeFeedController, nativeControl, nativeRoots, nativeLink, cardSnapshot } from './native';
import { nativeAppearance, nativePage } from './native-appearance';
import { extensionApi, KEY, loadPreferences, savePreferences } from './storage';
declare const __PUREDDIT_THEME__: string;

// Read feeds and style Reddit's native interactive pages. No fetch/XHR, credentials, API calls,
// history interception, or writes to Reddit are used by this extension.
async function start() {
  if (window.top !== window || location.protocol !== 'https:' || !['www.reddit.com', 'reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(location.hostname)) return;
  let preferences: Preferences; let storageError = false;
  try { preferences = await loadPreferences(); } catch { preferences = normalizePreferences(DEFAULTS); storageError = true; }
  let host: HTMLDivElement | undefined;
  let toggle: HTMLDivElement | undefined;
  let ui: ReturnType<typeof mountReader> | undefined;
  let loadingFallback = false; let emptySince = 0; let emptyTimer = 0;
  let departing = false; let suppressed = false; let lastVisit = ''; let lastUrl = ''; let timer = 0;
  let rootsDirty = true; let cachedRoots: Array<Document | ShadowRoot> = [];
  const rootsNow = () => { if (rootsDirty) { cachedRoots = nativeRoots(); rootsDirty = false; } return cachedRoots; };
  let lastCards = new Map<Element,string>(); let routeCards = new Map<Element,string>();
  let pendingUrl = '';
  let overflow: string | undefined;
  let homeMode: HomeMode = 'following'; let homeFeed: HomeFeed | undefined;
  const homeController = new HomeFeedController();
  let nativeActive = false;
  const nativeSkin = nativeAppearance(__PUREDDIT_THEME__, {original: () => { nativeActive = false; nativeSkin.clear(); skinKey = ''; showOriginal(); }, navigate, native, appearance: value => { void save({...preferences,appearance:value}); }, colorScheme: value => { void save({...preferences,colorScheme:value}); }, pin: () => {}, unpin: () => {}, homeMode: () => {}, more: () => {}}); let rendered = ''; let skinKey = '';
  function skin(enabled: boolean) {
    const key = enabled ? `${preferences.appearance}:${preferences.colorScheme}` : '';
    if (key === skinKey && (!enabled || nativeSkin.connected())) return; skinKey = key;
    if (enabled) nativeSkin.update(preferences); else nativeSkin.clear();
  }
  const nativeStyles = new Map<ShadowRoot, HTMLStyleElement>();
  const observed = new WeakSet<ShadowRoot>();
  let cacheKey = ''; const postCache = new Map<string, Post>();
  const adStyle = document.createElement('style'); adStyle.id = 'pureddit-native-ad-style';
  // Cosmetic ad hiding also applies when the original native feed is visible.
  adStyle.textContent = AD_SELECTOR.split(',').map(selector => `html[data-pureddit-feed] ${selector}`).join(',') + '{display:none!important}';
  function adFiltering(enabled: boolean, roots: Array<Document | ShadowRoot> = []) {
    if (enabled) {
      if (!adStyle.isConnected) document.documentElement.append(adStyle); document.documentElement.setAttribute('data-pureddit-feed', '');
      for (const root of roots) if (root instanceof ShadowRoot) {
        let style = nativeStyles.get(root);
        if (!style) { style = document.createElement('style'); style.textContent = AD_SELECTOR + '{display:none!important}'; nativeStyles.set(root, style); }
        if (style.parentNode !== root) root.append(style);
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
  function showOriginal() { loadingFallback = false; suppressed = true; restore(); skin(nativeActive); if (host) { host.hidden = true; host.style.display = 'none'; } ensureToggle(); if (toggle) toggle.hidden = false; }
  function native(action: NativeAction) {
    const control = nativeControl(action);
    nativeActive = true; showOriginal();
    if (!pageFromUrl(location.href)) suppressed = false;
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
  function navigate(url: string) {
    if (pageFromUrl(url)?.kind === 'home' && homeMode !== 'following') { homeMode = 'following'; homeController.reset(); }
    if (url === location.href) { suppressed = false; refresh(); return; }
    const next = pageFromUrl(url);
    if (next && ui) { ui.update({posts:[],filtered:0,excluded:[],layout:'unsupported',page:next,preferences,preview:false,homeFeed:next.kind==='home'?{mode:homeMode,status:'switching',message:'Opening Reddit Home…'}:undefined}); ui.message(`Opening ${next.title} on Reddit…`); }
    let link = nativeLink(url, rootsNow());
    let temporary = false;
    if (!link && new URL(url).origin === location.origin) {
      // Reddit's delegated router can also handle a community that is absent
      // from its current sidebar. A normal browser navigation remains the fallback.
      link = document.createElement('a'); link.href = url; link.hidden = true;
      (document.querySelector('shreddit-app') || document.body).append(link); temporary = true;
    }
    routeCards = cardSnapshot(rootsNow()); pendingUrl = url;
    restore();
    if (!next && nativePage(url)) { nativeActive = true; showOriginal(); suppressed = false; }
    const requested = pendingUrl;
    window.setTimeout(() => { if (pendingUrl === requested && requested) { pendingUrl = ''; departing = false; refresh(); ui?.message('Reddit did not finish switching pages. Retry or use Show Reddit.'); } },10000);
    if (link) {
      link.click(); if (temporary) link.remove();
      queueMicrotask(() => { rootsDirty = true; refresh(); });
      return;
    }
    departing = true;
    window.setTimeout(() => { if (departing) { departing = false; refresh(); ui?.message('Reddit is taking longer to open this page. You can retry the feed tab or use Show Reddit.'); } }, 10000);
    location.assign(url);
  }
  function create() {
    host = document.createElement('div'); host.id = 'pureddit-extension-root';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;width:100%;height:100dvh;display:block;';
    // The hidden attribute must also override the inline display declaration.
    const visibility = () => { if (host) host.style.display = host.hidden ? 'none' : 'block'; };
    const root = host.attachShadow({ mode: 'open' });
    ui = mountReader(root, __PUREDDIT_THEME__, {
      original: () => { showOriginal(); visibility(); },
      navigate,
      native,
      homeMode: value => { if (homeMode !== value) { homeMode = value; homeController.reset(); } refresh(); },
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
    ensureToggle();
  }
  function ensureToggle() {
    if (toggle?.isConnected) return;
    toggle = document.createElement('div'); toggle.id = 'pureddit-return-toggle';
    toggle.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const shadow = toggle.attachShadow({ mode: 'open' }); const button = document.createElement('button');
    button.textContent = 'pureddit · Reading view'; button.style.cssText = 'font:12px -apple-system,BlinkMacSystemFont,Arial,sans-serif;padding:12px 16px;border:1px solid #5f99cf;border-radius:6px;background:#cee3f8;color:#194b7c;cursor:pointer;box-shadow:0 2px 10px #0002;';
    button.addEventListener('click', () => { pendingUrl = ''; departing = false; suppressed = false; refresh(); }); shadow.append(button); toggle.hidden = true; document.body.append(toggle);
  }
  function refresh() {
    if (departing || pendingUrl && location.href.replace(/\/$/, '') !== pendingUrl.replace(/\/$/, '')) return;
    if (location.href !== lastUrl) { const lastUrlBeforeChange = lastUrl; lastUrl = location.href; suppressed = false; nativeActive = false; loadingFallback = false; emptySince = 0; homeController.reset(); if (pageFromUrl(location.href)?.kind === 'home') homeMode = 'following'; rootsDirty = true; routeCards = pageFromUrl(lastUrlBeforeChange) && pageFromUrl(location.href) ? (pendingUrl ? routeCards : lastCards) : new Map(); postCache.clear(); cacheKey = ''; rendered = ''; pendingUrl = ''; }
    const page = pageFromUrl(location.href);
    if (page?.kind !== 'home') homeFeed = undefined;
    const roots = preferences.enabled && page ? rootsNow() : [];
    skin(preferences.enabled && (Boolean(page) && suppressed && nativeActive || !page && nativePage(location.href) && !suppressed));
    for (const root of roots) if (root instanceof ShadowRoot && !observed.has(root)) { observer.observe(root, observation); observed.add(root); }
    adFiltering(preferences.enabled && Boolean(page), roots);
    if (!preferences.enabled || !page) {
      restore(); host?.remove();
      if (!preferences.enabled || !nativePage(location.href) || !suppressed) { toggle?.remove(); toggle = undefined; } else { ensureToggle(); toggle!.hidden = false; }
      host = undefined; ui = undefined; homeFeed = undefined; postCache.clear(); rendered = ''; clearTimeout(emptyTimer); emptyTimer = 0; emptySince = 0; return;
    }
    if (page.community && page.community.toLowerCase() !== 'popular' && lastVisit !== page.community.toLowerCase()) {
      lastVisit = page.community.toLowerCase(); const next = visit(preferences, page.community);
      preferences = next; void savePreferences(next).catch(() => { storageError = true; });
    }
    if (host && !host.isConnected) { restore(); toggle?.remove(); host = undefined; ui = undefined; }
    if (!host) { create(); rendered = ''; }
    if (suppressed && loadingFallback && roots.some(root => extractPosts(root, location.href).posts.length > 0)) { loadingFallback = false; suppressed = false; nativeActive = false; emptySince = 0; skin(false); }
    if (suppressed) { if (host) { host.hidden = true; host.style.display = 'none'; } if (toggle) toggle.hidden = false; return; }
    host!.hidden = false; host!.style.display = 'block'; toggle!.hidden = true;
    homeFeed = page.kind === 'home' ? homeController.select(homeMode, restore, roots) : undefined;
    if (overflow === undefined) { overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    for (const child of document.body.children) {
      if (!(child instanceof HTMLElement) || child.id === 'pureddit-native-controls' || child === host || child === toggle || ['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) continue;
      if (!originals.has(child)) { originals.set(child, { inert: child.inert, hidden: child.getAttribute('aria-hidden') }); child.inert = true; child.setAttribute('aria-hidden', 'true'); }
    }
    const currentCards = cardSnapshot(roots);
    const unchanged = new Set([...currentCards].filter(([node,value]) => routeCards.get(node) === value).map(([node]) => node));
    if (page.kind === 'home' && homeMode === 'following') for (const node of homeController.staleCards(roots)) unchanged.add(node);
    lastCards = currentCards;
    const options = { excludeElements: unchanged, includeRecommendations: page.kind === 'home' && homeMode === 'for-you' };
    const extracted = extractPosts(document, location.href, options);
    for (const root of roots) if (root instanceof ShadowRoot) {
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
    // A fixed reading layer must not strand native lazy loading or retry controls.
    // Reveal the live feed, retaining our header, if Reddit has supplied no cards.
    if (!extracted.posts.length && page.kind !== 'home') {
      emptySince ||= Date.now();
      if (!emptyTimer) emptyTimer = window.setTimeout(() => { emptyTimer = 0; refresh(); }, 6000);
      if (Date.now() - emptySince >= 6000) { nativeActive = true; showOriginal(); loadingFallback = true; nativeSkin.status('Reddit has not supplied readable posts yet. Its live feed and retry controls are available below.'); return; }
    } else { emptySince = 0; clearTimeout(emptyTimer); emptyTimer = 0; }

    const signature = JSON.stringify([extracted, page, preferences, homeFeed]);
    if (signature !== rendered) { rendered = signature; ui!.update({ ...extracted, page, preferences, preview: false, homeFeed }); }
    if (storageError) ui!.message('Browser preferences could not be saved. The reading view still works in this tab.');
  }
  const schedule = () => { if (!timer) timer = window.setTimeout(() => { timer = 0; refresh(); }, 120); };
  const observer = new MutationObserver(records => {
    let relevant = false;
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest('#pureddit-extension-root, #pureddit-native-controls, #pureddit-return-toggle')) continue;
      if (record.type === 'attributes') {
        if (record.attributeName !== 'class' || target?.matches('[role=tab], .thing') || target?.closest('shreddit-post, .thing.link')) relevant = true;
      } else {
        const owner = record.target.getRootNode();
        if (owner instanceof ShadowRoot && nativeStyles.has(owner) && !nativeStyles.get(owner)!.isConnected) relevant = true;
        if (target?.closest('shreddit-post, .thing.link, [role=tablist]')) relevant = true;
        for (const node of [...record.addedNodes,...record.removedNodes]) if (node instanceof Element && !node.matches('style, script, #pureddit-extension-root, #pureddit-native-controls, #pureddit-return-toggle')) { rootsDirty = true; relevant = true; }
      }
    }
    if (relevant) schedule();
  });
  const observation: MutationObserverInit = { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-testid', 'faceplate-tab-selected', 'data-selected', 'data-active', 'active', 'checked', 'hidden', 'aria-selected', 'aria-current', 'aria-pressed', 'data-state', 'selected', 'post-title', 'permalink', 'content-href', 'created-timestamp', 'datetime', 'subreddit-prefixed-name', 'subreddit-name', 'score', 'comment-count', 'promoted', 'is-promoted', 'data-promoted', 'is-ad', 'recommendation-reason', 'is-recommended', 'data-recommended', 'nsfw', 'is-nsfw', 'spoiler', 'is-spoiler', 'src'] };
  observer.observe(document.documentElement, observation);
  window.addEventListener('pageshow', event => { pendingUrl = ''; departing = false; suppressed = false; if (event.persisted && pageFromUrl(location.href)?.kind === 'home') { homeMode = 'following'; homeController.reset(); } refresh(); });
  window.addEventListener('popstate', () => { suppressed = false; schedule(); });
  let lastRootScan = 0;
  const poll = window.setInterval(() => {
    if (location.href !== lastUrl) { rootsDirty = true; schedule(); }
    else if (!suppressed && homeFeed?.status === 'switching') schedule();
    else if (preferences.enabled && pageFromUrl(location.href) && Date.now() - lastRootScan >= 1500) {
      lastRootScan = Date.now();
      // Attaching a shadow root does not generate a light-DOM mutation.
      const discovered = nativeRoots();
      if (discovered.some(root => !cachedRoots.includes(root) || root instanceof ShadowRoot && nativeStyles.get(root)?.parentNode !== root)) { cachedRoots = discovered; rootsDirty = false; schedule(); }
    }
  }, 250);
  extensionApi()?.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) {
      const next = normalizePreferences(changes[KEY].newValue);
      if (!preferences.enabled && next.enabled) suppressed = false;
      preferences = next; refresh();
    }
  });
  window.addEventListener('pagehide', event => { if (!event.persisted) { observer.disconnect(); clearInterval(poll); clearTimeout(timer); clearTimeout(emptyTimer); restore(); adFiltering(false); nativeSkin.clear(); } });
  lastUrl = location.href; refresh();
}
if (document.body) void start();
else {
  const bootstrap = new MutationObserver(() => { if (document.body) { bootstrap.disconnect(); void start(); } });
  bootstrap.observe(document.documentElement || document, {childList:true,subtree:true});
}
