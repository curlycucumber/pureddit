// Flatten the native page's centering wrappers through CSS, without moving
// Reddit's post, comment tree, forms, players or navigation nodes.
export class ClassicDiscussionLayout {
  private marked = new Map<Element, string>();
  clear() { for (const node of this.marked.keys()) node.removeAttribute('data-pureddit-classic-region'); this.marked.clear(); }
  apply(roots: Array<Document | ShadowRoot>, enabled: boolean) {
    if (!enabled) { this.clear(); return; }
    const find = (selector: string) => roots.map(root=>root.querySelector(selector)).find(Boolean) || null;
    const main = find('main'), rail = find('#right-sidebar-container, [data-testid="right-sidebar"], #subreddit-right-rail__partial');
    const nav = find('#left-sidebar-container, [data-testid="left-sidebar"]');
    const next = new Map<Element,string>();
    if (main) {
      next.set(main,'main');
      const content=rail&&main.contains(rail)?main.querySelector('shreddit-post, shreddit-comment-tree, .commentarea')||main:main;
      let common = content.parentElement;
      while (common && rail && !common.contains(rail)) common = common.parentElement;
      if (rail && common && ![document.body,document.documentElement].includes(common as HTMLElement) && common.localName !== 'shreddit-app' && !content.contains(rail)) {
        const branch = (node: Element) => { while(node.parentElement && node.parentElement!==common) node=node.parentElement; return node; };
        const mainBranch=branch(content),railBranch=branch(rail),navBranch=nav&&common.contains(nav)?branch(nav):null;
        if(mainBranch!==railBranch){
          const withNav=navBranch&&navBranch!==mainBranch&&navBranch!==railBranch;
          next.set(common,withNav?'layout-with-nav':'layout');next.set(mainBranch,'main-column');next.set(railBranch,'rail');
          if(withNav)next.set(navBranch,'navigation');
          for(let node=content.parentElement;node&&node!==mainBranch&&node!==common;node=node.parentElement)next.set(node,'flow');
          // Reddit also uses a separate outer grid for the navigation rail.
          let frame=common.parentElement;
          while(frame&&nav&&!frame.contains(nav)&&frame!==document.body&&frame.localName!=='shreddit-app')frame=frame.parentElement;
          if(nav&&frame&&frame!==document.body&&frame.localName!=='shreddit-app'&&frame.contains(nav)&&!common.contains(nav)){
            let navColumn=nav;while(navColumn.parentElement&&navColumn.parentElement!==frame)navColumn=navColumn.parentElement;
            next.set(frame,'frame');next.set(navColumn,'navigation');
            let column=common;while(column.parentElement&&column.parentElement!==frame)column=column.parentElement;
            if(column!==common){next.set(column,'frame-column');for(let node=common.parentElement;node&&node!==column;node=node.parentElement)next.set(node,'flow');}
          }
        }
      }
    }
    for (const node of this.marked.keys()) if(!next.has(node))node.removeAttribute('data-pureddit-classic-region');
    for (const [node,value] of next) if(node.getAttribute('data-pureddit-classic-region')!==value)node.setAttribute('data-pureddit-classic-region',value);
    this.marked=next;
  }
}

export function classicDiscussionCss(dark: boolean, textSize: 'default'|'large'|'larger' = 'default') {
  const scope='html[data-pureddit-native=old][data-pureddit-native-page=discussion]';
  const background=dark?'#101214':'#fff',border=dark?'#394249':'#b8c8d8',link=dark?'#80a7ff':'#0000ee',header=dark?'#171a1c':'#cee3f8';
  const body=textSize==='larger'?18:textSize==='large'?16:12;
  return `
${scope} [data-pureddit-classic-region],${scope} main{box-sizing:border-box!important;}
${scope} [data-pureddit-classic-region=frame]{display:grid!important;grid-template-columns:170px minmax(0,1fr)!important;grid-template-areas:none!important;gap:14px!important;width:100%!important;max-width:none!important;margin:0!important;padding:12px!important;box-sizing:border-box;}
${scope} [data-pureddit-classic-region=frame]>:is([data-pureddit-classic-region=layout],[data-pureddit-classic-region=layout-with-nav],[data-pureddit-classic-region=frame-column]){grid-area:auto!important;grid-column:2!important;grid-row:1!important;padding:0!important;}
${scope} [data-pureddit-classic-region=layout],${scope} [data-pureddit-classic-region=layout-with-nav]{display:grid!important;grid-template-columns:minmax(0,1fr) 280px!important;grid-template-areas:none!important;gap:16px!important;align-items:start;width:100%!important;max-width:none!important;margin:0!important;padding:12px!important;box-sizing:border-box;}
${scope} [data-pureddit-classic-region=layout-with-nav]{grid-template-columns:170px minmax(0,1fr) 280px!important;}
${scope} [data-pureddit-classic-region=main-column]{grid-area:auto!important;grid-column:1!important;grid-row:1!important;}
${scope} [data-pureddit-classic-region=layout-with-nav]>[data-pureddit-classic-region=main-column]{grid-column:2!important;}
${scope} [data-pureddit-classic-region=layout]>:not([data-pureddit-classic-region=rail],[data-pureddit-classic-region=navigation]){grid-column:1!important;grid-row:auto!important;min-width:0;}
${scope} [data-pureddit-classic-region=layout-with-nav]>:not([data-pureddit-classic-region=rail],[data-pureddit-classic-region=navigation]){grid-column:2!important;grid-row:auto!important;min-width:0;}
${scope} [data-pureddit-classic-region=rail]{grid-area:auto!important;grid-column:2!important;grid-row:1!important;width:100%!important;max-width:280px!important;min-width:0;margin:0!important;border-left:1px solid ${border};padding-left:12px;}
${scope} [data-pureddit-classic-region=layout-with-nav]>[data-pureddit-classic-region=rail]{grid-column:3!important;}
${scope} [data-pureddit-classic-region=navigation]{grid-area:auto!important;grid-column:1!important;grid-row:1!important;max-width:170px!important;min-width:0;}
${scope} :is([data-pureddit-classic-region=main-column],[data-pureddit-classic-region=flow],[data-pureddit-classic-region=frame-column]){display:block!important;min-width:0!important;width:100%!important;max-width:none!important;margin-inline:0!important;padding-inline:0!important;}
${scope} main{min-width:0!important;width:100%!important;max-width:none;margin-inline:0!important;padding:0 4px!important;font:12px/1.5 Verdana,Arial,sans-serif;}
${scope} shreddit-post{display:block;max-width:1100px;margin:0!important;padding:8px 0 12px!important;border:0!important;border-bottom:1px solid ${border}!important;border-radius:0!important;}
${scope} shreddit-post :is(h1,[slot=title]){font:normal 20px/1.3 Arial,sans-serif!important;color:${link}!important;margin:6px 0 10px!important;}
${scope} :is(shreddit-comment-tree,.commentarea){max-width:1100px;margin:12px 0!important;font:${body}px/1.5 Verdana,Arial,sans-serif;}
${scope} shreddit-comment{font:${body}px/1.5 Verdana,Arial,sans-serif!important;border-radius:0!important;padding-block:4px!important;}
${scope} shreddit-comment :is([slot=comment],[slot=comment-body],[slot=commentBody],.md,.text-body-1,.text-body-2){font:${body}px/1.5 Verdana,Arial,sans-serif!important;}
${scope} shreddit-comment p{margin-block:4px!important;}
${scope} shreddit-comment :is([slot=avatar],[slot=commentAvatar],[data-testid=comment-avatar],shreddit-comment-author-avatar){display:none!important;}
${scope} main :is(button,input,textarea,select){font-size:12px;border-radius:2px!important;}
${scope} main :is([slot=actionRow],[slot=action-row],[slot=credit-bar]){font-size:11px!important;gap:6px!important;}
${scope} main :is([slot=actionRow],[slot=action-row]) button{min-height:26px!important;padding:2px 6px!important;background:transparent!important;}
${scope} :is(shreddit-composer,shreddit-comment-composer,[slot=comment-composer]){border-radius:2px!important;}
${scope} :is([data-pureddit-classic-region=rail],[data-pureddit-classic-region=navigation]){font:12px/1.5 Arial,sans-serif;}
${scope} :is([data-pureddit-classic-region=rail],[data-pureddit-classic-region=navigation]) :is(section,details,a,button){border-radius:0!important;}
${scope} [data-pureddit-classic-region=navigation] a{font-size:12px!important;color:${link}!important;}
${scope} [data-pureddit-classic-region=navigation] :is(reddit-sidebar-nav,shreddit-left-nav,left-nav){width:100%!important;max-width:170px!important;}
${scope} :is(reddit-header-large,shreddit-header){background:${header}!important;border-bottom:1px solid ${border};--color-neutral-background:${header}!important;--color-neutral-background-strong:${header}!important;}
@media(max-width:1100px){${scope} [data-pureddit-classic-region=frame]{display:block!important;padding:8px!important;} ${scope} [data-pureddit-classic-region=layout-with-nav],${scope} [data-pureddit-classic-region=layout]{grid-template-columns:minmax(0,1fr) 240px!important;} ${scope} [data-pureddit-classic-region=navigation]{grid-column:1/-1!important;grid-row:auto!important;} ${scope} [data-pureddit-classic-region=layout-with-nav]>[data-pureddit-classic-region=main-column]{grid-column:1!important;grid-row:auto!important;} ${scope} [data-pureddit-classic-region=layout-with-nav]>[data-pureddit-classic-region=rail]{grid-column:2!important;grid-row:auto!important;}}
@media(max-width:760px){${scope} [data-pureddit-classic-region=layout],${scope} [data-pureddit-classic-region=layout-with-nav]{display:block!important;padding:8px!important;} ${scope} [data-pureddit-classic-region=rail]{max-width:none!important;border-left:0;border-top:1px solid ${border};padding:12px 0;margin-top:16px!important;} ${scope} main{padding:0!important;} }
${scope} :is([data-pureddit-classic-region=main-column],[data-pureddit-classic-region=rail]){background:${background};}
`;
}

// Only the actual image/video gets a compact bound. A link preview's wrapper
// must include its image, source description and CTA in normal document flow.
export const classicMediaCss = (scope: string) => `
${scope} shreddit-post :is([slot=post-media-container],[slot=post-media-preview]):not(img):not(video):not(canvas):not(iframe):not(object):not(embed){max-width:min(100%,560px)!important;max-height:none!important;border-radius:0!important;}
${scope} shreddit-post img[slot=post-media-preview]{width:auto;height:auto!important;max-width:min(100%,300px);max-height:300px;object-fit:contain!important;border-radius:0!important;}
`;

export const classicCommentShadowCss = (dark:boolean,textSize: 'default'|'large'|'larger') => {
const body=textSize==='larger'?18:textSize==='large'?16:12;
const header=dark?'#171a1c':'#cee3f8';
return `
:host(shreddit-comment){font:${body}px/1.5 Verdana,Arial,sans-serif!important;}
:host(shreddit-comment) :is([slot=comment],[slot=comment-body],.text-body-1,.text-body-2,.md){font:${body}px/1.5 Verdana,Arial,sans-serif!important;}
:host(shreddit-comment) button{font-size:11px!important;border-radius:2px!important;}
:host(shreddit-comment) [slot=avatar]{display:none!important;}
:host(reddit-header-large),:host(shreddit-header){border-radius:0!important;background:${header}!important;--color-neutral-background:${header}!important;--color-neutral-background-strong:${header}!important;}
:host(shreddit-post) [slot=post-media-container]:not(img):not(video):not(canvas):not(iframe):not(object):not(embed),::slotted([slot=post-media-container]:not(img):not(video):not(canvas):not(iframe):not(object):not(embed)),::slotted([slot=post-media-preview]:not(img):not(video):not(canvas):not(iframe):not(object):not(embed)){max-height:none!important;max-width:min(100%,560px)!important;border-radius:0!important;}
`;
};
