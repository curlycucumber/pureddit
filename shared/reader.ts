import { communityUrl, COMMUNITY, sortUrl, VERSION, type Appearance, type Page, type Post, type Preferences } from './model';
import type { Extraction } from './extract';

export type ReaderModel = Extraction & { page: Page; preferences: Preferences; preview: boolean };
export type ReaderActions = { original: () => void; navigate: (url: string) => void; pin: (name: string) => void; unpin: (name: string) => void; appearance: (value: Appearance) => void; preview?: boolean };
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string) {
  const node = document.createElement(tag); node.className = className; if (content !== undefined) node.textContent = content; return node;
}
function anchor(label: string, href: string, actions: ReaderActions, className = '') {
  const node = element('a', className, label); node.href = href;
  node.addEventListener('click', event => { if (actions.preview || (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0)) { event.preventDefault(); actions.navigate(href); } });
  return node;
}
export function mountReader(root: ShadowRoot, css: string, actions: ReaderActions) {
  const style = element('style', '', css);
  const reader = element('div', 'reader');
  // Static markup only. All page-derived strings below are assigned with textContent.
  reader.innerHTML = `
    <a class="skip" href="#feed">Skip to posts</a>
    <header class="topbar">
      <a class="brand" href="https://www.reddit.com/new/" aria-label="pureddit home"><span class="mark">p</span><span>pure<span class="light">ddit</span><b>.</b></span></a>
      <span class="tagline">Reddit, simplified.</span>
      <button class="community-toggle" type="button" aria-expanded="false">Communities</button>
      <button class="original" type="button">Show Reddit ↗</button>
    </header>
    <div class="classic-navigation"></div>
    <div class="layout">
      <aside class="sidebar" aria-label="Navigation">
        <nav class="primary" aria-label="Feeds"></nav>
        <section class="recent-section"><h2>Recently visited</h2><div class="recent"></div></section>
        <section class="shortcuts-section">
          <h2>Community shortcuts</h2><div class="pins"></div>
          <form class="pin-form"><label for="community">Add a shortcut</label><div><input id="community" placeholder="Community name" maxlength="21" autocomplete="off" required pattern="[A-Za-z0-9_]{2,21}"><button type="submit" aria-label="Add community shortcut">+</button></div></form>
          <p class="shortcut-note">Shortcuts are local to Pureddit. Manage Reddit subscriptions in the original view.</p>
        </section>
        <p class="version"></p>
      </aside>
      <main id="feed" tabindex="-1">
        <div class="heading"><div><p class="source-label"></p><h1></h1></div><span class="post-count"></span></div>
        <p class="description"></p>
        <div class="toolbar">
          <nav class="sorts" aria-label="Sort posts"></nav>
          <select class="appearance-control" aria-label="Reading layout"><option value="modern">Modern Reddit</option><option value="old">Old Reddit</option></select>
          <span class="source-status"></span>
        </div>
        <div class="posts"></div>
        <p class="reading-note">Showing posts Reddit has loaded on this page. Use the original view to load more or manage your account.</p>
        <div class="notice" role="status" hidden></div>
      </main>
    </div>`;
  root.replaceChildren(style, reader);
  const find = <T extends Element = HTMLElement>(selector: string) => reader.querySelector<T>(selector)!;
  find('.version').textContent = `pureddit ${VERSION}`;
  find('.original').addEventListener('click', actions.original);
  find<HTMLSelectElement>('.appearance-control').addEventListener('change', event => {
    actions.appearance((event.target as HTMLSelectElement).value === 'old' ? 'old' : 'modern');
  });
  find('.community-toggle').addEventListener('click', event => { const button = event.currentTarget as HTMLButtonElement; const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); reader.dataset.communities = open ? 'open' : ''; });
  find('.brand').addEventListener('click', event => { event.preventDefault(); actions.navigate('https://www.reddit.com/new/'); });
  find('.skip').addEventListener('click', event => { event.preventDefault(); find<HTMLElement>('#feed').focus(); });
  find<HTMLFormElement>('.pin-form').addEventListener('submit', event => {
    event.preventDefault(); const input = find<HTMLInputElement>('#community'); const name = input.value.trim().replace(/^r\//, '');
    if (COMMUNITY.test(name)) { actions.pin(name); input.value = ''; }
  });
  reader.addEventListener('click', event => {
    reader.querySelectorAll<HTMLDetailsElement>('.post-menu[open]').forEach(menu => {
      if (!event.composedPath().includes(menu)) menu.open = false;
    });
  });
  const message = (text: string) => { const notice = find<HTMLElement>('.notice'); notice.textContent = text; notice.hidden = !text; };
  let lastPosts = '';
  return {
    update(model: ReaderModel) {
      const { page, preferences, posts } = model;
      reader.dataset.appearance = preferences.appearance;
      reader.dataset.preview = String(model.preview);
      find<HTMLSelectElement>('.appearance-control').value = preferences.appearance;
      const primary = find('.primary'), sorts = find('.sorts');
      const feedLocation = find(preferences.appearance === 'old' ? '.classic-navigation' : '.sidebar');
      const sortLocation = find(preferences.appearance === 'old' ? '.classic-navigation' : '.toolbar');
      if (primary.parentElement !== feedLocation) feedLocation.prepend(primary);
      if (sorts.parentElement !== sortLocation) {
        if (preferences.appearance === 'old') sortLocation.append(sorts);
        else sortLocation.prepend(sorts);
      }
      find('h1').textContent = page.title;
      find('.source-label').textContent = model.preview ? 'EXTENSION DESIGN PREVIEW' : 'YOUR REDDIT PAGE';
      find('.description').textContent = page.kind === 'home' ? 'Posts from the Home page you opened. Use New for chronological browsing.' : `Posts from ${page.community ? `r/${page.community}` : 'Reddit'}.`;
      find('.post-count').textContent = `${posts.length} posts`;
      find('.source-status').textContent = model.preview ? `${model.layout} · sample page` : `${model.layout === 'unsupported' ? 'Waiting for' : 'Reading'} Reddit`;
      find('.reading-note').textContent = model.preview ? 'Sample content for checking the shared extension layout. No live Reddit access is made from this preview.' : `Showing posts Reddit has loaded on this page.${model.filtered ? ` ${model.filtered} promoted or marked recommendation cards omitted.` : ''} Use Show Reddit to load more or use native account actions.`;
      primary.replaceChildren();
      for (const [label, href, kind] of [['Home', 'https://www.reddit.com/new/', 'home'], ['Popular', 'https://www.reddit.com/r/popular/', 'popular'], ['News', 'https://www.reddit.com/r/news/', 'news']]) {
        const link = anchor(label, href, actions, page.kind === kind ? 'active' : ''); if (page.kind === kind) link.setAttribute('aria-current', 'page'); primary.append(link);
      }
      const recent = find('.recent'); recent.replaceChildren();
      find<HTMLElement>('.recent-section').hidden = !preferences.recent.length;
      preferences.recent.forEach(name => recent.append(anchor(`r/${name}`, communityUrl(name), actions, 'community-link')));
      const pins = find('.pins'); pins.replaceChildren();
      for (const name of preferences.pins) {
        const row = element('div', 'pin-row'); const remove = element('button', 'remove-pin', '×'); remove.setAttribute('aria-label', `Remove r/${name} shortcut`); remove.addEventListener('click', () => actions.unpin(name));
        row.append(anchor(`r/${name}`, communityUrl(name), actions, 'community-link'), remove); pins.append(row);
      }
      find<HTMLInputElement>('#community').disabled = preferences.pins.length >= 50;
      sorts.replaceChildren();
      for (const sort of ['new', 'hot', 'top']) {
        const link = anchor(sort[0].toUpperCase() + sort.slice(1), sortUrl(page, sort), actions, page.sort === sort ? 'selected' : ''); if (page.sort === sort) link.setAttribute('aria-current', 'true'); sorts.append(link);
      }
      const signature = JSON.stringify(posts);
      if (lastPosts !== signature) {
        lastPosts = signature;
        const list = find('.posts'); list.replaceChildren();
        posts.forEach((post, index) => list.append(postCard(post, actions, index + 1, message)));
        if (!posts.length) {
          const empty = element('div', 'empty'); empty.append(element('h2', '', 'No supported posts loaded yet'), element('p', '', 'Reddit may still be loading, require sign-in, or use a page layout this version does not recognize.'));
          const button = element('button', 'original empty-action', 'Show original Reddit'); button.addEventListener('click', actions.original); empty.append(button); list.append(empty);
        }
      }
    },
    message,
  };
}
function postCard(post: Post, actions: ReaderActions, rank: number, message: (text: string) => void) {
  const article = element('article', 'post');
  article.dataset.media = post.thumbnail ? 'image' : 'none';
  const number = element('span', 'rank', String(rank)); number.setAttribute('aria-hidden', 'true');
  const score = element('div', 'score-column');
  score.title = 'Score from Reddit. Use Show Reddit to vote.';
  const up = element('span', 'score-arrow up'), down = element('span', 'score-arrow down');
  up.setAttribute('aria-hidden', 'true'); down.setAttribute('aria-hidden', 'true');
  const points = element('span', 'score-number', post.score || '·');
  points.setAttribute('aria-label', post.score ? `${post.score} points` : 'Score unavailable');
  score.append(up, points, down);
  const thumb = anchor('', post.externalUrl || post.href, actions, 'thumbnail');
  thumb.setAttribute('aria-label', post.externalUrl ? `Open source for ${post.title}` : `Open ${post.title}`);
  if (post.thumbnail) {
    const image = element('img', ''); image.src = post.thumbnail; image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => { image.remove(); thumb.textContent = '≡'; }, { once: true }); thumb.append(image);
  } else thumb.textContent = '≡';
  if (post.thumbnail && post.externalUrl) { const badge = element('span', 'external-badge'); badge.append(icon('external')); thumb.append(badge); }
  const content = element('div', 'post-content'); const meta = element('div', 'meta');
  const avatar = element('span', 'community-avatar', post.community[0]?.toUpperCase()); avatar.setAttribute('aria-hidden', 'true');
  if (post.communityIcon) {
    const image = element('img', ''); image.src = post.communityIcon; image.alt = ''; image.loading = 'lazy';
    image.addEventListener('error', () => avatar.replaceChildren(document.createTextNode(post.community[0]?.toUpperCase() || 'r')), { once: true });
    avatar.replaceChildren(image);
  }
  meta.append(avatar);
  meta.append(anchor(`r/${post.community}`, communityUrl(post.community), actions, 'subreddit'));
  if (post.createdAt) {
    const date = new Date(post.createdAt);
    const time = element('time', 'post-time', `· ${relativeTime(date)}`); time.dateTime = post.createdAt; time.title = date.toLocaleString(); meta.append(time);
  }
  if (post.author) meta.append(element('span', 'post-author', `· u/${post.author}`));
  const controls = element('div', 'post-controls');
  const join = anchor('Join', communityUrl(post.community), actions, 'join-community');
  join.title = 'Open the community on Reddit to join or manage your membership.';
  join.setAttribute('aria-label', `Join or manage r/${post.community} on Reddit`);
  const menu = document.createElement('details'); menu.className = 'post-menu';
  const summary = element('summary', ''); summary.setAttribute('aria-label', 'More post options'); summary.title = 'More post options'; summary.append(icon('more'));
  const menuContent = element('div', 'post-menu-content');
  const copy = element('button', '', 'Copy post link'); copy.type = 'button';
  copy.addEventListener('click', () => { menu.open = false; void copyLink(post, actions, message); });
  menuContent.append(anchor('Open discussion on Reddit', post.href, actions), anchor(`Open r/${post.community}`, communityUrl(post.community), actions), copy);
  menuContent.addEventListener('click', () => { menu.open = false; });
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; summary.focus(); } });
  menu.append(summary, menuContent); controls.append(join, menu); meta.append(controls);
  const title = element('h2', ''); title.append(anchor(post.title, post.href, actions, 'post-title'));
  const details = element('div', 'details');
  const votes = anchor('', post.href, actions, 'vote-pill action-pill');
  votes.title = 'Open this discussion on Reddit to vote.'; votes.setAttribute('aria-label', `Vote on Reddit${post.score ? `, ${post.score} points` : ''}`);
  votes.append(icon('up'), element('span', '', post.score ? compactCount(post.score) : 'Vote'), icon('down')); details.append(votes);
  if (post.score) details.append(element('span', 'post-points', `${post.score} points`));
  const comments = anchor('', post.href, actions, 'comment-pill action-pill');
  comments.setAttribute('aria-label', post.comments ? `${post.comments} comments` : 'Open comments');
  comments.append(icon('comment'), element('span', '', post.comments ? compactCount(post.comments) : 'Comments'));
  if (post.comments) comments.append(element('span', 'comment-label', ' comments'));
  details.append(comments);
  const share = element('button', 'share-post action-pill'); share.type = 'button'; share.title = 'Share post'; share.append(icon('share')); share.setAttribute('aria-label', 'Share post');
  share.addEventListener('click', async () => {
    if (actions.preview) { message('Sharing is available for real posts in the installed extension.'); return; }
    if (navigator.share) {
      try { await navigator.share({ title: post.title, url: post.href }); return; }
      catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
    }
    await copyLink(post, actions, message);
  });
  details.append(share);
  details.append(element('span', 'native-note', 'Opens on Reddit ↗'));
  content.append(meta, title);
  if (post.externalUrl) {
    const source = anchor(post.externalUrl, post.externalUrl, actions, 'source-link'); source.title = post.externalUrl; content.append(source);
  }
  content.append(details); article.append(number, score, thumb, content); return article;
}

function compactCount(value: string) {
  const number = Number(value.replaceAll(',', ''));
  return Number.isFinite(number) ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(number) : value;
}
function relativeTime(date: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  const units = minutes < 60 ? [minutes, 'minute'] : minutes < 1440 ? [Math.floor(minutes / 60), 'hour'] : minutes < 43200 ? [Math.floor(minutes / 1440), 'day'] : minutes < 525600 ? [Math.floor(minutes / 43200), 'month'] : [Math.floor(minutes / 525600), 'year'];
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }).format(-Number(units[0]), units[1] as Intl.RelativeTimeFormatUnit);
}
async function copyLink(post: Post, actions: ReaderActions, message: (text: string) => void) {
  if (actions.preview) { message('Copying links is available for real posts in the installed extension.'); return; }
  try { await navigator.clipboard.writeText(post.href); message('Post link copied.'); }
  catch { message('Copying is unavailable in this browser. Open the discussion to copy its address.'); }
}
function icon(name: 'up' | 'down' | 'comment' | 'share' | 'more' | 'external') {
  const paths = {
    up: 'M12 3 3 12h6v9h6v-9h6L12 3Z',
    down: 'M12 21 3 12h6V3h6v9h6l-9 9Z',
    comment: 'M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.5A9 9 0 1 1 21 11.5Z',
    share: 'M14 4v5C7 9 3 13 3 20c3-5 6-6 11-6v5l8-7.5L14 4Z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    external: 'M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  };
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.classList.add('icon'); node.setAttribute('viewBox', '0 0 24 24'); node.setAttribute('fill', 'none'); node.setAttribute('stroke', 'currentColor'); node.setAttribute('stroke-width', name === 'more' ? '3.5' : '1.8'); node.setAttribute('stroke-linecap', 'round'); node.setAttribute('stroke-linejoin', 'round'); node.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[name]); node.append(path); return node;
}
