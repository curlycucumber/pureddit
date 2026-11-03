// Discover native open roots once, then inspect only added subtrees and known
// shadow-capable hosts. Attaching a shadow root itself emits no DOM mutation.
const own = '#pureddit-extension-root, #pureddit-native-controls, #pureddit-return-toggle';
const capable = new Set(['ARTICLE','ASIDE','BLOCKQUOTE','BODY','DIV','FOOTER','H1','H2','H3','H4','H5','H6','HEADER','MAIN','NAV','P','SECTION','SPAN']);
export class RootRegistry {
  private roots = new Set<Document | ShadowRoot>([document]);
  private hosts = new Set<Element>();
  constructor() { this.add(document.documentElement); }
  add(element: Element) {
    if (element.closest(own)) return;
    this.inspect(element);
    for (const child of element.querySelectorAll('*')) if (!child.closest(own)) this.inspect(child);
  }
  private inspect(element: Element) {
    if (capable.has(element.tagName) || element.localName.includes('-')) this.hosts.add(element);
    const root=element.shadowRoot;
    if (root && !this.roots.has(root)) {
      this.roots.add(root);
      for (const child of root.querySelectorAll('*')) if (!child.closest(own)) this.inspect(child);
    }
  }
  snapshot() {
    for (const host of this.hosts) { if (!host.isConnected) this.hosts.delete(host); else if (host.shadowRoot && !this.roots.has(host.shadowRoot)) this.inspect(host); }
    for (const root of this.roots) if (root instanceof ShadowRoot && !root.host.isConnected) this.roots.delete(root);
    return [...this.roots];
  }
}
