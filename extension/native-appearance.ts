import type { Preferences } from '../shared/model';

// Keep Reddit's real forms, editors, menus and events; only apply appearance.
export function nativePage(url: string) {
  const path = new URL(url).pathname;
  return /^\/(?:r\/[A-Za-z0-9_]+\/)?comments\//i.test(path) || /^\/(?:user|u)\/[^/]+(?:\/|$)/i.test(path) || /^\/(?:r\/[A-Za-z0-9_]+\/)?submit\/?$/i.test(path) || /^\/notifications(?:\/|$)/.test(path);
}
export function nativeAppearance() {
  const style = document.createElement('style'); style.id = 'pureddit-native-appearance';
  let panel: HTMLDivElement | undefined;
  function clear() { style.remove(); panel?.remove(); panel = undefined; document.documentElement.removeAttribute('data-pureddit-native'); }
  function update(preferences: Preferences, change: (next: Preferences) => void) {
    const dark = preferences.colorScheme === 'dark';
    const background = dark ? '#101214' : '#ffffff', soft = dark ? '#252c31' : '#f1f5f8', text = dark ? '#e7e9ec' : '#26343f', muted = dark ? '#a8b4bc' : '#5c6c79', border = dark ? '#394249' : '#d5dfe8', link = dark ? '#80a7ff' : '#0756a6';
    document.documentElement.setAttribute('data-pureddit-native', preferences.appearance);
    const scope = 'html[data-pureddit-native]';
    style.textContent = `${scope}, ${scope} body, ${scope} shreddit-app {color-scheme:${dark ? 'dark' : 'light'};--color-neutral-background:${background}!important;--color-neutral-background-weak:${background}!important;--color-neutral-background-hover:${soft}!important;--color-neutral-background-selected:${soft}!important;--color-neutral-content:${text}!important;--color-neutral-content-strong:${text}!important;--color-neutral-content-weak:${muted}!important;--color-neutral-border:${border}!important;--color-tone-1:${text}!important;--color-tone-2:${muted}!important;--color-tone-5:${border}!important;--color-tone-6:${soft}!important;--color-tone-7:${background}!important;--color-primary:${link}!important;background-color:${background};color:${text};font-family:${preferences.appearance === 'old' ? 'Arial,sans-serif' : '-apple-system,BlinkMacSystemFont,Arial,sans-serif'};}
${scope} main, ${scope} shreddit-post, ${scope} .commentarea, ${scope} .comment .entry {background-color:${background};color:${text};}
${scope} .comment .md, ${scope} .usertext-body .md {color:${text};}
${scope} .md a {color:${link};}
${scope}[data-pureddit-native=old] shreddit-comment {font-size:12px;--rem14:12px;--rem16:13px;}
${scope} shreddit-post {border-radius:${preferences.appearance === 'old' ? '2px' : '12px'};}`;
    if (!style.isConnected) document.documentElement.append(style);
    if (!panel) { panel = document.createElement('div'); panel.id = 'pureddit-native-controls'; panel.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483647;max-width:calc(100vw - 24px)'; panel.attachShadow({mode:'open'}); document.body.append(panel); }
    const root = panel.shadowRoot!; root.replaceChildren();
    const css = document.createElement('style'); css.textContent = `div{display:flex;align-items:center;gap:6px;padding:7px;border:1px solid ${border};border-radius:8px;background:${background};color:${text};box-shadow:0 2px 12px #0002;font:12px Arial,sans-serif}span{padding:0 5px;font-weight:bold}button{font:inherit;border:0;padding:7px;border-radius:4px;background:${soft};color:${text};cursor:pointer}button[aria-pressed=true]{outline:1px solid ${link}}button:focus-visible{outline:2px solid ${link}}`;
    const bar = document.createElement('div'); bar.setAttribute('role','group'); bar.setAttribute('aria-label','Pureddit appearance'); const name=document.createElement('span'); name.textContent='pureddit'; bar.append(name);
    for (const [label,value] of [['Modern','modern'],['Old','old']] as const) { const button=document.createElement('button'); button.textContent=label; button.setAttribute('aria-label',`${label} layout`); button.setAttribute('aria-pressed',String(preferences.appearance===value)); button.onclick=()=>change({...preferences,appearance:value}); bar.append(button); }
    for (const [label,value,symbol] of [['Light mode','light','☀'],['Dark mode','dark','☾']] as const) { const button=document.createElement('button'); button.textContent=symbol; button.setAttribute('aria-label',label); button.setAttribute('aria-pressed',String(preferences.colorScheme===value)); button.onclick=()=>change({...preferences,colorScheme:value}); bar.append(button); }
    root.append(css,bar);
  }
  return {update,clear};
}
