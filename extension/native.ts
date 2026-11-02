import type { HomeFeed, HomeMode, NativeAction } from '../shared/model';

// Read only public, open DOM/shadow roots. Never inspect page globals or sessions.
export function nativeRoots(root: Document | ShadowRoot = document): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [root];
  for (const element of root.querySelectorAll('*')) {
    if (element.id === 'pureddit-extension-root' || element.id === 'pureddit-return-toggle') continue;
    if (element.shadowRoot) roots.push(...nativeRoots(element.shadowRoot));
  }
  return roots;
}
function visible(element: HTMLElement) {
  return !element.hidden && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' && Boolean(element.getClientRects().length);
}
function label(element: Element) {
  return (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim();
}
function selected(element: Element) {
  return element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-pressed') === 'true' || ['page', 'true'].includes(element.getAttribute('aria-current') || '') || element.getAttribute('data-state') === 'active' || element.hasAttribute('selected');
}
function feedControl(mode: HomeMode, roots: Array<Document | ShadowRoot>) {
  const pattern = mode === 'following' ? /^following$/i : /^(for\s*you|suggested)$/i;
  const eligible = (element: HTMLElement) => {
    let ancestor: Element | null = element;
    while (ancestor) {
      if (ancestor.closest('shreddit-post, .thing.link, article, [data-testid="post-container"]')) return false;
      const owner = ancestor.getRootNode(); ancestor = owner instanceof ShadowRoot ? owner.host : null;
    }
    return pattern.test(label(element)) && visible(element);
  };
  // Feed tabs take priority across roots. A post's "Following" membership button
  // must never be mistaken for the Home feed selector.
  for (const root of roots) {
    const tab = [...root.querySelectorAll<HTMLElement>('[role="tab"]')].find(eligible);
    if (tab) return tab;
  }
  for (const root of roots) {
    const selector = root instanceof ShadowRoot && root.host.closest('nav, header, [role="tablist"]') ? '[role="tab"], button, a' : '[role="tab"], [role="tablist"] button, [role="tablist"] a, nav button, nav a, header button, header a';
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      if (eligible(element)) return element;
    }
  }
}
export class HomeFeedController {
  private attempted = '';
  private started = 0;
  reset() { this.attempted = ''; }
  select(mode: HomeMode, beforeClick: () => void, roots = nativeRoots()): HomeFeed {
    const control = feedControl(mode, roots);
    if (control && selected(control)) return { mode, status: 'ready' };
    if (!control) return { mode, status: 'unavailable', message: `Reddit's ${mode === 'following' ? 'Following' : 'For You'} tab is not available on this page yet. Open Reddit's feed controls and sign in if needed.` };
    const key = `${location.href}:${mode}`;
    if (this.attempted !== key) {
      this.attempted = key; this.started = Date.now();
      beforeClick(); control.click();
      if (selected(control)) return { mode, status: 'ready' };
    }
    if (Date.now() - this.started < 3000) return { mode, status: 'switching', message: `Switching Reddit to ${mode === 'following' ? 'Following' : 'For You'}…` };
    return { mode, status: 'unavailable', message: 'Reddit did not confirm the requested feed. No Home posts are shown until the native tab is selected. Use Reddit’s feed controls, then return to Pureddit.' };
  }
}

export function nativeControl(action: NativeAction): HTMLElement | undefined {
  const selectors: Record<NativeAction, string> = {
    create: 'a[href="/submit"], a[href$="/submit/"], button[aria-label*="create post" i]',
    notifications: '#notifications-button, a[href="/notifications"], a[href="/notifications/"], button[aria-label*="notification" i]',
    account: '#expand-user-drawer-button, button[aria-label="Open user menu"], button[aria-label="User menu"], button[aria-label="Open account menu"]',
    navigation: '#navbar-menu-button, button[aria-label="Open navigation"], button[aria-label="Open navigation menu"]',
  };
  const names: Record<NativeAction, RegExp> = {
    create: /^(create|create post|new post)$/i,
    notifications: /^(notifications|open notifications|open notifications inbox)$/i,
    account: /^(open )?(user|account|profile) menu$/i,
    navigation: /^(open )?navigation( menu)?$/i,
  };
  for (const root of nativeRoots()) {
    const explicit = [...root.querySelectorAll<HTMLElement>(selectors[action])].find(visible);
    if (explicit) return explicit;
    const named = [...root.querySelectorAll<HTMLElement>('button, a, [role="button"]')].find(element => visible(element) && names[action].test(label(element)));
    if (named) return named;
  }
}
