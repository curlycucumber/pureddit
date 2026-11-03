import { communityUrl, type Post } from '../shared/model';
import { formattingTools, renderFormatted } from './formatting';

type Vote = -1 | 0 | 1;
type Comment = { id: string; author: string; text: string; edited?: boolean; score: number; vote: Vote; created: number; collapsed: boolean; replies: Comment[] };
export type DiscussionState = { comments: Comment[]; vote: Vote; saved: boolean; draft: string; postBody?: string; postEdited?: boolean; replyDrafts: Record<string, string>; replyingTo?: string; sort: 'best' | 'new'; nextId: number };
type Actions = { back: () => void; navigate: (url: string) => void };

const bodies: Record<string, string> = {
  design: 'Some of the best design is easy to overlook: a notebook that lies flat, a comfortable handle, a lamp that lights exactly the right spot. These small decisions make everyday things a pleasure to use.\n\nWhat is an ordinary object you appreciate more the longer you own it?',
  technology: 'I have been thinking about the smaller corners of the internet: personal websites, thoughtful forums, and communities where you recognize the people posting.\n\nWhat would you keep if your online life were a little quieter?',
  photography: 'An early start, low clouds, and a few minutes of soft light made the walk worthwhile. Sometimes waiting is the most useful part of taking a photograph.\n\nWhat helps you slow down and notice a scene?',
  programming: 'The tools I return to most often tend to solve one small problem really well. A tiny script can be more useful than a complicated dashboard.\n\nWhat have you built to make your own day a little easier?',
  books: 'The words on the page stay the same, but the reader changes. Revisiting a favorite book years later can feel like reading a conversation from a different point of view.\n\nWhich book surprised you the second time around?',
  space: 'A familiar image can still reveal something new when you take a closer look. The scale, the distance, and the care involved in capturing it are easy to forget.\n\nWhich space photograph has stayed with you?',
  news: 'This illustrative story looks at libraries as places to read, learn practical skills, and meet your neighbors.\n\nWhat has your local library brought to your community?',
};
export function createDiscussionState(): DiscussionState {
  const now = Date.now();
  const comment = (id: string, author: string, text: string, score: number, minutes: number, replies: Comment[] = []): Comment => ({ id, author, text, score, vote: 0, created: now - minutes * 60000, collapsed: false, replies });
  return { vote: 0, saved: false, draft: '', replyDrafts: {}, sort: 'best', nextId: 1, comments: [
    comment('sample-1', 'quiet_observer', 'The things that stay useful for years are usually the ones someone took the time to get right.', 128, 135, [
      comment('sample-1-1', 'small_details', 'Exactly. Noticing those little decisions is part of the fun.', 42, 112),
    ]),
    comment('sample-2', 'curious_by_default', 'I like hearing the stories behind people’s favorites. There is usually more to them than you first expect.', 76, 95, [
      comment('sample-2-1', 'one_more_question', 'Sometimes the story changes how you see something you already know.', 19, 80),
    ]),
    comment('sample-3', 'slow_morning', 'A good reminder to spend a little more time with what is already around us.', 34, 65),
  ] };
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) {
  const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element;
}
function button(text: string, className = 'discussion-button') {
  const element = node('button', className, text); element.type = 'button'; return element;
}
function count(comments: Comment[]): number { return comments.reduce((total, comment) => total + 1 + count(comment.replies), 0); }
export function discussionCount(state: DiscussionState) { return count(state.comments); }
export function mountPostComposer(communities: string[], initial: string, submit: (data: { title: string; body: string; community: string }) => void, cancel: () => void) {
  const element = node('section', 'discussion post-compose');
  element.append(node('h1', 'discussion-title', 'Create a preview post'), node('p', 'discussion-demo', 'Local demo only. Your post stays in this page and resets on reload.'));
  const editor = commentForm('comment', '', () => {}, body => { if (title.value.trim()) submit({ title: title.value.trim(), body, community: community.value }); }, { label: 'Post body', submit: 'Publish preview post' });
  const title = node('input'); title.type = 'text'; title.maxLength = 300; title.required = true; title.setAttribute('aria-label', 'Post title');
  const community = node('select'); community.setAttribute('aria-label', 'Post community');
  for (const name of communities) { const option = node('option', '', `r/${name}`); option.value = name; community.append(option); } community.value = initial;
  const communityLabel = node('label', 'post-field', 'Community'); communityLabel.append(community);
  const titleLabel = node('label', 'post-field', 'Title'); titleLabel.append(title);
  const validate = () => { editor.submit.disabled = !title.value.trim() || !editor.textarea.value.trim(); };
  title.addEventListener('input', validate); editor.textarea.addEventListener('input', validate);
  editor.form.prepend(communityLabel, titleLabel);
  const cancelButton = button('Cancel'); cancelButton.addEventListener('click', cancel); editor.footer.prepend(cancelButton);
  element.append(editor.form); return { element, focus: () => title.focus() };
}

export function mountDiscussion(post: Post, state: DiscussionState, actions: Actions) {
  const section = node('section', 'discussion'); section.setAttribute('aria-label', 'Sample post and comments');
  const back = button('Back to feed', 'discussion-back'); back.setAttribute('aria-label', 'Back to feed'); back.addEventListener('click', actions.back);
  const notice = node('div', 'discussion-demo');
  notice.append(node('strong', '', 'Sample discussion'), node('p', '', 'Try comments, replies, and votes here. Changes stay in this page and reset on reload.'));
  notice.append(node('p', 'native-discussion-note', 'In the installed extension, discussions and account actions use Reddit’s native interface.'));
  const article = node('article', 'discussion-post');
  const meta = node('div', 'discussion-meta');
  const avatar = node('span', 'discussion-avatar', post.community[0].toUpperCase()); avatar.setAttribute('aria-hidden', 'true');
  const community = node('a', '', `r/${post.community}`); community.href = communityUrl(post.community);
  community.addEventListener('click', event => { event.preventDefault(); actions.navigate(community.href); });
  meta.append(avatar, community, node('span', '', `· u/${post.author || 'sample_author'} · sample post`));
  const edited = node('span', 'post-edited', '· edited'); edited.hidden = !state.postEdited; meta.append(edited);
  const title = node('h1', 'discussion-title', post.title); title.tabIndex = -1;
  article.append(meta, title);
  const postBody = node('div', 'discussion-body'); renderFormatted(state.postBody ?? bodies[post.community.toLowerCase()] ?? bodies.design, postBody); article.append(postBody);
  if (post.thumbnail) { const image = node('img', 'discussion-image'); image.src = post.thumbnail; image.alt = `Illustrative ${post.community.toLowerCase()} photograph`; image.addEventListener('error', () => image.remove(), { once: true }); article.append(image); }
  const status = node('p', 'discussion-status'); status.setAttribute('role', 'status'); status.hidden = true;
  const announce = (text: string) => { status.textContent = text; status.hidden = false; };
  if (post.author === 'preview_you') {
    const editPost = button('Edit post', 'discussion-button');
    editPost.addEventListener('click', () => {
      if (article.querySelector('.post-editor')) return;
      const editor = commentForm('comment', state.postBody || '', () => {}, text => {
        state.postBody = text; state.postEdited = true; edited.hidden = false; renderFormatted(text, postBody); editor.form.remove(); postBody.hidden = false; editPost.hidden = false; announce('Post updated in this preview only.');
      }, { label: 'Edit post body', submit: 'Save post changes' });
      editor.form.classList.add('post-editor');
      const cancel = button('Cancel'); cancel.addEventListener('click', () => { editor.form.remove(); postBody.hidden = false; editPost.hidden = false; }); editor.footer.prepend(cancel);
      postBody.hidden = true; editPost.hidden = true; postBody.after(editor.form); editor.textarea.focus();
    }); article.append(editPost);
    article.append(node('p', 'discussion-local-author', 'Your preview post · post titles stay fixed after publishing, as on Reddit.'));
  }
  const postActions = node('div', 'discussion-actions');
  const postScore = Number((post.score || '0').replaceAll(',', '')) || 0;
  postActions.append(voteControls('post', postScore, () => state.vote, value => { state.vote = value; }, announce));
  const commentLink = button('', 'discussion-button'); commentLink.addEventListener('click', () => composer.textarea.focus());
  const saved = button('Save', 'discussion-button'); saved.setAttribute('aria-label', 'Save post');
  const updateSaved = () => { saved.textContent = state.saved ? 'Saved' : 'Save'; saved.setAttribute('aria-pressed', String(state.saved)); };
  saved.addEventListener('click', () => { state.saved = !state.saved; updateSaved(); announce(state.saved ? 'Saved in this preview only.' : 'Removed from your preview saves.'); }); updateSaved();
  const share = button('Copy preview link', 'discussion-button');
  share.addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); announce('Preview link copied. This link opens a sample discussion.'); } catch { announce('Copy the address from your browser to share this sample discussion.'); } });
  postActions.append(commentLink, saved, share); article.append(postActions);

  const commentsSection = node('section', 'discussion-comments'); commentsSection.setAttribute('aria-label', 'Comments');
  const commentsHeader = node('div', 'discussion-comments-header');
  const commentsTitle = node('h2', '', 'Comments');
  const sortLabel = node('label', 'discussion-sort', 'Sort comments');
  const sort = node('select'); sort.setAttribute('aria-label', 'Sort comments');
  for (const [value, label] of [['best', 'Best'], ['new', 'New']]) { const option = node('option', '', label); option.value = value; sort.append(option); } sort.value = state.sort; sortLabel.append(sort);
  sort.addEventListener('change', () => { state.sort = sort.value === 'new' ? 'new' : 'best'; renderComments(); });
  commentsHeader.append(commentsTitle, sortLabel);
  const composer = commentForm('comment', state.draft, text => { state.draft = text; }, text => {
    const added = localComment(text); state.comments.unshift(added); state.draft = ''; composer.textarea.value = ''; composer.submit.disabled = true;
    state.sort = 'new'; sort.value = 'new';
    renderComments(); announce('Comment added to this preview only. Nothing was sent to Reddit.'); revealComment(added.id);
  });
  const tree = node('div', 'comment-tree');
  commentsSection.append(commentsHeader, node('p', 'discussion-local-author', 'Comment as u/preview_you · local demo'), composer.form, status, tree);
  section.append(back, notice, article, commentsSection);

  function localComment(text: string): Comment { return { id: `local-${state.nextId++}`, author: 'preview_you', text, score: 1, vote: 0, created: Date.now(), collapsed: false, replies: [] }; }
  function revealComment(id: string) {
    const added = tree.querySelector<HTMLElement>(`[data-comment-id="${id}"]`);
    if (added) { added.tabIndex = -1; added.focus({ preventScroll: true }); added.scrollIntoView({ block: 'nearest' }); }
  }
  function renderComments() {
    const total = count(state.comments); commentsTitle.textContent = `Comments (${total})`; commentLink.textContent = `${total} comments`;
    tree.replaceChildren();
    const sorted = [...state.comments].sort((a, b) => state.sort === 'new' ? b.created - a.created : (b.score + b.vote) - (a.score + a.vote));
    for (const comment of sorted) tree.append(renderComment(comment, 0));
  }
  function renderComment(comment: Comment, depth: number): HTMLElement {
    const container = node('div', 'discussion-comment'); container.dataset.commentId = comment.id;
    const header = node('div', 'comment-header');
    const collapse = button(comment.collapsed ? '+' : '−', 'collapse-thread');
    collapse.setAttribute('aria-label', comment.collapsed ? 'Expand thread' : 'Collapse thread'); collapse.setAttribute('aria-expanded', String(!comment.collapsed));
    const author = node('span', comment.author === 'preview_you' ? 'comment-author comment-you' : 'comment-author', `u/${comment.author}`);
    header.append(collapse, author, node('span', 'comment-age', (comment.id.startsWith('local-') ? '· just now · local' : '· sample comment') + (comment.edited ? ' · edited' : '')));
    const body = node('div', 'comment-content'); body.hidden = comment.collapsed;
    const text = node('div', 'comment-text'); renderFormatted(comment.text, text); body.append(text);
    const actionsRow = node('div', 'comment-actions');
    actionsRow.append(voteControls('comment', comment.score, () => comment.vote, value => { comment.vote = value; }, announce));
    const reply = button('Reply', 'comment-reply');
    reply.addEventListener('click', () => {
      state.replyingTo = state.replyingTo === comment.id ? undefined : comment.id; renderComments();
      tree.querySelector<HTMLTextAreaElement>('[aria-label="Write a reply"]')?.focus();
    }); actionsRow.append(reply);
    if (comment.author === 'preview_you') {
      const edit = button('Edit comment', 'comment-reply');
      edit.addEventListener('click', () => {
        if (body.querySelector(':scope > .comment-editor')) return;
        const editor = commentForm('comment', comment.text, () => {}, value => { comment.text = value; comment.edited = true; renderComments(); announce('Comment updated in this preview only.'); revealComment(comment.id); }, { label: 'Edit your comment', submit: 'Save comment' });
        editor.form.classList.add('comment-editor'); const cancel = button('Cancel'); cancel.addEventListener('click', () => editor.form.remove()); editor.footer.prepend(cancel); actionsRow.after(editor.form); editor.textarea.focus();
      }); actionsRow.append(edit);
    }
    body.append(actionsRow);
    if (state.replyingTo === comment.id) {
      const editor = commentForm('reply', state.replyDrafts[comment.id] || '', text => { state.replyDrafts[comment.id] = text; }, text => {
        const added = localComment(text); comment.replies.push(added); delete state.replyDrafts[comment.id]; state.replyingTo = undefined;
        renderComments(); announce('Reply added to this preview only. Nothing was sent to Reddit.');
        revealComment(added.id);
      });
      const cancel = button('Cancel', 'discussion-button'); cancel.addEventListener('click', () => { state.replyingTo = undefined; renderComments(); }); editor.footer.prepend(cancel); body.append(editor.form);
    }
    const replies = node('div', depth >= 3 ? 'comment-replies comment-replies-flat' : 'comment-replies');
    for (const child of comment.replies) replies.append(renderComment(child, depth + 1));
    const rail = button('', 'thread-rail'); rail.setAttribute('aria-label', 'Collapse thread using line'); rail.title = 'Collapse thread';
    body.append(rail, replies); container.append(header, body);
    const toggle = () => {
      comment.collapsed = !comment.collapsed; body.hidden = comment.collapsed;
      collapse.textContent = comment.collapsed ? '+' : '−'; collapse.setAttribute('aria-label', comment.collapsed ? 'Expand thread' : 'Collapse thread'); collapse.setAttribute('aria-expanded', String(!comment.collapsed));
      if (comment.collapsed) collapse.focus({ preventScroll: true });
    };
    collapse.addEventListener('click', toggle); rail.addEventListener('click', toggle);
    return container;
  }
  renderComments();
  return { element: section, focusComposer: () => { composer.textarea.focus(); composer.textarea.scrollIntoView({ block: 'center' }); }, focusTitle: () => title.focus({ preventScroll: true }) };
}

function commentForm(kind: 'comment' | 'reply', draft: string, change: (value: string) => void, send: (value: string) => void, labels?: { label: string; submit: string }) {
  const form = node('form', 'discussion-composer');
  const textarea = node('textarea'); textarea.setAttribute('aria-label', labels?.label ?? (kind === 'comment' ? 'Write a comment' : 'Write a reply')); textarea.placeholder = kind === 'comment' ? 'What are your thoughts?' : 'Write a thoughtful reply…'; textarea.rows = kind === 'comment' ? 3 : 2; textarea.maxLength = 10000; textarea.value = draft; textarea.required = true;
  const footer = node('div', 'composer-footer'); const hint = node('span', '', 'Preview only · not posted to Reddit');
  const submit = node('button', 'submit-comment', labels?.submit ?? (kind === 'comment' ? 'Post comment' : 'Post reply')); submit.type = 'submit'; submit.disabled = !draft.trim();
  textarea.addEventListener('input', () => { change(textarea.value); submit.disabled = !textarea.value.trim(); });
  form.addEventListener('submit', event => { event.preventDefault(); const text = textarea.value.trim(); if (text) send(text); });
  const tools = formattingTools(textarea);
  footer.append(hint, submit); form.append(tools.toolbar, textarea, tools.preview, footer); return { form, textarea, footer, submit };
}
function voteControls(kind: 'post' | 'comment', score: number, get: () => Vote, set: (value: Vote) => void, announce: (text: string) => void) {
  const group = node('div', 'discussion-votes'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', kind === 'post' ? 'Post voting demo' : 'Comment voting demo');
  const up = button('↑', 'discussion-vote'), down = button('↓', 'discussion-vote'); up.setAttribute('aria-label', `Upvote ${kind}`); down.setAttribute('aria-label', `Downvote ${kind}`);
  up.dataset.direction = 'up'; down.dataset.direction = 'down';
  const value = node('span', 'discussion-score');
  const update = () => { value.textContent = new Intl.NumberFormat('en').format(score + get()); up.setAttribute('aria-pressed', String(get() === 1)); down.setAttribute('aria-pressed', String(get() === -1)); };
  for (const [button, vote] of [[up, 1], [down, -1]] as const) button.addEventListener('click', () => { set(get() === vote ? 0 : vote); update(); announce('Vote changed in this preview only.'); });
  update(); group.append(up, value, down); return group;
}
