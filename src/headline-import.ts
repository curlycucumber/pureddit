export type ImportedHeadline = { title: string; url?: string; community?: string };
export type HeadlineImport = { headlines: ImportedHeadline[]; method: 'clipboard-links' | 'plain-text' };
export const MAX_PASTE_LENGTH = 200_000;
const MAX_HEADLINES = 200;

const clean = (text: string) => text.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
const noise = /^(?:home|popular|news|all|hot|new|top|best|rising|controversial|share|save|hide|report|reply|award|give award|join|follow|upvote|downvote|vote|log in|sign up|open menu|read more|view more|more replies|promoted|advertisement|image|video|play|pause|search reddit|skip to main content|community highlights|create a post|create post|sort by:?|comments?|discussion|politics|world|business|sports|science|technology|see more|load more|\.{3}|[•·…])$/i;
function plausible(text: string) {
  if (text.length < 8 || text.length > 600 || noise.test(text)) return false;
  if (/^(?:r\/|u\/|https?:\/\/|submitted\b|posted by\b|view (?:all|more)\b|\d[\d.,]*\s*[kmb]?\s*(?:votes?|upvotes?|downvotes?|comments?|points?|replies)?$)/i.test(text)) return false;
  if (/^(?:(?:\d+|a|an)\s*(?:s|m|h|d|sec(?:ond)?s?|min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?|years?)\.?\s*(?:ago)?|\(?[\w.-]+\.(?:com|org|net|gov|edu|io|co)(?:\/[^\s]*)?\)?)$/i.test(text)) return false;
  return /\p{L}/u.test(text) && /\s/u.test(text);
}

export function redditPostLink(value: string): { url: string; community?: string } | null {
  try {
    const url = new URL(value, 'https://www.reddit.com');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com', 'm.reddit.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(?:r\/([A-Za-z0-9_]{2,64})\/)?comments\/([a-z0-9]+)(?:\/|$)/i);
    if (!match) return null;
    return { url: `https://www.reddit.com/${match[1] ? `r/${match[1]}/` : ''}comments/${match[2].toLowerCase()}/`, community: match[1] };
  } catch { return null; }
}

function unique(items: ImportedHeadline[]) {
  const result: ImportedHeadline[] = []; const titles = new Map<string, ImportedHeadline>(); const urls = new Set<string>();
  for (const item of items) {
    const title = clean(item.title);
    if (!plausible(title)) continue;
    const key = title.normalize('NFC').toLocaleLowerCase();
    const existing = titles.get(key);
    if (existing) { if (!existing.url && item.url) Object.assign(existing, item); continue; }
    if (item.url && urls.has(item.url)) continue;
    const entry = { ...item, title }; result.push(entry); titles.set(key, entry);
    if (item.url) urls.add(item.url);
    if (result.length === MAX_HEADLINES) break;
  }
  return result;
}

function plainHeadlines(text: string): ImportedHeadline[] {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const hasCommunityMarkers = lines.some(line => /^r\/[A-Za-z0-9_]{2,64}(?:\s|$)/i.test(line));
  const items: ImportedHeadline[] = [];
  let community: string | undefined; let waitingForTitle = !hasCommunityMarkers;
  for (const raw of lines) {
    const marker = raw.match(/^r\/([A-Za-z0-9_]{2,64})(?:\s|$)/i);
    if (marker) { community = marker[1]; waitingForTitle = true; continue; }
    const markdown = raw.match(/^\[([^\]]+)\]\(([^\s]+)\)$/);
    if (markdown) {
      const link = redditPostLink(markdown[2]);
      if (link && plausible(clean(markdown[1]))) { items.push({ title: clean(markdown[1]), ...link }); waitingForTitle = !hasCommunityMarkers; }
      continue;
    }
    if (/^https?:\/\/\S+$/i.test(raw)) {
      const link = redditPostLink(raw);
      if (link && items.length && !items[items.length - 1].url) Object.assign(items[items.length - 1], link);
      continue;
    }
    if (!waitingForTitle) continue;
    const title = raw.replace(/^\d{1,3}[.)]\s+/, '').replace(/\s+\((?:self\.[\w]+|[\w.-]+\.[a-z]{2,})\)\s*$/i, '');
    const trailingUrl = title.match(/^(.*?)\s+(https?:\/\/\S+)$/i);
    if (trailingUrl) {
      const link = redditPostLink(trailingUrl[2]);
      if (link && plausible(clean(trailingUrl[1]))) { items.push({ title: clean(trailingUrl[1]), ...link }); waitingForTitle = !hasCommunityMarkers; }
      continue;
    }
    if (plausible(title)) { items.push({ title, community }); waitingForTitle = !hasCommunityMarkers; }
  }
  return unique(items);
}

export function extractHeadlines(text: string, clipboardHtml = ''): HeadlineImport {
  if (text.length > MAX_PASTE_LENGTH) throw new Error('Paste fewer than 200,000 characters at a time.');
  if (!text.trim() && !clipboardHtml) throw new Error('Paste some page text or headlines first.');
  if (clipboardHtml && clipboardHtml.length <= 1_000_000 && typeof document !== 'undefined') {
    // Template contents remain inert and are never inserted into the page. No pasted
    // script, image, iframe, or stylesheet is executed or loaded into the live DOM.
    const template = document.createElement('template');
    template.innerHTML = clipboardHtml;
    const anchors = [...template.content.querySelectorAll<HTMLAnchorElement>('a[href]')];
    const candidates = anchors.map(anchor => {
      const link = redditPostLink(anchor.getAttribute('href') || '');
      const heading = anchor.querySelector('h1,h2,h3,[slot="title"]');
      return { link, title: clean(heading?.textContent || anchor.textContent || ''), priority: heading || anchor.getAttribute('slot') === 'title' || anchor.classList.contains('title') ? 0 : 1 };
    }).filter(item => item.link).sort((a, b) => a.priority - b.priority);
    const headlines = unique(candidates.map(item => ({ title: item.title, ...item.link! })));
    if (headlines.length) return { headlines, method: 'clipboard-links' };
  }
  return { headlines: plainHeadlines(text), method: 'plain-text' };
}

export function headlineSearch(title: string) {
  return `https://www.reddit.com/search/?${new URLSearchParams({ q: title })}`;
}
