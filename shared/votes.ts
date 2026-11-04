import type { Vote } from './model';

export const postSelector = 'shreddit-post, .thing.link';
const content = 'shreddit-comment, .comment, [slot=text-body], [slot=post-body], .md, form, [contenteditable]';
export function voteOwner(element: Element): Element | null {
  let node: Element | null = element;
  while(node){
    if(node.closest(content))return null;
    const card=node.closest(postSelector);if(card)return card;
    const root=node.getRootNode();node=root instanceof ShadowRoot?root.host:null;
  }
  return null;
}
export function indexVoteRoots(roots: Array<Document | ShadowRoot>) {
  const index=new Map<Element,ParentNode[]>();
  for(const root of roots)if(root instanceof ShadowRoot){const owner=voteOwner(root.host);if(owner){const values=index.get(owner)||[];values.push(root);index.set(owner,values);}}
  return index;
}
export function voteControls(card: Element, roots: ParentNode[] = []) {
  const controls: Partial<Record<'up'|'down',HTMLElement>>={};
  for(const root of [card,...roots])for(const control of root.querySelectorAll<HTMLElement>('button, [role=button], .arrow')){
    if(voteOwner(control)!==card)continue;
    const label=(control.getAttribute('aria-label')||'').toLowerCase();
    const test=control.getAttribute('data-testid')||control.getAttribute('slot')||'';
    const glyph=control.querySelector('svg[icon-name]')?.getAttribute('icon-name')||'';
    const up=control.matches('.arrow.up, .arrow.upmod')||/^(?:upvote\b|(?:remove|undo|cancel)\b.*upvote)/.test(label)||/^(?:upvote|upvote-button)$/.test(test)||/^upvote(?:-|$)/.test(glyph);
    const down=control.matches('.arrow.down, .arrow.downmod')||/^(?:downvote\b|(?:remove|undo|cancel)\b.*downvote)/.test(label)||/^(?:downvote|downvote-button)$/.test(test)||/^downvote(?:-|$)/.test(glyph);
    if(up&&!controls.up)controls.up=control;if(down&&!controls.down)controls.down=control;
  }
  return controls;
}
export function readVote(card: Element, roots: ParentNode[] = []): Vote | undefined {
  const state=(card.getAttribute('vote-state')||'').toLowerCase();
  if(['up','upvote','upvoted','1'].includes(state)||card.classList.contains('likes'))return 'up';
  if(['down','downvote','downvoted','-1'].includes(state)||card.classList.contains('dislikes'))return 'down';
  if(['none','neutral','0'].includes(state))return;
  const controls=voteControls(card,roots);
  if(controls.up?.getAttribute('aria-pressed')==='true'||controls.up?.classList.contains('upmod'))return 'up';
  if(controls.down?.getAttribute('aria-pressed')==='true'||controls.down?.classList.contains('downmod'))return 'down';
}
