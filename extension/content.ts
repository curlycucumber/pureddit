import { DisplayModeController, renderedDisplayMode } from './display-mode';
import { NativeTabs } from './native-tabs';
import { RootRegistry } from './roots';
import { extractPosts } from '../shared/extract';
import { mountReader } from '../shared/reader';
import { DEFAULTS, HOME_URL, NEWS_URL, normalizePreferences, pageFromUrl, postUrl, visit, type HomeMode, type HomeFeed, type NativeAction, type Post, type Preferences } from '../shared/model';
import { advertisementCards, isAdDisclosureMutation, isAdvertisement, isRecommendation, AD_SELECTOR } from '../shared/feed';
import { HomeFeedController, nativeControl, nativeLink, cardSnapshot } from './native';
import { nativeAppearance, nativePage } from './native-appearance';
import { extensionApi, KEY, loadPreferences, savePreferences } from './storage';
import { DistractionFilter, TitleFilter, titleMutation, distractionMutation } from './enhancements';
import { keyboardNavigation } from '../shared/keyboard';
declare const __PUREDDIT_THEME__: string;

// Read feeds and style Reddit's native interactive pages. No fetch/XHR, credentials, API calls,
// history interception or private account endpoints. Display choices use Reddit’s native UI.
async function start() {
  if (window.top !== window || location.protocol !== 'https:' || !['www.reddit.com', 'reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(location.hostname)) return;
  let preferences: Preferences; let storageError = false;
  try { preferences = await loadPreferences(); } catch { preferences = normalizePreferences(DEFAULTS); storageError = true; }
  const initialMode=renderedDisplayMode();if(initialMode)preferences={...preferences,colorScheme:initialMode};
  const displayMode = new DisplayModeController();let colorRequest=0;
  let host: HTMLDivElement | undefined;
  let toggle: HTMLDivElement | undefined;
  let ui: ReturnType<typeof mountReader> | undefined;
  let loadingFallback = false; let emptySince = 0; let emptyTimer = 0;
  let departing = false; let suppressed = false; let lastVisit = ''; let lastUrl = ''; let timer = 0;
  let registry: RootRegistry | undefined;
  const discovery = () => registry ||= new RootRegistry();
  let liveNative = false;
  let parsedPosts = new WeakMap<Element, Post>();
  let rootsDirty = true; let cachedRoots: Array<Document | ShadowRoot> = [];
  const rootsNow = () => { if (rootsDirty) { cachedRoots = discovery().snapshot(false); rootsDirty = false; } return cachedRoots; };
  let lastCards = new Map<Element,string>(); let routeCards = new Map<Element,string>();
  let pendingUrl = ''; let navigationTimer = 0;
  function cancelNavigation() { clearTimeout(navigationTimer); navigationTimer = 0; pendingUrl = ''; departing = false; }
  let overflow: string | undefined;
  let homeMode: HomeMode = 'following'; let homeFeed: HomeFeed | undefined;
  const nativeTabs = new NativeTabs();
  const homeController = new HomeFeedController();
  let nativeActive = false;
  const distractions = new DistractionFilter(), titles = new TitleFilter();
  const featureActions = { preferences: (value: Pick<Preferences,'reading'|'distractions'|'titleFilters'|'keyboard'>) => { void save({ ...preferences, reading:value.reading, distractions:value.distractions, titleFilters:value.titleFilters, keyboard:value.keyboard }); },
    pin: (name:string) => { if (!preferences.pins.some(item => item.toLowerCase() === name.toLowerCase()) && preferences.pins.length < 50) void save({ ...preferences, pins:[...preferences.pins,name] }); },
    unpin: (name:string) => { void save({ ...preferences,pins:preferences.pins.filter(item=>item!==name) }); } };
  const nativeSkin = nativeAppearance(__PUREDDIT_THEME__, {...featureActions, original: () => { nativeActive = false; nativeSkin.clear(); skinKey = ''; showOriginal(); }, navigate, native, appearance: value => { void save({...preferences,appearance:value}); }, colorScheme: value => { void changeColorScheme(value); }, homeMode: () => {}, more: () => {}}); let rendered = ''; let skinKey = '';
  function skin(enabled: boolean) {
    const key = enabled ? JSON.stringify([preferences,Boolean(document.querySelector('shreddit-app'))]) : '';
    if (key === skinKey && (!enabled || nativeSkin.connected())) return; skinKey = key;
    if (enabled) nativeSkin.update(preferences); else nativeSkin.clear();
  }
  const filteredNative = new Set<Element>();
  const clearNativeFilters = () => { for (const node of filteredNative) node.removeAttribute('data-pureddit-filtered'); filteredNative.clear(); };
  let nativeAds = new Set<Element>();
  const nativeStyles = new Map<ShadowRoot, HTMLStyleElement>();
  let observed = new Set<ShadowRoot>(); let observing = false;
  let cacheKey = ''; const postCache = new Map<string, Post>();
  const adStyle = document.createElement('style'); adStyle.id = 'pureddit-native-ad-style';
  // Cosmetic ad hiding also applies when the original native feed is visible.
  adStyle.textContent = '[data-pureddit-filtered],[data-pureddit-ad],[data-pureddit-title-filter],[data-pureddit-distraction]{display:none!important}[data-pureddit-selected]{outline:2px solid #5f99cf!important;outline-offset:-2px;}' + AD_SELECTOR.split(',').map(selector => `html[data-pureddit-feed] ${selector}`).join(',') + '{display:none!important}';
  function adFiltering(enabled: boolean, roots: Array<Document | ShadowRoot> = []) {
    if (enabled) {
      const ads = advertisementCards(roots);
      for(const card of nativeAds)if(!ads.has(card))card.removeAttribute('data-pureddit-ad');
      for(const card of ads)if(!card.hasAttribute('data-pureddit-ad'))card.setAttribute('data-pureddit-ad','');
      nativeAds=ads;
      if (!adStyle.isConnected) document.documentElement.append(adStyle); document.documentElement.setAttribute('data-pureddit-feed', '');
    for (const root of roots) if (root instanceof ShadowRoot) {
        let style = nativeStyles.get(root);
        if (!style) { style = document.createElement('style'); style.textContent = '[data-pureddit-filtered],[data-pureddit-ad],[data-pureddit-title-filter],[data-pureddit-distraction]{display:none!important}[data-pureddit-selected]{outline:2px solid #5f99cf!important;outline-offset:-2px;}' + AD_SELECTOR + '{display:none!important}'; nativeStyles.set(root, style); }
        if (style.parentNode !== root) root.append(style);
      }
      for (const [root, style] of nativeStyles) if (!root.host.isConnected) { style.remove(); nativeStyles.delete(root); }
    } else { for(const card of nativeAds)card.removeAttribute('data-pureddit-ad');nativeAds.clear();document.documentElement.removeAttribute('data-pureddit-feed'); adStyle.remove(); nativeStyles.forEach(style => style.remove()); nativeStyles.clear(); }
  }
  const originals = new Map<HTMLElement, { inert: boolean; hidden: string | null }>();
  const restore = () => {
    originals.forEach((value, node) => { node.inert = value.inert; if (node.getAttribute('aria-hidden') === 'true') { if (value.hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', value.hidden); } });
    originals.clear();
    if (overflow !== undefined) { if (document.body.style.overflow === 'hidden') document.body.style.overflow = overflow; overflow = undefined; }
  };
  async function save(next: Preferences) {
    preferences = normalizePreferences(next); refresh();
    try { await savePreferences(preferences); } catch {
      const message='Preferences changed for this tab, but browser storage could not save them.';
      if(nativeSkin.connected())nativeSkin.status(message);else ui?.message(message);
    }
  }
  async function changeColorScheme(value: Preferences['colorScheme']) {
    const request=++colorRequest;
    await save({...preferences,colorScheme:value});
    if(request!==colorRequest||!preferences.enabled)return;
    const result=await displayMode.set(value,()=>discovery().snapshot(),restore);
    if(result==='canceled'||request!==colorRequest||!preferences.enabled)return;
    const label=value==='light'?'Light':'Dark';
    if(result==='selected') { if(nativeSkin.connected())nativeSkin.status(`Reddit display mode: ${label}.`); else ui?.message(`Reddit display mode: ${label}.`); }
    else {
      const actual=renderedDisplayMode();if(actual&&actual!==preferences.colorScheme)await save({...preferences,colorScheme:actual});
      const message=`Reddit did not confirm ${label} display mode. Open Reddit display settings and select ${label}.`;
      if(nativeSkin.connected())nativeSkin.status(message,'https://www.reddit.com/settings/preferences');else { ui?.message(message);const notice=host?.shadowRoot?.querySelector('.notice');if(notice){const link=document.createElement('a');link.href='https://www.reddit.com/settings/preferences';link.target='_blank';link.rel='noopener noreferrer';link.textContent=' Open Reddit display settings (new tab)';link.style.textDecoration='underline';notice.append(link);} }
    }
    refresh();
  }
  function showOriginal(keepNavigation = false) { if (!keepNavigation) cancelNavigation(); loadingFallback = false; suppressed = true; restore(); if (!nativeActive) { nativeTabs.clear(); clearNativeFilters(); } skin(nativeActive); if (host) { host.hidden = true; host.style.display = 'none'; } ensureToggle(); if (toggle) toggle.hidden = false; }
  function native(action: NativeAction) {
    cachedRoots = discovery().snapshot(); rootsDirty = false;
    const control = nativeControl(action, cachedRoots);
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
    if (url === location.href) { cancelNavigation(); routeCards.clear(); rendered = ''; suppressed = false; refresh(); return; }
    cancelNavigation();
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
    if (!next && nativePage(url)) { nativeActive = true; showOriginal(true); suppressed = false; }
    const requested = pendingUrl;
    navigationTimer = window.setTimeout(() => { if (pendingUrl === requested && requested) { cancelNavigation(); routeCards.clear(); rendered = ''; refresh(); ui?.message('Reddit did not finish switching pages. Retry or use Show Reddit.'); } },10000);
    if (link) {
      link.click(); if (temporary) link.remove();
      queueMicrotask(() => { rootsDirty = true; refresh(); });
      return;
    }
    departing = true;
    location.assign(url);
  }
  function create() {
    host = document.createElement('div'); host.id = 'pureddit-extension-root';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;width:100%;height:100dvh;display:block;';
    // The hidden attribute must also override the inline display declaration.
    const visibility = () => { if (host) host.style.display = host.hidden ? 'none' : 'block'; };
    const root = host.attachShadow({ mode: 'open' });
    ui = mountReader(root, __PUREDDIT_THEME__, {
      ...featureActions,
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
      colorScheme: value => { void changeColorScheme(value); },
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
    button.addEventListener('click', () => { cancelNavigation(); rendered = ''; suppressed = false; refresh(); }); shadow.append(button); toggle.hidden = true; document.body.append(toggle);
  }
  function refresh() {
    if (!preferences.enabled) {
      colorRequest++;displayMode.cancel(); cancelNavigation(); observer.disconnect();
      if (observing || registry) { registry = undefined; rootsDirty = true; cachedRoots = []; parsedPosts = new WeakMap(); lastCards.clear(); routeCards.clear(); homeController.reset(); }
      observing = false; observed.clear();
    }
    else if (!observing) { observer.observe(document.documentElement, observation); observing = true; }
    // A native router may canonicalize the destination or the user may press
    // Back. Any real URL transition must release the pending-navigation guard.
    if ((departing || pendingUrl) && location.href === lastUrl) return;
    if (location.href !== lastUrl) {
      const previousUrl = lastUrl, requested = Boolean(pendingUrl);
      cancelNavigation(); lastUrl = location.href; suppressed = false; nativeActive = false; loadingFallback = false; emptySince = 0; homeController.reset();
      if (pageFromUrl(location.href)?.kind === 'home') homeMode = 'following';
      rootsDirty = true;
      routeCards = pageFromUrl(previousUrl) && pageFromUrl(location.href) ? (requested ? routeCards : lastCards) : new Map();
      postCache.clear(); cacheKey = ''; rendered = '';
    }
    const page = pageFromUrl(location.href);
    if (page?.kind !== 'home') homeFeed = undefined;
    const roots = preferences.enabled && (page || nativePage(location.href)) ? rootsNow() : [];
    const liveModern = Boolean(preferences.enabled && page && preferences.appearance === 'modern' && document.querySelector('shreddit-app') && (!suppressed || nativeActive));
    liveNative = liveModern;
    if (liveModern) homeFeed = page!.kind === 'home' ? homeController.select(homeMode, restore, roots) : undefined;
    skin(liveModern || preferences.enabled && (Boolean(page) && suppressed && nativeActive || !page && nativePage(location.href) && !suppressed));
    if (!preferences.enabled || !nativeSkin.connected()) nativeTabs.clear();
    else { if (!liveModern || page?.kind !== 'home') nativeTabs.clearHome();if(document.querySelector('shreddit-app')) nativeTabs.news(roots); }
    if (preferences.enabled && nativeSkin.connected()) nativeSkin.applyRoots(roots);
    if (!liveModern) nativeSkin.feed(null, undefined, () => {});
    if ([...observed].some(root => !root.host.isConnected)) { observer.disconnect(); observer.observe(document.documentElement, observation); observed = new Set(); }
    for (const root of roots) if (root instanceof ShadowRoot && !observed.has(root)) { observer.observe(root, observation); observed.add(root); }
    adFiltering(preferences.enabled && Boolean(page || nativePage(location.href)), roots);
    if (preferences.enabled && (page || nativePage(location.href)) && !suppressed) distractions.apply(roots,preferences.distractions); else distractions.clear();
    if (!liveModern) titles.clear();
    if (!preferences.enabled || !preferences.keyboard || !page) shortcuts.clear();
    if (!preferences.enabled || !page) { nativeSkin.filters(0,false,()=>{}); if (!preferences.enabled) titles.reset(); }
    if (!preferences.enabled || !page) {
      clearNativeFilters(); restore(); ui?.closeTools();host?.remove();
      if (!preferences.enabled || !nativePage(location.href) || !suppressed) { toggle?.remove(); toggle = undefined; } else { ensureToggle(); toggle!.hidden = false; }
      host = undefined; ui = undefined; homeFeed = undefined; postCache.clear(); rendered = ''; clearTimeout(emptyTimer); emptyTimer = 0; emptySince = 0; return;
    }
    if (page.community && page.community.toLowerCase() !== 'popular' && lastVisit !== page.community.toLowerCase()) {
      lastVisit = page.community.toLowerCase(); const next = visit(preferences, page.community);
      preferences = next; void savePreferences(next).catch(() => { storageError = true; });
    }
    if (liveModern) {
      if (page.kind === 'home') nativeTabs.apply(roots);
      restore();
      if (host) { host.hidden = true; host.style.display = 'none'; }
      if (toggle) toggle.hidden = true;
      const stale = page.kind === 'home' && homeMode === 'following' ? new Set(homeController.staleCards(roots)) : new Set<Element>();
      const flagged = new Set<Element>();
      const filterCandidates: Element[] = [];
      for (const root of roots) for (const card of root.querySelectorAll('shreddit-post, .thing.link')) {
        if (nativeAds.has(card) || isAdvertisement(card) || page.kind === 'home' && (homeFeed?.status !== 'ready' || stale.has(card) || homeMode === 'following' && isRecommendation(card))) flagged.add(card);
        else if (preferences.titleFilters.length && !card.closest('[hidden]')) filterCandidates.push(card);
      }
      for (const card of filteredNative) if (!flagged.has(card)) card.removeAttribute('data-pureddit-filtered');
      for (const card of flagged) if (!card.hasAttribute('data-pureddit-filtered')) card.setAttribute('data-pureddit-filtered','');
      filteredNative.clear(); for (const card of flagged) filteredNative.add(card);
      const titleCount = titles.apply(filterCandidates,preferences.titleFilters,`${location.href}:${homeMode}`);
      nativeSkin.filters(titleCount,titles.revealed,()=>{titles.toggle();refresh();});
      nativeSkin.feed(page, homeFeed, value => { if (homeMode !== value) { homeMode = value; homeController.reset(); } refresh(); });
      return;
    }
    clearNativeFilters();
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
    const options = { advertisements:nativeAds, cache: parsedPosts, excludeElements: unchanged, includeRecommendations: page.kind === 'home' && homeMode === 'for-you' };
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
  let frame = 0;
  const flush = () => { cancelAnimationFrame(frame); clearTimeout(timer); frame = 0; timer = 0; refresh(); };
  const schedule = () => { if (document.hidden) return; if (!timer) { timer = window.setTimeout(flush, 80); if (!document.hidden) frame = requestAnimationFrame(flush); } };
  let keyboardReturn = '';
  const shortcuts = keyboardNavigation(document, {
    enabled: () => preferences.enabled && preferences.keyboard && !suppressed && matchMedia('(min-width:768px) and (pointer:fine)').matches,
    blocked: () => Boolean(nativeSkin.toolsOpen() || ui?.toolsOpen() || rootsNow().some(root=>[...root.querySelectorAll('dialog[open], [role=dialog], [role=menu], [role=listbox]')].some(node=>node.getClientRects().length>0))),
    posts: () => {
      const root = host && !host.hidden ? host.shadowRoot : undefined;
      if (root) return [...root.querySelectorAll<HTMLElement>('.post')].map(element => {
        const open = () => { keyboardReturn=location.href;element.querySelector<HTMLAnchorElement>('.post-title')?.click(); };
        return {element,open,comments:()=>{keyboardReturn=location.href;element.querySelector<HTMLAnchorElement>('.comment-pill')?.click();}};
      });
      if (!liveNative || !pageFromUrl(location.href)) return [];
      return rootsNow().flatMap(root=>[...root.querySelectorAll<HTMLElement>('shreddit-post, .thing.link')]).flatMap(element=>{
        const href=postUrl(element.getAttribute('permalink')||element.getAttribute('data-permalink')||element.querySelector('a[slot=full-post-link], a.comments, a[href*="/comments/"]')?.getAttribute('href')||'');
        if(!href)return [];
        const open=()=>{keyboardReturn=location.href;navigate(href);};
        return [{element,open,comments:()=>{keyboardReturn=location.href;navigate(`${href}#comments`);}}];
      });
    },
    back: () => {
      if (!keyboardReturn || !postUrl(location.href) || rootsNow().some(root=>[...root.querySelectorAll('dialog[open], [role=dialog], [role=menu]')].some(node=>node.getClientRects().length>0))) return false;
      const url=keyboardReturn;keyboardReturn='';navigate(url);return true;
    },
  });
  const observer = new MutationObserver(records => {
    if (!preferences.enabled) return;
    let relevant = false;
    const added = new Set<Element>();
    for (const record of records) {
      if (nativeTabs.ownMutation(record)) continue;
      if(record.type==='attributes'&&record.attributeName==='class'&&!displayMode.busy&&[document.documentElement,document.body,document.querySelector('shreddit-app')].includes(record.target as HTMLElement)){
        const actual=renderedDisplayMode();if(actual&&actual!==preferences.colorScheme){preferences={...preferences,colorScheme:actual};void savePreferences(preferences).catch(()=>{storageError=true;});nativeSkin.status('');relevant=true;}
      }
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest('#pureddit-extension-root, #pureddit-native-controls, #pureddit-return-toggle')) continue;
      let touchedCard = false;
      let ancestor: Element | null = target || null;
      while (ancestor) {
        const card = ancestor.closest('shreddit-post, .thing.link'); if (card) { parsedPosts.delete(card); touchedCard = true; }
        const owner = ancestor.getRootNode(); ancestor = owner instanceof ShadowRoot ? owner.host : null;
      }
      if (record.type === 'characterData') { if (!liveNative && touchedCard || target && (isAdDisclosureMutation(target) || touchedCard && preferences.titleFilters.length && titleMutation(target) || Object.values(preferences.distractions).some(Boolean) && distractionMutation(target)) || target?.closest('[role=tab], [role=tablist]')) relevant = true; }
      else if (record.type === 'attributes') {
        if (liveNative && touchedCard && !['class', 'hidden', 'slot', 'href', 'aria-label', 'data-ad-click-location', 'data-ad-click-action', ...(preferences.titleFilters.length ? ['post-title'] : []), 'promoted', 'is-promoted', 'data-promoted', 'is-ad', 'is-recommended', 'data-recommended', 'recommendation-reason', 'data-testid'].includes(record.attributeName || '')) continue;
        if (record.attributeName !== 'class' || target?.matches('[role=tab], .thing') || target?.closest('shreddit-post, .thing.link')) relevant = true;
      } else {
        const owner = record.target.getRootNode();
        if (owner instanceof ShadowRoot && (nativeStyles.has(owner) && !nativeStyles.get(owner)!.isConnected || nativeSkin.missingStyle(owner))) relevant = true;
        if (target?.closest('shreddit-post, .thing.link, [role=tablist]')) relevant = true;
        for (const node of [...record.addedNodes,...record.removedNodes]) if (node instanceof Element && !node.matches('style, script, #pureddit-extension-root, #pureddit-native-controls, #pureddit-return-toggle')) { if (node.isConnected) added.add(node); rootsDirty = true; relevant = true; }
      }
    }
    if (added.size) registry?.addAll(added);
    if (relevant) schedule();
  });
  const observation: MutationObserverInit = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['id', 'href', 'data-ad-click-location', 'data-ad-click-action', 'slot', 'data-fullname', 'data-permalink', 'data-subreddit', 'aria-label', 'class', 'data-testid', 'faceplate-tab-selected', 'data-selected', 'data-active', 'active', 'checked', 'hidden', 'aria-selected', 'aria-current', 'aria-pressed', 'data-state', 'selected', 'post-type', 'data-post-type', 'author', 'data-timestamp', 'post-title', 'permalink', 'content-href', 'created-timestamp', 'datetime', 'subreddit-prefixed-name', 'subreddit-name', 'score', 'comment-count', 'promoted', 'is-promoted', 'data-promoted', 'is-ad', 'recommendation-reason', 'is-recommended', 'data-recommended', 'nsfw', 'is-nsfw', 'spoiler', 'is-spoiler', 'src'] };
  observer.observe(document.documentElement, observation); observing = true;
  window.addEventListener('pageshow', event => { cancelNavigation(); suppressed = false; if (event.persisted && pageFromUrl(location.href)?.kind === 'home') { homeMode = 'following'; homeController.reset(); } refresh(); });
  document.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button!==0) return;
    if (preferences.enabled && nativeTabs.isNews(event.composedPath())) {event.preventDefault();event.stopImmediatePropagation();navigate(NEWS_URL);return;}
    if (!liveNative || pageFromUrl(location.href)?.kind !== 'home') return;
    const home=event.composedPath().find(node=>node instanceof HTMLAnchorElement && node.href===HOME_URL) as HTMLAnchorElement|undefined;
    if(home && homeMode!=='following'){homeMode='following';homeController.reset();schedule();}
    const mode=nativeTabs.mode(event.composedPath());
    if (mode && mode!==homeMode) { homeController.expect(mode,rootsNow());homeMode=mode;schedule(); }
  },true);
  window.addEventListener('popstate', () => { suppressed = false; schedule(); });
  let lastRootScan = 0;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { rootsDirty = true; schedule(); } });
  const poll = window.setInterval(() => {
    if (document.hidden || !preferences.enabled) return;
    if (location.href !== lastUrl) { rootsDirty = true; schedule(); }
    else if (!suppressed && homeFeed?.status === 'switching') schedule();
    else if (preferences.enabled && (pageFromUrl(location.href) || nativePage(location.href)) && Date.now() - lastRootScan >= 1500) {
      lastRootScan = Date.now();
      // Attaching a shadow root does not generate a light-DOM mutation.
      const discovered = discovery().snapshot();
      if (discovered.some(root => !cachedRoots.includes(root) || root instanceof ShadowRoot && (pageFromUrl(location.href) && nativeStyles.get(root)?.parentNode !== root || nativeSkin.missingStyle(root)))) { cachedRoots = discovered; rootsDirty = false; schedule(); }
    }
  }, 250);
  extensionApi()?.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) {
      const next = normalizePreferences(changes[KEY].newValue);
      if (!preferences.enabled && next.enabled) { const actual=renderedDisplayMode();if(actual)next.colorScheme=actual; suppressed = false; registry = undefined; rootsDirty = true; cachedRoots = []; parsedPosts = new WeakMap(); }
      preferences = next; refresh();
    }
  });
  window.addEventListener('pagehide', event => { if (!event.persisted) { shortcuts.destroy();distractions.clear();titles.reset();ui?.closeTools();observer.disconnect(); clearInterval(poll); clearTimeout(timer); cancelAnimationFrame(frame); clearTimeout(emptyTimer); displayMode.cancel(); cancelNavigation(); nativeTabs.clear(); clearNativeFilters(); restore(); adFiltering(false); nativeSkin.clear(); } });
  lastUrl = location.href; refresh();
}
if (document.body) void start();
else {
  const bootstrap = new MutationObserver(() => { if (document.body) { bootstrap.disconnect(); void start(); } });
  bootstrap.observe(document.documentElement || document, {childList:true,subtree:true});
}
