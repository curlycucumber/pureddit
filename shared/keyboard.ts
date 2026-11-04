export type KeyboardPost = { element: HTMLElement; open: () => void; comments: () => void };

// Candidate collection runs only for an actual shortcut, never on feed mutations.
export function keyboardNavigation(root: Document | ShadowRoot, options: {
  enabled: () => boolean;
  posts: () => KeyboardPost[];
  back: () => boolean;
  blocked?: () => boolean;
}) {
  let selected: HTMLElement | undefined;
  function clear() { selected?.removeAttribute('data-pureddit-selected'); selected = undefined; }
  const listener = (event: Event) => {
    const key = event as KeyboardEvent;
    if (!options.enabled() || key.defaultPrevented || key.isComposing || key.repeat || key.ctrlKey || key.altKey || key.metaKey || key.shiftKey || !['j','k','o','c','Enter','Escape'].includes(key.key)) return;
    if (options.blocked?.()) return;
    if (key.composedPath().some(node => node instanceof Element && node.matches('input, textarea, select, button, [contenteditable]:not([contenteditable=false]), [role=textbox], [role=combobox], [role=listbox], [role=option], [role=button], [role=tab], dialog, [role=dialog], [role=menu], [role=menuitem]'))) return;
    if (key.key === 'Enter' && key.composedPath().some(node => node instanceof HTMLAnchorElement)) return;
    // Native menus can own Escape while focus remains on the document body.
    if ([...root.querySelectorAll('dialog[open], [role=dialog], [role=menu], [role=listbox]')].some(node => node.getClientRects().length > 0)) return;
    if (key.key === 'Escape') { if (options.back()) key.preventDefault(); clear(); return; }
    const posts = options.posts().filter(post => post.element.isConnected && post.element.getClientRects().length > 0 && !post.element.closest('[hidden], [inert]'));
    if (!posts.length) { clear(); return; }
    let index = posts.findIndex(post => post.element === selected);
    if (key.key === 'j' || key.key === 'k') {
      if (index < 0) {
        const visible = posts.findIndex(post => post.element.getBoundingClientRect().bottom > 100);
        const first = visible < 0 ? 0 : visible;
        index = first + (key.key === 'j' ? -1 : 1);
      }
      index = Math.max(0,Math.min(posts.length - 1,index + (key.key === 'j' ? 1 : -1)));
      clear(); selected = posts[index].element; selected.setAttribute('data-pureddit-selected','');
      selected.scrollIntoView({ block:'center', behavior:'auto' }); key.preventDefault();
    } else if (index >= 0) { key.preventDefault(); (key.key === 'c' ? posts[index].comments : posts[index].open)(); }
  };
  root.addEventListener('keydown',listener);
  return { clear, destroy() { clear(); root.removeEventListener('keydown',listener); } };
}
