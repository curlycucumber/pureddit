import { pageFromUrl, type Preferences } from '../shared/model';
import { mountReader, type ReaderActions } from '../shared/reader';

// Keep Reddit's real forms, editors, menus and events; only apply appearance.
export function nativePage(url: string) {
  const path = new URL(url).pathname;
  return /^\/(?:r\/[A-Za-z0-9_]+\/)?comments\//i.test(path) || /^\/(?:user|u)\/[^/]+(?:\/|$)/i.test(path) || /^\/(?:r\/[A-Za-z0-9_]+\/)?submit\/?$/i.test(path) || /^\/notifications(?:\/|$)/.test(path);
}
export function nativeAppearance(theme: string, actions: ReaderActions) {
  const style = document.createElement('style'); style.id = 'pureddit-native-appearance';
  let panel: HTMLDivElement | undefined;
  let reader: ReturnType<typeof mountReader> | undefined; let resize: ResizeObserver | undefined;
  const offset = () => { const height = panel?.getBoundingClientRect().height || 0; document.documentElement.style.setProperty('--pureddit-shell-height', `${height}px`); };
  function clear() { style.remove(); resize?.disconnect(); resize = undefined; panel?.remove(); panel = undefined; reader = undefined; document.documentElement.style.removeProperty('--pureddit-shell-height'); document.documentElement.removeAttribute('data-pureddit-native'); }
  function update(preferences: Preferences) {
    const dark = preferences.colorScheme === 'dark';
    const background = dark ? '#101214' : '#ffffff', soft = dark ? '#252c31' : '#f1f5f8', text = dark ? '#e7e9ec' : '#26343f', muted = dark ? '#a8b4bc' : '#5c6c79', border = dark ? '#394249' : '#d5dfe8', link = dark ? '#80a7ff' : '#0756a6';
    document.documentElement.setAttribute('data-pureddit-native', preferences.appearance);
    const scope = 'html[data-pureddit-native]';
    style.textContent = `${scope}, ${scope} body, ${scope} shreddit-app, ${scope} .theme-light, ${scope} .theme-dark {color-scheme:${dark ? 'dark' : 'light'};--color-neutral-background:${background}!important;--color-neutral-background-weak:${background}!important;--color-neutral-background-hover:${soft}!important;--color-neutral-background-selected:${soft}!important;--color-neutral-content:${text}!important;--color-neutral-content-strong:${text}!important;--color-neutral-content-weak:${muted}!important;--color-neutral-border:${border}!important;--color-tone-1:${text}!important;--color-tone-2:${muted}!important;--color-tone-5:${border}!important;--color-tone-6:${soft}!important;--color-tone-7:${background}!important;--color-primary:${link}!important;background-color:${background};color:${text};font-family:${preferences.appearance === 'old' ? 'Arial,sans-serif' : '-apple-system,BlinkMacSystemFont,Arial,sans-serif'};}
${scope} main, ${scope} shreddit-post, ${scope} .commentarea, ${scope} .comment .entry {background-color:${background}!important;color:${text}!important;}
${scope} .comment .md, ${scope} .usertext-body .md {color:${text};}
${scope} .md a {color:${link};}
${scope} shreddit-comment-tree, ${scope} .commentarea {font-family:${preferences.appearance === 'old' ? 'Arial,sans-serif' : '-apple-system,BlinkMacSystemFont,Arial,sans-serif'};line-height:1.6;}
${scope} main h1 {font-size:${preferences.appearance === 'old' ? '22px' : '27px'};line-height:1.35;}
${scope} shreddit-comment {--color-action-upvote:#d94b16;--color-action-downvote:#4779d6;}
${scope}[data-pureddit-native=old] shreddit-comment {font-size:12px;--rem14:12px;--rem16:13px;}
${scope} body {padding-top:var(--pureddit-shell-height, 130px)!important;}
${scope} reddit-header-large, ${scope} shreddit-header {top:var(--pureddit-shell-height, 130px)!important;}
${scope} shreddit-post {border-radius:${preferences.appearance === 'old' ? '2px' : '12px'};}`;
    if (!style.isConnected) document.documentElement.append(style);
    if (!panel || !panel.isConnected) {
      panel?.remove(); resize?.disconnect(); panel = document.createElement('div'); panel.id = 'pureddit-native-controls';
      panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;z-index:2147483646;';
      const root = panel.attachShadow({mode:'open'});
      reader = mountReader(root, theme + `
        .reader {height:auto!important;min-height:0;background:var(--bg,#fff);}
        .layout, .classic-navigation, .skip {display:none!important;}
        .native-feeds {display:flex;align-items:center;gap:6px;padding:8px 20px;border-bottom:1px solid var(--border,#d5dfe8);}
        .native-feeds a {font:12px Arial,sans-serif;color:inherit;padding:7px 15px;border-radius:5px;text-decoration:none;}
        .native-feeds a:hover {background:#8882;}
      `, actions);
      const nav = document.createElement('nav'); nav.className = 'native-feeds'; nav.setAttribute('aria-label','Feeds');
      for (const [label,href] of [['Home','https://www.reddit.com/'],['Popular','https://www.reddit.com/r/popular/'],['News','https://www.reddit.com/r/news/']]) {
        const link=document.createElement('a'); link.textContent=label; link.href=href;
        link.onclick=event=>{if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey){event.preventDefault();actions.navigate(href);}}; nav.append(link);
      }
      root.querySelector('.reader')!.append(nav);
      // The native page retains its own navigation/subscriptions. Keep the
      // hamburger connected to that working menu while its content is visible.
      const communities=root.querySelector<HTMLButtonElement>('.community-toggle')!;
      communities.removeAttribute('aria-controls'); communities.removeAttribute('aria-expanded');
      communities.addEventListener('click',event=>{event.stopImmediatePropagation();actions.native('navigation');},true);
      document.body.append(panel); resize = new ResizeObserver(offset); resize.observe(panel);
    }
    reader!.update({posts:[],filtered:0,excluded:[],layout:'unsupported',page:pageFromUrl(location.href)||pageFromUrl('https://www.reddit.com/r/popular/')!,preferences,preview:false});
    offset();
  }
  function status(text: string) {
    const root=panel?.shadowRoot; if (!root) return;
    let message=root.querySelector<HTMLElement>('.native-status');
    if (!message) { message=document.createElement('p'); message.className='native-status'; message.setAttribute('role','status'); message.style.cssText='padding:8px 20px;font-size:12px'; root.querySelector('.reader')!.append(message); }
    message.textContent=text; offset();
  }
  return {update,clear,status,connected: () => Boolean(panel?.isConnected && style.isConnected)};
}
