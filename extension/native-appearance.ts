import { pageFromUrl, NEWS_URL, type Page, type HomeFeed, type HomeMode, type Preferences } from '../shared/model';
import { nativeTheme } from './native-theme';
import { mountReader, type ReaderActions } from '../shared/reader';
import { nativeReadingCss } from './enhancements';
import { ClassicDiscussionLayout, classicDiscussionCss, classicMediaCss, classicCommentShadowCss } from './classic-discussion';

export const discussionPage = (url: string) => /^\/(?:r\/[A-Za-z0-9_]+\/)?comments\//i.test(new URL(url).pathname);

// Keep Reddit's real forms, editors, menus and events; only apply appearance.
export function nativePage(url: string) {
  const path = new URL(url).pathname;
  return /^\/(?:r\/[A-Za-z0-9_]+\/)?comments\//i.test(path) || /^\/(?:user|u)\/[^/]+(?:\/|$)/i.test(path) || /^\/(?:r\/[A-Za-z0-9_]+\/)?submit\/?$/i.test(path) || /^\/notifications(?:\/|$)/.test(path);
}
export function nativeAppearance(theme: string, actions: ReaderActions) {
  const style = document.createElement('style'); style.id = 'pureddit-native-appearance';
  const shadowStyles = new Map<ShadowRoot,HTMLStyleElement|null>();
  const classicLayout = new ClassicDiscussionLayout(); let classicDiscussion = false;
  let sharedSheet:CSSStyleSheet|undefined;let sharedCss='';
  try { if ('adoptedStyleSheets' in ShadowRoot.prototype && 'replaceSync' in CSSStyleSheet.prototype) sharedSheet=new CSSStyleSheet(); } catch { /* Older browsers use style elements. */ }
  let shadowCss = ''; let integrated = false;
  let panel: HTMLDivElement | undefined;
  let reader: ReturnType<typeof mountReader> | undefined; let resize: ResizeObserver | undefined;
  const offset = () => { const height = panel?.getBoundingClientRect().height || 0; document.documentElement.style.setProperty('--pureddit-shell-height', `${height}px`); };
  function clear() { classicLayout.clear();classicDiscussion=false;document.documentElement.removeAttribute('data-pureddit-native-page');reader?.closeTools();for(const [root,sheet] of shadowStyles){if(sheet)sheet.remove();else root.adoptedStyleSheets=root.adoptedStyleSheets.filter(value=>value!==sharedSheet);}shadowStyles.clear();style.remove(); resize?.disconnect(); resize = undefined; panel?.remove(); panel = undefined; reader = undefined; document.documentElement.style.removeProperty('--pureddit-shell-height'); document.documentElement.removeAttribute('data-pureddit-native'); }
  function update(preferences: Preferences) {
    integrated = Boolean(document.querySelector('shreddit-app'));
    const palette = nativeTheme(preferences);
    const classic = preferences.appearance === 'old';
    const discussion = discussionPage(location.href); classicDiscussion = classic && discussion;
    if(discussion)document.documentElement.setAttribute('data-pureddit-native-page','discussion');else document.documentElement.removeAttribute('data-pureddit-native-page');
    shadowCss = `${classic ? ':host{--rem14:12px!important;--rem16:13px!important;font-family:Arial,sans-serif!important;} :host(shreddit-comment){font-size:12px!important;line-height:1.5!important;} button{border-radius:2px!important;} [slot=comment-body]{font-size:12px!important;}' : ''}:host, .theme-dark, .theme-light {${palette.declarations}}${palette.rules('')}`;
    shadowCss += nativeReadingCss('',preferences.reading);
    const dark = preferences.colorScheme === 'dark';
    if(classicDiscussion)shadowCss += classicCommentShadowCss(dark,preferences.reading.textSize);
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
${scope}[data-pureddit-native=modern] shreddit-post {max-width:800px;margin:0 auto;padding:16px 0;border-bottom:1px solid ${border};}
${scope}[data-pureddit-native=modern] shreddit-post [slot=post-media-container], ${scope}[data-pureddit-native=modern] shreddit-post [slot=post-media-preview] {width:100%;max-height:780px;object-fit:contain;border-radius:14px;}
${scope}[data-pureddit-native=old] {--rem14:12px!important;--rem16:13px!important;}
${scope}[data-pureddit-native=old] main {font:12px/1.5 Arial,sans-serif;}
${scope}[data-pureddit-native=old] main h1,${scope}[data-pureddit-native=old] main [slot=title] {font:20px/1.3 Arial,sans-serif!important;color:${link}!important;margin-block:8px;}
${scope}[data-pureddit-native=old] shreddit-post {max-width:1100px;margin:0 auto;padding:8px;border:1px solid ${border};border-radius:0!important;}
${scope}[data-pureddit-native=old] shreddit-comment-tree,${scope}[data-pureddit-native=old] .commentarea {max-width:1100px;margin:12px auto;font:12px/1.5 Arial,sans-serif;}
${scope}[data-pureddit-native=old] shreddit-comment {font:12px/1.5 Arial,sans-serif!important;border-left:1px solid ${border};border-radius:0;padding-block:4px;}
${scope}[data-pureddit-native=old] main button {border-radius:2px!important;}
${scope} shreddit-post {border-radius:${preferences.appearance === 'old' ? '2px' : '12px'};}`;
    style.textContent += `${scope},${scope} body,${scope} shreddit-app,${scope} .theme-dark,${scope} .theme-light {${palette.declarations}}${palette.rules(scope)}`;
    if (classic) style.textContent += `${scope} main h1,${scope} main [slot=title]{color:${link}!important;font-size:20px!important;}`;
    if(classic)style.textContent+=classicMediaCss(`${scope}[data-pureddit-native=old]`);
    if(classicDiscussion)style.textContent+=classicDiscussionCss(dark,preferences.reading.textSize);
    // Reading overrides also outrank the more specific native Old typography.
    style.textContent += nativeReadingCss(`${scope}[data-pureddit-native]`,preferences.reading);
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
        .reader[data-integrated=true] .topbar,.reader[data-integrated=true] .native-feeds {display:none!important;}
        .reader[data-integrated=true] .view-controls {padding:8px 20px;gap:8px;min-height:48px;}
        .native-identity {display:none;font-size:15px;letter-spacing:-.4px;font-weight:700;}
        .reader[data-integrated=true] .native-identity {display:block;}
        .reader[data-native-discussion=true][data-appearance=old] .view-controls {background:#cee3f8;border-bottom-color:#5f99cf;}
        .reader[data-native-discussion=true][data-appearance=old][data-theme=dark] .view-controls {background:#171a1c;border-bottom-color:#394249;}
        .reader[data-integrated=true][data-native-discussion=true][data-appearance=old] .native-feeds {display:flex!important;background:#cee3f8;padding:2px 12px 0;gap:3px;}
        .reader[data-native-discussion=true][data-appearance=old] .native-feeds a {padding:3px 9px;border:1px solid #9bbad8;border-bottom:0;border-radius:0;font:bold 12px Arial,sans-serif;background:#eff6fc;color:#315a7d;}
        .reader[data-native-discussion=true][data-appearance=old][data-theme=dark] .native-feeds {background:#171a1c;}
        .reader[data-native-discussion=true][data-appearance=old][data-theme=dark] .native-feeds a {background:#252c31;color:#c8d2d8;border-color:#48545d;}
      `, actions);
      const identity=document.createElement('span');identity.className='native-identity';identity.textContent='pureddit';root.querySelector('.view-controls')!.prepend(identity);
      const nav = document.createElement('nav'); nav.className = 'native-feeds'; nav.setAttribute('aria-label','Feeds');
      for (const [label,href] of [['Home','https://www.reddit.com/'],['Popular','https://www.reddit.com/r/popular/'],['News',NEWS_URL]]) {
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
    panel!.shadowRoot!.querySelector<HTMLElement>('.reader')!.dataset.integrated=String(integrated);
    panel!.shadowRoot!.querySelector<HTMLElement>('.reader')!.dataset.nativeDiscussion=String(discussion);
    reader!.update({posts:[],filtered:0,excluded:[],layout:'unsupported',page:pageFromUrl(location.href)||pageFromUrl('https://www.reddit.com/r/popular/')!,preferences,preview:false});
    offset();
  }
  let lastFeed = '';
  function feed(page: Page | null, home: HomeFeed | undefined, change: (value: HomeMode) => void) {
    const root = panel?.shadowRoot; if (!root) return;
    if (!page) { const section=root.querySelector<HTMLElement>('.live-home'); if (section && !section.hidden) { section.hidden=true; offset(); } lastFeed=''; return; }
    const signature = JSON.stringify([page,home]); if (signature === lastFeed && root.querySelector('.live-home')) return; lastFeed = signature;
    root.querySelectorAll<HTMLAnchorElement>('.native-feeds a').forEach(link => { if (new URL(link.href).pathname === (page.kind === 'home' ? '/' : page.kind === 'news' ? '/news' : `/r/${page.community}/`)) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
    let section = root.querySelector<HTMLElement>('.live-home');
    if (!section) { section = document.createElement('section'); section.className='live-home'; section.style.cssText='padding:8px 20px;font-size:12px'; root.querySelector('.reader')!.append(section); }
    section.hidden = page.kind !== 'home' || integrated && home?.status !== 'unavailable'; section.replaceChildren();
    if (page.kind === 'home' && !integrated) {
      const tabs=document.createElement('div');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Home feed');
      for (const [label,mode] of [['Your Feed','following'],['Suggested Feed','for-you']] as const) {
        const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(home?.mode===mode));button.tabIndex=home?.mode===mode?0:-1;button.style.cssText='padding:8px 14px;border:1px solid #80808060;border-radius:18px;background:transparent;color:inherit;margin-right:6px';if(home?.mode===mode)button.style.fontWeight='700';button.onclick=()=>change(mode);tabs.append(button);
      }
      tabs.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const mode=event.key==='Home'?'following':event.key==='End'?'for-you':home?.mode==='following'?'for-you':'following';change(mode);root.querySelector<HTMLButtonElement>(`.live-home [aria-selected=true]`)?.focus();}};
      section.append(tabs);
    }
    if (page.kind === 'home' && home?.status !== 'ready') {const message=document.createElement('p');message.setAttribute('role','status');message.textContent=home?.message||'Waiting for Reddit’s feed.';const button=document.createElement('button');button.textContent='Open Reddit’s feed controls';button.onclick=actions.original;section.append(message,button);}
    offset();
  }
  function status(text: string, settingsUrl?:string) {
    const root=panel?.shadowRoot; if (!root) return;
    let message=root.querySelector<HTMLElement>('.native-status');
    if (!message) { message=document.createElement('p'); message.className='native-status'; message.setAttribute('role','status'); message.style.cssText='padding:8px 20px;font-size:12px'; root.querySelector('.reader')!.append(message); }
    message.textContent=text;message.hidden=!text;
    if(settingsUrl){const link=document.createElement('a');link.href=settingsUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open Reddit display settings (new tab)';link.style.cssText='color:inherit;text-decoration:underline;margin-left:8px';message.append(link);}
    offset();
  }
  function applyRoots(roots: Array<Document|ShadowRoot>) {
    classicLayout.apply(roots,classicDiscussion);
    if(sharedSheet && sharedCss!==shadowCss){sharedSheet.replaceSync(shadowCss);sharedCss=shadowCss;}
    for(const [root,sheet] of shadowStyles)if(!root.host.isConnected){if(sheet)sheet.remove();else root.adoptedStyleSheets=root.adoptedStyleSheets.filter(value=>value!==sharedSheet);shadowStyles.delete(root);}
    for(const root of roots)if(root instanceof ShadowRoot){
      if(sharedSheet){if(!root.adoptedStyleSheets.includes(sharedSheet))root.adoptedStyleSheets=[...root.adoptedStyleSheets,sharedSheet];shadowStyles.set(root,null);}
      else {let sheet=shadowStyles.get(root);if(!sheet){sheet=document.createElement('style');sheet.id='pureddit-shadow-theme';shadowStyles.set(root,sheet);}if(sheet.textContent!==shadowCss)sheet.textContent=shadowCss;if(sheet.parentNode!==root)root.append(sheet);}
    }
  }
  return {update,clear,status,feed,applyRoots,toolsOpen:()=>reader?.toolsOpen()||false,filters:(count:number,revealed:boolean,toggle:()=>void)=>reader?.filters(count,revealed,toggle),missingStyle:(root:ShadowRoot)=>shadowStyles.has(root)&&(shadowStyles.get(root)===null?!root.adoptedStyleSheets.includes(sharedSheet!):shadowStyles.get(root)!.parentNode!==root),connected: () => Boolean(panel?.isConnected && style.isConnected)};
}
