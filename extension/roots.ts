// Discover native open roots once, then inspect only added subtrees and known
// shadow-capable hosts. Attaching a shadow root itself emits no DOM mutation.
const own = '#pureddit-extension-root, #pureddit-native-controls, #pureddit-return-toggle';
const capable = new Set(['ARTICLE','ASIDE','BLOCKQUOTE','BODY','DIV','FOOTER','H1','H2','H3','H4','H5','H6','HEADER','MAIN','NAV','P','SECTION','SPAN']);
export class RootRegistry {
  private roots = new Set<Document | ShadowRoot>([document]);
  private hosts = new Set<Element>();
  private pending = new Set<Element>();
  constructor() { this.add(document.documentElement); }
  add(element: Element) {
    if (element.closest(own)) return;
    this.inspect(element);
    for (const child of element.querySelectorAll('*')) if (!child.closest(own)) this.inspect(child);
  }
  addAll(elements: Iterable<Element>) {
    const added = new Set([...elements].filter(node => node.isConnected));
    for (const element of added) {
      let ancestor: Element | null = element.parentElement;
      const owner = element.getRootNode();
      if (!ancestor && owner instanceof ShadowRoot) ancestor = owner.host;
      while (ancestor && !added.has(ancestor)) {
        const root = ancestor.getRootNode();
        ancestor = ancestor.parentElement || (root instanceof ShadowRoot ? root.host : null);
      }
      if (!ancestor) this.add(element);
    }
  }
  private inspect(element: Element) {
    if ((capable.has(element.tagName) || element.localName.includes('-')) && !this.hosts.has(element)) { this.hosts.add(element); this.pending.add(element); }
    const root=element.shadowRoot;
    if (root && !this.roots.has(root)) {
      this.roots.add(root);
      for (const child of root.querySelectorAll('*')) if (!child.closest(own)) this.inspect(child);
    }
  }
  snapshot(probe = true) {
    for (const host of probe ? this.hosts : this.pending) { if (!host.isConnected) this.hosts.delete(host); else if (host.shadowRoot && !this.roots.has(host.shadowRoot)) this.inspect(host); }
    this.pending.clear();
    for (const root of this.roots) if (root instanceof ShadowRoot && !root.host.isConnected) this.roots.delete(root);
    return [...this.roots];
  }
}
