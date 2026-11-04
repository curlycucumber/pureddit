import { communityUrl, COMMUNITY, HOME_URL, NEWS_URL, sortUrl, VERSION, matchesTitle, type Appearance, type ColorScheme, type HomeFeed, type HomeMode, type NativeAction, type Page, type Post, type Preferences, type Vote } from './model';
import type { Extraction } from './extract';
import { mountTools, type ToolActions } from './tools';

export type ReaderModel = Extraction & { page: Page; preferences: Preferences; preview: boolean; homeFeed?: HomeFeed };
export type ReaderActions = ToolActions & { vote: (post: Post, direction: Vote) => void; original: () => void; navigate: (url: string) => void; pin: (name: string) => void; unpin: (name: string) => void; appearance: (value: Appearance) => void; colorScheme: (value: ColorScheme) => void; native: (action: NativeAction) => void; homeMode: (value: HomeMode) => void; more: () => void; preview?: boolean };
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
      <button class="community-toggle" type="button" aria-label="Communities" title="Open navigation" aria-expanded="false" aria-controls="pureddit-navigation"></button>
      <a class="brand" href="https://www.reddit.com/" aria-label="pureddit home"><span class="mark">p</span><span>pure<span class="light">ddit</span><b>.</b></span></a>
      <span class="tagline">Reddit, simplified.</span>
      <div class="account-actions" role="group" aria-label="Reddit account actions">
        <button type="button" class="native-create" aria-label="Create post" title="Create a post on Reddit"></button>
        <button type="button" class="native-notifications" aria-label="Notifications" title="Open Reddit notifications"></button>
        <button type="button" class="native-account" aria-label="Account" title="Open your Reddit account menu"></button>
      </div>
      <button class="original" type="button" aria-label="Show Reddit ↗" title="Show Reddit"><span>Show Reddit ↗</span></button>
    </header>
    <div class="view-controls" aria-label="Appearance preferences">
      <div class="view-control"><span class="view-label">Layout</span><div class="segmented" role="group" aria-label="Page layout"><button type="button" data-appearance="modern" aria-label="Modern layout" aria-pressed="true">Modern</button><button type="button" data-appearance="old" aria-label="Old layout" aria-pressed="false">Old</button></div></div>
      <div class="view-control"><div class="segmented" role="group" aria-label="Color theme"><button type="button" data-color-scheme="light" aria-label="Light mode" title="Light mode" aria-pressed="true"></button><button type="button" data-color-scheme="dark" aria-label="Dark mode" title="Dark mode" aria-pressed="false"></button></div></div>
    </div>
    <div class="classic-navigation"></div>
    <div class="layout">
      <aside class="sidebar" id="pureddit-navigation" aria-label="Navigation">
        <nav class="primary" aria-label="Feeds"></nav>
        <button type="button" class="native-navigation">Reddit navigation &amp; subscriptions ↗</button>
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
        <div class="home-tabs" role="tablist" aria-label="Home feed" hidden><button type="button" role="tab" data-home-mode="following" aria-selected="true">Your Feed</button><button type="button" role="tab" data-home-mode="for-you" aria-selected="false">Suggested Feed</button></div>
        <div class="home-feed-status" hidden><p role="status"></p><button type="button">Open Reddit’s feed controls</button></div>
        <div class="toolbar">
          <nav class="sorts" aria-label="Sort posts"></nav>
          <span class="source-status"></span>
        </div>
        <div class="posts" id="pureddit-post-list"></div>
        <button type="button" class="load-more">Load more posts</button>
        <p class="reading-note">Showing posts Reddit has loaded on this page. Use the original view to load more or manage your account.</p>
        <div class="notice" role="status" hidden></div>
      </main>
    </div>`;
  root.replaceChildren(style, reader);
  const tools = mountTools(reader, actions);
  const find = <T extends Element = HTMLElement>(selector: string) => reader.querySelector<T>(selector)!;
  find('.version').textContent = `pureddit ${VERSION}`;
  find('.community-toggle').append(icon('menu'));
  find('.original').append(icon('external'));
  for (const [action, glyph] of [['create', 'plus'], ['notifications', 'bell'], ['account', 'account']] as const) {
    const button = find(`.native-${action}`); button.append(icon(glyph)); button.addEventListener('click', () => actions.native(action));
  }
  find('.native-navigation').addEventListener('click', () => actions.native('navigation'));
  find('.load-more').addEventListener('click', actions.more);
  reader.querySelectorAll<HTMLButtonElement>('[data-appearance]').forEach(button => button.addEventListener('click', () => actions.appearance(button.dataset.appearance === 'old' ? 'old' : 'modern')));
  reader.querySelectorAll<HTMLButtonElement>('[data-color-scheme]').forEach(button => {
    button.prepend(icon(button.dataset.colorScheme === 'dark' ? 'moon' : 'sun'));
    button.addEventListener('click', () => actions.colorScheme(button.dataset.colorScheme === 'dark' ? 'dark' : 'light'));
  });
  find('.home-feed-status button').addEventListener('click', actions.original);
  reader.querySelectorAll<HTMLButtonElement>('[data-home-mode]').forEach(button => button.addEventListener('click', () => actions.homeMode(button.dataset.homeMode === 'following' ? 'following' : 'for-you')));
  find('.home-tabs').addEventListener('keydown', event => {
    const key = (event as KeyboardEvent).key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    const current = reader.querySelector<HTMLButtonElement>('[data-home-mode][aria-selected=true]');
    const mode = key === 'Home' ? 'following' : key === 'End' ? 'for-you' : current?.dataset.homeMode === 'following' ? 'for-you' : 'following';
    find<HTMLElement>(`[data-home-mode="${mode}"]`).focus(); actions.homeMode(mode);
  });
  find('.original').addEventListener('click', actions.original);
  find('.community-toggle').addEventListener('click', event => { const button = event.currentTarget as HTMLButtonElement; const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); reader.dataset.communities = open ? 'open' : ''; });
  find('.brand').addEventListener('click', event => { const click = event as MouseEvent; if (click.ctrlKey || click.metaKey || click.shiftKey || click.button !== 0) return; event.preventDefault(); actions.navigate(HOME_URL); });
  find('.skip').addEventListener('click', event => { event.preventDefault(); find<HTMLElement>('#feed').focus(); });
  find<HTMLFormElement>('.pin-form').addEventListener('submit', event => {
    event.preventDefault(); const input = find<HTMLInputElement>('#community'); const name = input.value.trim().replace(/^r\//, '');
    if (COMMUNITY.test(name)) { actions.pin(name); input.value = ''; }
  });
  reader.addEventListener('click', event => {
    reader.querySelectorAll<HTMLDetailsElement>('.post-menu[open]').forEach(menu => {
      if (!event.composedPath().includes(menu)) menu.open = false;
    });
    if (!find('.sidebar').contains(event.target as Node) && !find('.community-toggle').contains(event.target as Node)) {
      reader.dataset.communities = ''; find('.community-toggle').setAttribute('aria-expanded', 'false');
    }
  });
  reader.addEventListener('keydown', event => {
    if (event.key === 'Escape' && reader.dataset.communities === 'open') { reader.dataset.communities = ''; find('.community-toggle').setAttribute('aria-expanded', 'false'); find<HTMLElement>('.community-toggle').focus(); }
  });
  const message = (text: string) => { const notice = find<HTMLElement>('.notice'); notice.textContent = text; notice.hidden = !text; };
  let lastPosts = ''; let lastNavigation = '';
  const cards = new Map<string,{signature:string; element:HTMLElement}>();
  let filterContext = '', revealTitles = false; let currentModel: ReaderModel;
  const api = {
    update(model: ReaderModel) {
      currentModel = model;
      const { page, preferences } = model;
      const context = JSON.stringify([page,model.homeFeed?.mode,preferences.titleFilters]);
      if (context !== filterContext) { filterContext = context; revealTitles = false; }
      const matching = preferences.titleFilters.length ? model.posts.filter(post => matchesTitle(post.title, preferences.titleFilters)) : [];
      const hidden = new Set(matching.map(post=>post.href));
      const posts = revealTitles || !matching.length ? model.posts : model.posts.filter(post=>!hidden.has(post.href));
      tools.update(preferences);
      tools.filters(matching.length, revealTitles, () => { revealTitles = !revealTitles; api.update(currentModel); });
      reader.dataset.appearance = preferences.appearance;
      reader.dataset.textSize = preferences.reading.textSize;
      reader.dataset.contentWidth = preferences.reading.contentWidth;
      reader.dataset.density = preferences.reading.density;
      reader.dataset.preview = String(model.preview);
      reader.dataset.page = page.kind;
      reader.dataset.theme = preferences.colorScheme;
      reader.querySelectorAll<HTMLButtonElement>('[data-appearance]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.appearance === preferences.appearance)));
      reader.querySelectorAll<HTMLButtonElement>('[data-color-scheme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.colorScheme === preferences.colorScheme)));
      find<HTMLElement>('.sorts').hidden = page.kind === 'home' || page.kind === 'news';
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
      find('.description').textContent = page.kind === 'home' ? model.homeFeed?.status === 'ready' ? model.homeFeed.mode === 'following' ? 'Your Feed: posts from the communities you follow on Reddit.' : 'Suggested Feed: Reddit’s For You feed, including communities you may not follow. Ads are hidden.' : 'Waiting for Reddit to confirm the selected Home feed.' : `Posts from ${page.community ? `r/${page.community}` : 'Reddit'}.`;
      find<HTMLElement>('.home-tabs').hidden = page.kind !== 'home';
      find<HTMLButtonElement>('.load-more').disabled = Boolean(model.homeFeed && model.homeFeed.status !== 'ready');
      find<HTMLElement>('.home-feed-status').hidden = page.kind !== 'home' || model.homeFeed?.status === 'ready';
      find('.home-feed-status p').textContent = model.homeFeed?.message || '';
      reader.querySelectorAll<HTMLButtonElement>('[data-home-mode]').forEach(button => {
        const active = button.dataset.homeMode === model.homeFeed?.mode;
        button.id = `pureddit-home-${button.dataset.homeMode}`; button.setAttribute('aria-controls', 'pureddit-post-list'); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      });
      const postList = find('.posts');
      if (page.kind === 'home') { postList.setAttribute('role', 'tabpanel'); postList.setAttribute('aria-labelledby', `pureddit-home-${model.homeFeed?.mode || 'following'}`); }
      else { postList.removeAttribute('role'); postList.removeAttribute('aria-labelledby'); }
      find('.post-count').textContent = `${posts.length} posts`;
      find('.source-status').textContent = model.preview ? `${model.layout} · sample page` : `${model.layout === 'unsupported' ? 'Waiting for' : 'Reading'} Reddit`;
      find('.reading-note').textContent = model.preview ? 'Sample content for checking the shared extension layout. No live Reddit access is made from this preview.' : `Showing posts Reddit has loaded on this page.${model.filtered ? ` ${model.filtered} promoted or marked recommendation cards omitted.` : ''} Use Show Reddit to load more or use native account actions.`;
      const navigation = JSON.stringify([page, preferences.pins, preferences.recent]);
      if (navigation !== lastNavigation) {
      lastNavigation = navigation;
      primary.replaceChildren();
      for (const [label, href, kind] of [['Home', HOME_URL, 'home'], ['Popular', 'https://www.reddit.com/r/popular/', 'popular'], ['News', NEWS_URL, 'news']]) {
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
      }
      const signature = JSON.stringify([posts, model.homeFeed?.status, model.homeFeed?.mode, matching.length]);
      if (lastPosts !== signature) {
        lastPosts = signature;
        const list = find('.posts');
        if (posts.length) list.querySelector('.empty')?.remove();
        const desired = new Set(posts.map(post => post.href));
        for (const [href,card] of cards) if (!desired.has(href)) { card.element.remove(); cards.delete(href); }
        let cursor: ChildNode | null = list.firstChild;
        posts.forEach((post,index) => {
          const signature = JSON.stringify(post), previous = cards.get(post.href);
          let card = previous?.element;
          const voteFocus=previous?.element.contains(root.activeElement)&&root.activeElement?.matches('.score-arrow') ? (root.activeElement.classList.contains('up')?'up':'down') : undefined;
          if (!previous || previous.signature !== signature) {
            card = postCard(post, actions, index + 1, message);
            if (previous) { if (cursor === previous.element) cursor = card; previous.element.replaceWith(card); }
            cards.set(post.href,{signature,element:card});
          } else { const rank = card!.querySelector('.rank')!; if (rank.textContent !== String(index + 1)) rank.textContent = String(index + 1); }
          if (card !== cursor) list.insertBefore(card!,cursor);
          cursor = card!.nextSibling;
          if(voteFocus)card!.querySelector<HTMLButtonElement>(`.score-arrow.${voteFocus}`)?.focus({preventScroll:true});
        });
        if (!posts.length) {
          list.replaceChildren();
          const empty = element('div', 'empty'); empty.append(element('h2', '', matching.length ? 'These posts match your title filters' : 'No supported posts loaded yet'), element('p', '', matching.length ? 'Use the filtered-posts button above to reveal them or change your preferences.' : 'Reddit may still be loading, require sign-in, or use a page layout this version does not recognize.'));
          const button = element('button', 'original empty-action', 'Show original Reddit'); button.addEventListener('click', actions.original); empty.append(button); list.append(empty);
        }
      }
    },
    message,
    filters: tools.filters,
    closeTools: tools.close,
    toolsOpen: tools.isOpen,
  };
  return api;
}
function postCard(post: Post, actions: ReaderActions, rank: number, message: (text: string) => void) {
  const article = element('article', 'post');
  article.dataset.expandedMedia = String(Boolean(post.thumbnail && post.mediaKind));
  article.dataset.media = post.thumbnail ? 'image' : 'none';
  const number = element('span', 'rank', String(rank)); number.setAttribute('aria-hidden', 'true');
  const score = element('div', 'score-column');
  score.dataset.vote=post.vote||'';
  const up = element('button', 'score-arrow up'), down = element('button', 'score-arrow down');
  for(const [button,direction] of [[up,'up'],[down,'down']] as const){button.type='button';button.setAttribute('aria-label',direction==='up'?'Upvote post':'Downvote post');button.setAttribute('aria-pressed',String(post.vote===direction));button.title=direction==='up'?'Upvote':'Downvote';button.addEventListener('click',()=>actions.vote(post,direction));}
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
function icon(name: 'up' | 'down' | 'comment' | 'share' | 'more' | 'external' | 'menu' | 'plus' | 'bell' | 'account' | 'sun' | 'moon') {
  const paths = {
    up: 'M12 3 3 12h6v9h6v-9h6L12 3Z',
    down: 'M12 21 3 12h6V3h6v9h6l-9 9Z',
    comment: 'M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.5A9 9 0 1 1 21 11.5Z',
    share: 'M14 4v5C7 9 3 13 3 20c3-5 6-6 11-6v5l8-7.5L14 4Z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    external: 'M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
    menu: 'M4 6h16M4 12h16M4 18h16',
    plus: 'M12 4v16M4 12h16',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6',
    account: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
    sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
    moon: 'M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z',
  };
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.classList.add('icon'); node.setAttribute('viewBox', '0 0 24 24'); node.setAttribute('fill', 'none'); node.setAttribute('stroke', 'currentColor'); node.setAttribute('stroke-width', name === 'more' ? '3.5' : '1.8'); node.setAttribute('stroke-linecap', 'round'); node.setAttribute('stroke-linejoin', 'round'); node.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[name]); node.append(path); return node;
}
