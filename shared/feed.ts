const promotedAttributes = ['promoted', 'is-promoted', 'data-promoted', 'is-ad'];
const marked = (name: string) => `[${name}]:not([${name}="false"]):not([${name}="0"]):not([${name}="null"])`;
export const AD_SELECTOR = ['shreddit-ad-post', 'shreddit-ad', 'shreddit-display-ad', 'shreddit-dynamic-ad-link', '.promotedlink', '[data-testid="ad-post"]', '[data-ad-click-location]', '[data-ad-click-action]', 'a[aria-label^="Advertisement:" i]', 'a[href^="https://alb.reddit.com/cr?"]', ...promotedAttributes.map(marked)].join(',');
function closestMarker(element: Element, selector: string) {
  let current: Element | null = element;
  while (current) {
    if (current.closest(selector)) return true;
    const root = current.getRootNode();
    current = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}
const disclosure = '[slot="ad-disclosure"], [data-testid="ad-label"], [data-testid="ad-disclosure"], [data-testid="promoted-label"], [aria-label="Advertisement" i]';
const metadata = 'header, [slot="credit-bar"], [slot="post-meta"], [data-testid="post-meta"], .post-meta';
const content = '[slot="title"], [slot="text-body"], [slot="post-body"], .md, h1, h2, h3';
const identity = 'a[href*="/user/"], a[href*="/u/"], a[href*="/r/"], .author, .subreddit';
function metaLabel(element: Element) {
  if (!/^(ad|promoted|sponsored)$/i.test((element.textContent || '').trim())) return false;
  return !element.closest(`${content}, ${identity}`) && !element.querySelector(`${content}, ${identity}`);
}
function disclosureNodes(root: ParentNode) {
  const nodes = [...root.querySelectorAll(disclosure)];
  for (const header of root.querySelectorAll(metadata)) {
    if (metaLabel(header)) nodes.push(header);
    for (const label of header.querySelectorAll('span, a, faceplate-tracker')) if (metaLabel(label)) nodes.push(label);
  }
  return nodes;
}
export function isAdDisclosureMutation(element: Element) {
  let current: Element | null = element;
  while (current) {
    if (current.closest(metadata) || current.closest(disclosure)) return true;
    const root = current.getRootNode(); current = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}
function adOwner(element: Element) {
  let current: Element | null = element;
  let fallback: Element | null = null;
  while (current) {
    const card = current.closest('shreddit-post, .thing.link, [data-testid="post-container"]');
    if (card) return card;
    fallback ||= current.closest('shreddit-ad-post, shreddit-ad, shreddit-display-ad, [data-testid="ad-post"], article');
    const root = current.getRootNode(); current = root instanceof ShadowRoot ? root.host : null;
  }
  // Never mistake an entire multi-post feed wrapper for a single ad card.
  return fallback && fallback.querySelectorAll('shreddit-post, .thing.link').length <= 1 ? fallback : null;
}
export function advertisementCards(roots: Array<Document | ShadowRoot>) {
  const cards = new Set<Element>();
  for (const root of roots) for (const marker of [...root.querySelectorAll(AD_SELECTOR), ...disclosureNodes(root)]) {
    const card = adOwner(marker); if (card) cards.add(card);
  }
  return cards;
}
export function isAdvertisement(element: Element) {
  return Boolean(closestMarker(element, AD_SELECTOR) || element.querySelector(`${AD_SELECTOR}, ${disclosure}`) || disclosureNodes(element).length || element.shadowRoot && (element.shadowRoot.querySelector(`${AD_SELECTOR}, ${disclosure}`) || disclosureNodes(element.shadowRoot).length));
}
export function isRecommendation(element: Element) {
  return Boolean(closestMarker(element, ['is-recommended', 'data-recommended', 'recommendation-reason'].map(marked).join(',')) || element.querySelector('[data-testid="recommendation-reason"]'));
}
