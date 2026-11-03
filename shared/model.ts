export type Appearance = 'modern' | 'old';
export type ColorScheme = 'light' | 'dark';
export type HomeMode = 'following' | 'for-you';
export type NativeAction = 'create' | 'notifications' | 'account' | 'navigation';
export type HomeFeed = { mode: HomeMode; status: 'ready' | 'switching' | 'unavailable'; message?: string };
export const NEWS_URL = 'https://www.reddit.com/news';
export const HOME_URL = 'https://www.reddit.com/';
export type Preferences = { version: 1; enabled: boolean; appearance: Appearance; colorScheme: ColorScheme; pins: string[]; recent: string[] };
export type Page = { kind: 'home' | 'popular' | 'news' | 'community'; title: string; community?: string; sort: 'new' | 'hot' | 'top' | 'best' };
export type Post = { id: string; title: string; community: string; author?: string; score?: string; comments?: string; mediaKind?: 'image' | 'video'; thumbnail?: string; communityIcon?: string; createdAt?: string; externalUrl?: string; href: string };
export const VERSION = '0.3.13';
export const DEFAULTS: Preferences = { version: 1, enabled: true, appearance: 'modern', colorScheme: 'light', pins: [], recent: [] };
export const COMMUNITY = /^[A-Za-z0-9_]{2,21}$/;

export function normalizePreferences(value: unknown): Preferences {
  const object = value && typeof value === 'object' ? value as Partial<Preferences> : {};
  const names = (input: unknown, limit: number) => {
    const result: string[] = [];
    if (Array.isArray(input)) for (const item of input) {
      if (typeof item === 'string' && COMMUNITY.test(item) && !result.some(name => name.toLowerCase() === item.toLowerCase())) result.push(item);
      if (result.length === limit) break;
    }
    return result;
  };
  return { version: 1, enabled: object.enabled !== false, appearance: object.appearance === 'old' ? 'old' : 'modern', colorScheme: object.colorScheme === 'dark' ? 'dark' : 'light', pins: names(object.pins, 50), recent: names(object.recent, 5) };
}
export function visit(preferences: Preferences, name: string): Preferences {
  if (!COMMUNITY.test(name) || /^(popular|all)$/i.test(name)) return preferences;
  return { ...preferences, recent: [name, ...preferences.recent.filter(item => item.toLowerCase() !== name.toLowerCase())].slice(0, 5) };
}
export function pageFromUrl(input: string): Page | null {
  let url: URL; try { url = new URL(input); } catch { return null; }
  if (!['www.reddit.com', 'reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(url.hostname) || url.protocol !== 'https:') return null;
  if (/^\/news\/?$/.test(url.pathname)) return {kind:'news',title:'News',sort:'hot'};
  const home = url.pathname.match(/^\/(new|hot|top|best)?\/?$/);
  if (home) return { kind: 'home', title: 'Home', sort: (home[1] || 'best') as Page['sort'] };
  const match = url.pathname.match(/^\/r\/([A-Za-z0-9_]{2,21})(?:\/(new|hot|top|best))?\/?$/);
  if (!match) return null;
  const name = match[1], sort = (match[2] || 'hot') as Page['sort'];
  return { kind: name.toLowerCase() === 'popular' ? 'popular' : 'community', title: name.toLowerCase() === 'popular' ? 'Popular' : `r/${name}`, community: name, sort };
}
export function communityUrl(name: string) { return `https://www.reddit.com/r/${encodeURIComponent(name)}/`; }
export function sortUrl(page: Page, sort: string) { if (page.kind === 'news') return NEWS_URL; return `https://www.reddit.com/${page.kind === 'home' ? '' : `r/${page.community}/`}${sort}/`; }
export function postUrl(value: string): string | undefined {
  try {
    const url = new URL(value, 'https://www.reddit.com');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !['www.reddit.com', 'reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(url.hostname)) return;
    if (!/^\/(?:r\/[A-Za-z0-9_]{2,21}\/)?comments\/[a-z0-9]+(?:\/|$)/i.test(url.pathname)) return;
    return `https://www.reddit.com${url.pathname}`;
  } catch { return; }
}
export function externalUrl(value: string | null | undefined): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    if (['www.reddit.com', 'reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(url.hostname)) return;
    return url.href;
  } catch { return; }
}
