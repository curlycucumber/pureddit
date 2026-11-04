import { matchesTitle, type Distractions, type ReadingPreferences } from '../shared/model';

const sidebars = 'aside, nav, #left-sidebar-container, #right-sidebar-container, left-nav, reddit-sidebar-nav, shreddit-left-nav, [data-testid="left-sidebar"], [data-testid="right-sidebar"]';
const content = 'shreddit-post, shreddit-comment, .thing, .comment, form, [contenteditable], [data-testid="subreddit-rules"], [data-testid="joined-communities"], shreddit-subreddit-rules';
function inSidebar(element: Element) {
  let node: Element | null = element;
  while (node) {
    if (node.closest(content)) return false;
    if (node.closest(sidebars)) return true;
    const root = node.getRootNode(); node = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}

export class DistractionFilter {
  private hidden = new Set<Element>();
  clear() { for (const node of this.hidden) node.removeAttribute('data-pureddit-distraction'); this.hidden.clear(); }
  apply(roots: Array<Document | ShadowRoot>, preferences: Distractions) {
    if (!Object.values(preferences).some(Boolean)) { this.clear(); return; }
    const next = new Set<Element>();
    const selectors: Array<[keyof Distractions,string]> = [
      ['games','[data-testid="games-section"], #games-section, left-nav-games-section'],
      ['recentPosts','[data-testid="recent-posts"], #recent-posts, shreddit-recent-posts, reddit-recent-posts'],
      ['recommended','[data-testid="recommended-communities"], [data-testid="popular-communities"], shreddit-recommended-communities, reddit-recommended-communities'],
    ];
    for (const root of roots) {
      for (const [key,selector] of selectors) if (preferences[key]) for (const node of root.querySelectorAll(selector)) if (inSidebar(node)) next.add(node);
      if (preferences.explore) for (const node of root.querySelectorAll<HTMLAnchorElement>('a[href*="/explore"]')) {
        try { if (/^\/explore\/?$/.test(new URL(node.href).pathname) && inSidebar(node)) next.add(node); } catch { /* Ignore malformed links. */ }
      }
      // Only sidebar section headings are considered, never post or comment text.
      for (const heading of root.querySelectorAll('h2, h3, h4, [role=heading], summary, [slot=header]')) {
        if (!inSidebar(heading)) continue;
        const label = (heading.textContent || '').trim().toLowerCase();
        const key = /^(games|games on reddit)$/.test(label) ? 'games' : label === 'recent posts' ? 'recentPosts' : /^(popular communities|recommended communities|communities you might like)$/.test(label) ? 'recommended' : undefined;
        if (key && preferences[key]) {
          const panel = heading.closest('section, details, left-nav-section');
          if (panel && !panel.querySelector('shreddit-post, shreddit-comment, [data-testid="subreddit-rules"], [data-testid="joined-communities"]')) next.add(panel);
        }
      }
    }
    for (const node of this.hidden) if (!next.has(node)) node.removeAttribute('data-pureddit-distraction');
    for (const node of next) if (!node.hasAttribute('data-pureddit-distraction')) node.setAttribute('data-pureddit-distraction','');
    this.hidden = next;
  }
}

export function distractionMutation(element: Element) {
  return inSidebar(element) && Boolean(element.closest('h2, h3, h4, [role=heading], summary, [slot=header]'));
}

export class TitleFilter {
  private hidden = new Set<Element>();
  private context = ''; revealed = false;
  clear() { for (const node of this.hidden) node.removeAttribute('data-pureddit-title-filter'); this.hidden.clear(); }
  reset() { this.clear(); this.context = ''; this.revealed = false; }
  toggle() { this.revealed = !this.revealed; }
  apply(cards: Element[], phrases: string[], context: string) {
    const key = JSON.stringify([context,phrases]); if (key !== this.context) { this.context = key; this.revealed = false; }
    const matching = phrases.length ? cards.filter(card => matchesTitle(card.getAttribute('post-title') || card.querySelector('[slot=title], a.title, h1, h2, h3')?.textContent || '', phrases)) : [];
    const next = new Set(this.revealed ? [] : matching);
    for (const node of this.hidden) if (!next.has(node)) node.removeAttribute('data-pureddit-title-filter');
    for (const node of next) if (!node.hasAttribute('data-pureddit-title-filter')) node.setAttribute('data-pureddit-title-filter','');
    this.hidden = next; return matching.length;
  }
}

export function titleMutation(element: Element) {
  let node: Element | null = element;
  while (node) {
    if (node.closest('[slot=title], a.title, h1, h2, h3')) return true;
    const root = node.getRootNode(); node = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}

export function nativeReadingCss(scope: string, preferences: ReadingPreferences) {
  const prefix = scope ? `${scope} ` : '';
  let css = '';
  if (preferences.contentWidth !== 'automatic') {
    const width = preferences.contentWidth === 'focused' ? 720 : 1100;
    css += `${prefix}main,${prefix}shreddit-post,${prefix}shreddit-comment-tree,${prefix}.commentarea{width:100%;max-width:${width}px!important;margin-inline:auto;min-width:0;}`;
  }
  if (preferences.textSize !== 'default') {
    const title = preferences.textSize === 'large' ? 24 : 28, body = preferences.textSize === 'large' ? 16 : 18;
    css += `${prefix}shreddit-post [slot=title],${prefix}shreddit-post h1,${prefix}shreddit-post h2,${prefix}.thing a.title{font-size:${title}px!important;line-height:1.4!important;}`;
    css += `${prefix}[slot=comment-body],${prefix}.comment .md,${prefix}.usertext-body .md{font-size:${body}px!important;line-height:1.6!important;}`;
    if (!scope) css += `::slotted([slot=title]){font-size:${title}px!important;}::slotted([slot=comment-body]){font-size:${body}px!important;}`;
  }
  if (preferences.density === 'compact') css += `${prefix}shreddit-post{padding-block:8px!important;}${prefix}shreddit-comment,${prefix}.comment .entry{padding-block:2px!important;}`;
  return css;
}
