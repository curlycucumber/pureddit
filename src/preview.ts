import { mountReader } from '../shared/reader';
import { extractPosts } from '../shared/extract';
import { communityUrl, DEFAULTS, normalizePreferences, pageFromUrl, visit } from '../shared/model';
import theme from '../shared/theme.css?inline';
import { createFixture } from './fixtures';
import './preview.css';

const root = document.querySelector<HTMLElement>('#app')!;
root.innerHTML = `<header class="preview-header"><div><p class="preview-kicker">Pureddit WebExtension</p><h1>One reading view. Across your browsers.</h1><p>Design preview with sample content. The extension runs on Reddit pages you open.</p></div><a class="guide" href="https://github.com/curlycucumber/pureddit/blob/main/docs/INSTALL.md" target="_blank" rel="noopener noreferrer">Installation guide ↗</a></header><section class="preview-controls" aria-label="Preview controls"><div class="devices" aria-label="Browser preview"><button data-device="firefox" aria-pressed="true">Firefox · desktop</button><button data-device="chrome" aria-pressed="false">Chrome · desktop</button><button data-device="safari" aria-pressed="false">Safari · iPhone</button></div><label>Page layout<select id="layout"><option value="modern">Modern Reddit</option><option value="old">Old Reddit</option></select></label></section><p class="preview-caption" role="status">Same renderer and stylesheet as the extension. This is a visual preview, not a browser compatibility test.</p><div class="device-wrap"><div class="device-frame"><div class="browser-bar"><span class="browser-dots">● ● ●</span><span id="address">reddit.com/r/popular</span><span class="preview-badge">Sample page</span></div><div id="reader-host"></div></div></div><div class="preview-message" role="status" hidden></div><section class="downloads"><div><h2>Try the extension</h2><p>Unsigned development packages. Browser-store publication is a separate step.</p></div><div class="download-links"><a href="/downloads/pureddit-firefox.zip" download>Firefox package ↓</a><a href="/downloads/pureddit-chrome.zip" download>Chrome package ↓</a><a href="/downloads/pureddit-safari.zip" download>Safari source ↓</a></div><p class="safari-note">Safari on iPhone needs an Xcode wrapper built and signed on a Mac. The Safari ZIP is extension source, not an installable iPhone app.</p></section><footer class="preview-footer">Pureddit · Source on <a href="https://github.com/curlycucumber/pureddit">GitHub</a> · No Reddit API, account connection, or database.</footer>`;
const KEY = 'pureddit:preview:v2';
let preferences = normalizePreferences({ ...DEFAULTS, pins: ['Design', 'technology', 'photography'] });
try {
  // Remove only the retired web app's local demo records, never unrelated site data.
  const oldKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
  oldKeys.forEach(key => { if (key === 'pureddit:v1' || key?.startsWith('pureddit:recent:')) localStorage.removeItem(key); });
  const stored = localStorage.getItem(KEY); if (stored) preferences = normalizePreferences(JSON.parse(stored));
} catch { /* Preview remains usable without storage. */ }
let page = pageFromUrl('https://www.reddit.com/r/popular/')!;
const host = document.querySelector<HTMLElement>('#reader-host')!;
function persist() { try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { reader.message('Preview preferences could not be saved in this browser.'); } }
const reader = mountReader(host.attachShadow({ mode: 'open' }), theme, {
  preview: true,
  appearance(value) { preferences = { ...preferences, appearance: value }; persist(); render(); },
  original() { const notice = document.querySelector<HTMLElement>('.preview-message')!; notice.hidden = false; notice.textContent = 'In the installed extension, Show Reddit restores the original page and native account controls. This preview contains illustrative fixtures only.'; },
  navigate(url) {
    const next = pageFromUrl(url);
    if (!next) { const notice = document.querySelector<HTMLElement>('.preview-message')!; notice.hidden = false; notice.textContent = 'In the installed extension, this opens the original Reddit discussion. Sample preview posts are not live Reddit posts.'; return; }
    page = next; if (next.community) { preferences = visit(preferences, next.community); persist(); } render();
  },
  pin(name) { if (!preferences.pins.some(item => item.toLowerCase() === name.toLowerCase()) && preferences.pins.length < 50) { preferences = { ...preferences, pins: [...preferences.pins, name] }; persist(); render(); } },
  unpin(name) { preferences = { ...preferences, pins: preferences.pins.filter(item => item !== name) }; persist(); render(); },
});
function render() {
  reader.update({ ...extractPosts(createFixture(preferences.appearance, page.kind === 'home' ? 'home' : page.community || 'popular'), location.href), page, preferences, preview: true });
  document.querySelector<HTMLSelectElement>('#layout')!.value = preferences.appearance;
  document.querySelector('#address')!.textContent = page.kind === 'home' ? 'reddit.com/new' : communityUrl(page.community!).replace('https://www.', '').replace(/\/$/, '');
}
document.querySelectorAll<HTMLButtonElement>('[data-device]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-device]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  const mobile = button.dataset.device === 'safari'; document.querySelector('.device-frame')!.classList.toggle('iphone', mobile);
  document.querySelector('.preview-caption')!.textContent = mobile ? 'iPhone-sized design preview. Safari installation requires a Mac, Xcode, signing, and testing on an iPhone.' : 'Same renderer and stylesheet as the extension. This is a visual preview, not a browser compatibility test.';
}));
document.querySelector<HTMLSelectElement>('#layout')!.addEventListener('change', event => {
  preferences = { ...preferences, appearance: (event.target as HTMLSelectElement).value === 'old' ? 'old' : 'modern' };
  persist(); render();
});
render();
