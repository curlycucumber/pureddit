import { postUrl, type Post, type Vote } from '../shared/model';
import { indexVoteRoots, postSelector, voteControls } from '../shared/votes';

// Activate the same public control a click on Reddit would activate. Reddit owns
// authentication, toggling the existing vote, score updates and server errors.
export function nativeVote(post: Post, direction: Vote, roots: Array<Document|ShadowRoot>, beforeClick:()=>void) {
  const card=roots.flatMap(root=>[...root.querySelectorAll(postSelector)]).find(card=>{
    if(card.closest('[hidden]'))return false;
    const href=card.getAttribute('permalink')||card.getAttribute('data-permalink')||card.querySelector('a.comments, a[slot=full-post-link], a[href*="/comments/"]')?.getAttribute('href')||'';
    return postUrl(href)===post.href;
  });
  if(!card)return 'missing';
  const control=voteControls(card,indexVoteRoots(roots).get(card))[direction];
  if(!control)return 'missing';
  if(control.matches(':disabled, [disabled], [aria-disabled=true]'))return 'disabled';
  beforeClick();control.click();return 'clicked';
}
