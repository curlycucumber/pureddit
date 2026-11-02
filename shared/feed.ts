const promotedAttributes = ['promoted', 'is-promoted', 'data-promoted', 'is-ad'];
const marked = (name: string) => `[${name}]:not([${name}="false"]):not([${name}="0"]):not([${name}="null"])`;
export const AD_SELECTOR = ['shreddit-ad-post', 'shreddit-dynamic-ad-link', '.promotedlink', '[data-testid="ad-post"]', ...promotedAttributes.map(marked)].join(',');
function closestMarker(element: Element, selector: string) {
  let current: Element | null = element;
  while (current) {
    if (current.closest(selector)) return true;
    const root = current.getRootNode();
    current = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}
export function isAdvertisement(element: Element) {
  return Boolean(closestMarker(element, AD_SELECTOR) || element.querySelector('[slot="ad-disclosure"]'));
}
export function isRecommendation(element: Element) {
  return Boolean(closestMarker(element, ['is-recommended', 'data-recommended', 'recommendation-reason'].map(marked).join(',')) || element.querySelector('[data-testid="recommendation-reason"]'));
}
