import { extractPosts } from '../shared/extract';
import { mountReader } from '../shared/reader';
import { DEFAULTS, normalizePreferences, pageFromUrl, visit, type Preferences } from '../shared/model';
import { extensionApi, KEY, loadPreferences, savePreferences } from './storage';
declare const __PUREDDIT_THEME__: string;

// Only inspect feed pages the user opens. No fetch/XHR, credentials, API calls,
// history interception, or writes to Reddit are used by this extension.
async function start() {
  let preferences: Preferences; let storageError = false;
  try { preferences = await loadPreferences(); } catch { preferences = normalizePreferences(DEFAULTS); storageError = true; }
  let host: HTMLDivElement | undefined;
  let toggle: HTMLDivElement | undefined;
  let ui: ReturnType<typeof mountReader> | undefined;
  let suppressed = false; let lastVisit = ''; let lastUrl = ''; let timer = 0;
  let overflow: string | undefined;
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
  function showOriginal() { suppressed = true; restore(); if (host) host.hidden = true; if (toggle) toggle.hidden = false; }
  function create() {
    host = document.createElement('div'); host.id = 'pureddit-extension-root';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;width:100%;height:100dvh;display:block;';
    // The hidden attribute must also override the inline display declaration.
    const visibility = () => { if (host) host.style.display = host.hidden ? 'none' : 'block'; };
    const root = host.attachShadow({ mode: 'open' });
    ui = mountReader(root, __PUREDDIT_THEME__, {
      original: () => { showOriginal(); visibility(); },
      navigate: url => { location.href = url; },
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
    if (!preferences.enabled || !page) {
      restore(); host?.remove(); toggle?.remove(); host = undefined; toggle = undefined; ui = undefined; return;
    }
    if (page.community && page.community.toLowerCase() !== 'popular' && lastVisit !== page.community.toLowerCase()) {
      lastVisit = page.community.toLowerCase(); const next = visit(preferences, page.community);
      preferences = next; void savePreferences(next).catch(() => { storageError = true; });
    }
    if (!host) create();
    if (suppressed) { if (host) { host.hidden = true; host.style.display = 'none'; } if (toggle) toggle.hidden = false; return; }
    host!.hidden = false; host!.style.display = 'block'; toggle!.hidden = true;
    if (overflow === undefined) { overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    for (const child of document.body.children) {
      if (!(child instanceof HTMLElement) || child === host || child === toggle || ['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) continue;
      if (!originals.has(child)) { originals.set(child, { inert: child.inert, hidden: child.getAttribute('aria-hidden') }); child.inert = true; child.setAttribute('aria-hidden', 'true'); }
    }
    ui!.update({ ...extractPosts(document, location.href), page, preferences, preview: false });
    if (storageError) ui!.message('Browser preferences could not be saved. The reading view still works in this tab.');
  }
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(refresh, 120); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['post-title', 'permalink', 'content-href', 'subreddit-prefixed-name', 'subreddit-name', 'score', 'comment-count', 'promoted', 'is-promoted', 'data-promoted', 'recommendation-reason', 'is-recommended', 'data-recommended', 'nsfw', 'is-nsfw', 'spoiler', 'is-spoiler', 'src'] });
  window.addEventListener('popstate', () => { suppressed = false; schedule(); });
  const poll = window.setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; suppressed = false; schedule(); } }, 750);
  extensionApi()?.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) { preferences = normalizePreferences(changes[KEY].newValue); suppressed = false; refresh(); }
  });
  window.addEventListener('pagehide', event => { if (!event.persisted) { observer.disconnect(); clearInterval(poll); clearTimeout(timer); restore(); } });
  lastUrl = location.href; refresh();
}
if (document.body) void start();
