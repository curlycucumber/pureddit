import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, Check, ChevronDown,
  ChevronRight, CircleHelp, Compass, ExternalLink, Flame, Home,
  Leaf, Link as LinkIcon, List, Menu, MessageCircle, Newspaper,
  Plus, Search, Send, Share2, SlidersHorizontal, Sparkles, Trash2, X,
} from 'lucide-react';
import { communities as demoCommunities, formatCount, getCommunity, initialPosts, initialSubscriptions, timeAgo, type Comment, type Post, type Community } from './data';
import { action, api, useReddit } from './reddit';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Vote = -1 | 0 | 1;
type Sort = 'New' | 'Hot' | 'Top';
type Store = {
  version: 1; posts: Post[]; subscriptions: string[]; recent: string[];
  votes: Record<string, Vote>; saved: string[];
};
const STORAGE_KEY = 'pureddit:v1';
const newStore = (): Store => ({ version: 1, posts: initialPosts, subscriptions: initialSubscriptions, recent: [], votes: {}, saved: [] });
function loadStore(): Store {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (value?.version === 1 && Array.isArray(value.posts) && Array.isArray(value.subscriptions)
      && Array.isArray(value.recent) && Array.isArray(value.saved) && value.votes && typeof value.votes === 'object') return value;
  } catch { /* Storage may be unavailable; the app still works in memory. */ }
  return newStore();
}
function currentRoute() {
  try { return decodeURIComponent(location.hash.slice(1) || '/home'); }
  catch { return '/not-found'; }
}
function go(route: string) { location.hash = route; }

function CommunityIcon({ name, small = false }: { name: string; small?: boolean }) {
  const community = getCommunity(name);
  return <span aria-hidden="true" className={`community-icon ${small ? 'small' : ''}`} style={{ color: community.color, background: community.background }}>{community.label}</span>;
}

function RedditText({ children }: { children: string }) {
  return <Markdown skipHtml remarkPlugins={[remarkGfm]} components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{children}</Markdown>;
}

function Modal({ title, close, children, className = '' }: { title: string; close: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`modal ${className}`} onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button></div>
    {children}
  </dialog>;
}

function VoteControl({ id, score, vote, onVote, horizontal = false }: { id: string; score: number; vote: Vote; onVote: (id: string, direction: Vote) => void; horizontal?: boolean }) {
  return <div className={`vote-control ${horizontal ? 'horizontal' : ''} ${vote === 1 ? 'upvoted' : vote === -1 ? 'downvoted' : ''}`}>
    <button aria-label="Upvote" aria-pressed={vote === 1} onClick={() => onVote(id, 1)}><ArrowUp size={18} strokeWidth={1.8} /></button>
    <span aria-label={`${score + vote} points`}>{formatCount(score + vote)}</span>
    <button aria-label="Downvote" aria-pressed={vote === -1} onClick={() => onVote(id, -1)}><ArrowDown size={18} strokeWidth={1.8} /></button>
  </div>;
}

export default function App() {
  const reddit = useReddit();
  const live = !!reddit.user;
  const username = reddit.user?.name || 'you';
  const [demoStore, setDemoStore] = useState(loadStore);
  const emptyLiveStore = (): Store => ({ version: 1, posts: [], subscriptions: [], recent: [], votes: {}, saved: [] });
  const [liveStore, setLiveStore] = useState<Store>(emptyLiveStore);
  const [liveCommunities, setLiveCommunities] = useState<Community[]>([]);
  const communities = live ? liveCommunities : demoCommunities;
  const store = live ? liveStore : demoStore;
  const setStore = live ? setLiveStore : setDemoStore;
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState('');
  const [recentReady, setRecentReady] = useState(false);
  const [after, setAfter] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<string[]>([]);
  const inFlight = useRef(new Set<string>());
  const loadedUser = useRef('');
  const [route, setRoute] = useState(currentRoute);
  const [sort, setSort] = useState<Sort>('New');
  const viewKey = `${reddit.user?.id || ''}|${route}|${sort}`;
  const currentView = useRef(viewKey);
  currentView.current = viewKey;
  const [compact, setCompact] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [communitySearch, setCommunitySearch] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState<'compose' | 'about' | 'account' | null>(() => new URLSearchParams(location.search).has('auth_error') ? 'account' : null);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [postKind, setPostKind] = useState<'Text' | 'Link'>('Text');
  const [composeCommunity, setComposeCommunity] = useState(store.subscriptions[0] || communities[0]?.name || '');
  const [composeTitle, setComposeTitle] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeUrl, setComposeUrl] = useState('');
  const [composeError, setComposeError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName) && !document.querySelector('dialog[open]')) {
        event.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    const change = () => { setRoute(currentRoute()); setMobileNav(false); setReplyTo(null); setCommentBody(''); setReplyBody(''); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(demoStore)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [demoStore]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const section = route.split('/')[1];
  const remote = live || ['popular', 'news'].includes(section) || (section === 'post' && /^[a-z0-9]+$/.test(route.split('/')[2] || ''));
  const visibleStore = remote ? liveStore : store;
  const communityName = section === 'r' ? route.split('/')[2] : undefined;
  const community = communityName ? communities.find(c => c.name === communityName) || (live ? getCommunity(communityName) : undefined) : undefined;
  const selectedPost = section === 'post' ? visibleStore.posts.find(p => p.id === route.split('/')[2]) : undefined;
  const query = section === 'search' ? route.slice('/search/'.length) : '';
  const activeCommunity = selectedPost ? communities.find(c => c.name === selectedPost.community) || getCommunity(selectedPost.community) : community;

  useEffect(() => {
    const name = activeCommunity?.name;
    if (name) setStore(previous => {
      if (previous.recent[0] === name) return previous;
      return { ...previous, recent: [name, ...previous.recent.filter(item => item !== name)].slice(0, 5) };
    });
  }, [activeCommunity?.name]);
  useEffect(() => {
    document.title = `${selectedPost?.title || (community ? `r/${community.name}` : section === 'home' ? 'Your home' : section.charAt(0).toUpperCase() + section.slice(1))} · Pureddit`;
  }, [selectedPost?.title, community, section]);

  async function perform(key: string, operation: () => Promise<void>) {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key); setPending(previous => [...previous, key]);
    try { await operation(); } catch (error) { const message = error instanceof Error ? error.message : 'Reddit could not complete this request.'; setToast(message); if (key === 'submit') setComposeError(message); }
    finally { inFlight.current.delete(key); setPending(previous => previous.filter(item => item !== key)); }
  }
  function mergePosts(posts: Post[], append = false) {
    setLiveStore(previous => ({ ...previous,
      posts: append ? [...previous.posts, ...posts.filter(post => !previous.posts.some(item => item.id === post.id))] : posts,
      votes: { ...previous.votes, ...Object.fromEntries(posts.flatMap(post => [[post.id, post.vote || 0], ...post.comments.map(comment => [comment.id, comment.vote || 0])])) },
      saved: [...new Set([...previous.saved.filter(id => !posts.some(post => post.id === id)), ...posts.filter(post => post.saved).map(post => post.id)])],
    }));
  }
  function feedResource() {
    return section === 'r' ? 'community-feed' : section === 'saved' ? 'saved' : section === 'profile' ? 'profile' : section === 'search' ? 'search' : section === 'popular' ? 'popular' : section === 'news' ? 'news' : 'home';
  }
  async function nextPage() {
    if (!after) return;
    const requestedView = viewKey;
    await perform('load-more', async () => {
      const data = await api<{ posts: Post[]; after: string | null }>(feedResource(), { sort: sort.toLowerCase(), ...(communityName ? { name: communityName } : {}), ...(query ? { q: query } : {}), after });
      if (currentView.current === requestedView) { mergePosts(data.posts, true); setAfter(data.after); }
    });
  }
  useEffect(() => {
    if (!reddit.user) { setLiveStore(emptyLiveStore()); setLiveCommunities([]); loadedUser.current = ''; return; }
    const controller = new AbortController();
    const firstLoad = loadedUser.current !== reddit.user.id;
    if (firstLoad) { setLiveStore(emptyLiveStore()); setRecentReady(false); loadedUser.current = reddit.user.id; }
    api<{ communities: Community[] }>('subscriptions', {}, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setLiveCommunities(previous => [...data.communities, ...previous.filter(c => !data.communities.some(item => item.name === c.name))]);
      let recent: string[] = []; try { const parsed = JSON.parse(localStorage.getItem(`pureddit:recent:${reddit.user!.id}`) || '[]'); if (Array.isArray(parsed)) recent = parsed.filter(item => typeof item === 'string').slice(0, 5); } catch { /* Recent names are optional. */ }
      setLiveStore(previous => ({ ...previous, subscriptions: data.communities.map(c => c.name), recent: firstLoad ? recent : previous.recent })); setRecentReady(true);
    }).catch(error => { if (error.name !== 'AbortError') setLiveError(error.message); });
    return () => controller.abort();
  }, [reddit.user?.id, refresh]);
  useEffect(() => {
    if (!remote) return;
    const controller = new AbortController();
    setAfter(null); setLiveError('');
    if (section === 'communities') { setLiveLoading(false); return; }
    setLiveLoading(true);
    const parameters = { sort: sort.toLowerCase(), ...(communityName ? { name: communityName } : {}), ...(query ? { q: query } : {}) };
    const fetchData = async () => {
      if (section === 'r' && communityName) {
        const about = await api<{ community: Community; subscribed: boolean }>('community', { name: communityName }, controller.signal);
        if (!controller.signal.aborted) setLiveCommunities(previous => [...previous.filter(c => c.name !== about.community.name), about.community]);
      }
      if (section === 'post') {
        const data = await api<{ post: Post }>('post', { id: route.split('/')[2] }, controller.signal);
        if (!controller.signal.aborted) mergePosts([data.post]);
      } else {
        const data = await api<{ posts: Post[]; after: string | null }>(feedResource(), parameters, controller.signal);
        if (!controller.signal.aborted) { mergePosts(data.posts); setAfter(data.after); }
      }
    };
    fetchData().catch(error => { if (error.name !== 'AbortError') setLiveError(error.message); }).finally(() => { if (!controller.signal.aborted) setLiveLoading(false); });
    return () => controller.abort();
  }, [reddit.user?.id, route, sort, refresh]);
  useEffect(() => {
    if (!live || section !== 'communities' || !communitySearch.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api<{ communities: Community[] }>('communities', { q: communitySearch.trim() }, controller.signal).then(data => {
        if (!controller.signal.aborted) setLiveCommunities(previous => [...previous.filter(c => !data.communities.some(item => item.name === c.name)), ...data.communities]);
      }).catch(error => { if (error.name !== 'AbortError') setToast(error.message); });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [live, section, communitySearch]);
  useEffect(() => {
    if (!reddit.user || !recentReady) return;
    try { localStorage.setItem(`pureddit:recent:${reddit.user.id}`, JSON.stringify(liveStore.recent)); } catch { /* Tokens and Reddit content are never stored here. */ }
  }, [reddit.user?.id, liveStore.recent, recentReady]);

  function vote(id: string, direction: Vote) {
    if (remote && !live) { setModal('account'); return; }
    if (live) {
      const item = store.posts.find(post => post.id === id) || store.posts.flatMap(post => post.comments).find(comment => comment.id === id);
      if (!item?.redditName) return;
      void perform(id, async () => { const value = store.votes[id] === direction ? 0 : direction; await action({ action: 'vote', id: item.redditName, direction: value }); setLiveStore(previous => ({ ...previous, votes: { ...previous.votes, [id]: value } })); }); return;
    }
    setStore(previous => ({ ...previous, votes: { ...previous.votes, [id]: previous.votes[id] === direction ? 0 : direction } }));
  }
  function toggleSaved(id: string) {
    if (remote && !live) { setModal('account'); return; }
    if (live) {
      const post = store.posts.find(post => post.id === id); if (!post?.redditName) return;
      const saved = store.saved.includes(id);
      void perform(id, async () => { await action({ action: saved ? 'unsave' : 'save', id: post.redditName }); setLiveStore(previous => ({ ...previous, saved: saved ? previous.saved.filter(item => item !== id) : [...previous.saved, id], posts: saved && section === 'saved' ? previous.posts.filter(post => post.id !== id) : previous.posts })); }); return;
    }
    setStore(previous => ({ ...previous, saved: previous.saved.includes(id) ? previous.saved.filter(item => item !== id) : [...previous.saved, id] }));
  }
  function toggleSubscription(name: string) {
    if (remote && !live) { setModal('account'); return; }
    const leaving = store.subscriptions.includes(name);
    if (live) {
      void perform(`subscribe:${name}`, async () => { await action({ action: 'subscribe', community: name, join: !leaving }); setLiveStore(previous => ({ ...previous, subscriptions: leaving ? previous.subscriptions.filter(item => item !== name) : [...previous.subscriptions, name] })); setToast(leaving ? `Left r/${name} on Reddit.` : `Joined r/${name} on Reddit.`); setRefresh(previous => previous + 1); }); return;
    }
    setStore(previous => ({ ...previous, subscriptions: leaving ? previous.subscriptions.filter(item => item !== name) : [...previous.subscriptions, name] }));
    setToast(leaving ? `Left r/${name}. Your Home feed has been updated.` : `Joined r/${name}. Welcome to your Home feed.`);
  }
  function openCompose() {
    if (remote && !live) { setModal('account'); return; }
    setComposeCommunity(activeCommunity?.name || store.subscriptions[0] || communities[0]?.name || '');
    setComposeError(''); setModal('compose');
  }
  async function share(post: Post) {
    try { await navigator.clipboard.writeText(remote && post.permalink ? post.permalink : `${location.origin}${location.pathname}#/post/${post.id}`); setToast(remote ? 'Reddit post link copied.' : post.author === username ? 'Local post link copied. This post is available only in this browser.' : 'Post link copied. Sample posts open in other demo sessions.'); }
    catch { setToast('Copy the post link from your browser’s address bar.'); go(`/post/${post.id}`); }
  }
  function addComment(event: FormEvent, parent?: string) {
    event.preventDefault();
    if (remote && !live) { setModal('account'); return; }
    const body = (parent ? replyBody : commentBody).trim();
    if (!body || !selectedPost) return;
    if (live) {
      const target = parent ? selectedPost.comments.find(comment => comment.id === parent)?.redditName : selectedPost.redditName;
      if (!target) return;
      void perform('comment', async () => { const data = await action<{ comment: Comment }>({ action: 'comment', id: target, text: body }); setLiveStore(previous => ({ ...previous, posts: previous.posts.map(post => post.id === selectedPost.id ? { ...post, comments: [...post.comments, { ...data.comment, parent }], commentCount: post.commentCount + 1 } : post), votes: { ...previous.votes, [data.comment.id]: data.comment.vote || 0 } })); setCommentBody(''); setReplyBody(''); setReplyTo(null); setToast('Your comment was posted to Reddit.'); }); return;
    }
    const comment: Comment = { id: crypto.randomUUID(), author: 'you', body, score: 1, created: Date.now(), parent };
    setStore(previous => ({ ...previous, posts: previous.posts.map(p => p.id === selectedPost.id ? { ...p, comments: [...p.comments, comment], commentCount: p.commentCount + 1 } : p) }));
    setCommentBody(''); setReplyBody(''); setReplyTo(null); setToast('Your comment was added to this local demo.');
  }
  function deleteComment(id: string) {
    if (remote && !live) { setModal('account'); return; }
    if (!selectedPost) return;
    if (live) {
      const comment = selectedPost.comments.find(item => item.id === id); if (!comment?.redditName) return;
      void perform(id, async () => { await action({ action: 'delete', id: comment.redditName }); setLiveStore(previous => ({ ...previous, posts: previous.posts.map(post => post.id === selectedPost.id ? { ...post, comments: post.comments.map(comment => comment.id === id ? { ...comment, author: '[deleted]', body: '[deleted]' } : comment) } : post) })); }); return;
    }
    setStore(previous => ({ ...previous, posts: previous.posts.map(p => p.id === selectedPost.id ? { ...p, comments: p.comments.map(c => c.id === id ? { ...c, author: '[deleted]', body: '[deleted]' } : c) } : p) }));
  }
  function submitPost(event: FormEvent) {
    event.preventDefault();
    if (remote && !live) { setModal('account'); return; }
    if (!composeTitle.trim()) { setComposeError('Give your post a title.'); return; }
    if (postKind === 'Link') {
      try { const url = new URL(composeUrl); if (!['https:', 'http:'].includes(url.protocol)) throw new Error(); }
      catch { setComposeError('Enter a complete http:// or https:// URL.'); return; }
    }
    if (live) {
      void perform('submit', async () => { const data = await action<{ id: string }>({ action: 'submit', community: composeCommunity, title: composeTitle.trim(), kind: postKind === 'Link' ? 'link' : 'self', text: composeBody, url: composeUrl }); setComposeTitle(''); setComposeBody(''); setComposeUrl(''); setModal(null); go(`/post/${data.id}`); setToast('Your post was published to Reddit.'); }); return;
    }
    const post: Post = { id: crypto.randomUUID(), community: composeCommunity, title: composeTitle.trim(), body: composeBody.trim(), url: postKind === 'Link' ? composeUrl : undefined, author: 'you', score: 1, created: Date.now(), comments: [], commentCount: 0, flair: postKind === 'Link' ? 'Link' : 'Discussion' };
    setStore(previous => ({ ...previous, posts: [post, ...previous.posts] }));
    setComposeTitle(''); setComposeBody(''); setComposeUrl(''); setModal(null); setSort('New'); go(`/post/${post.id}`);
    setToast('Post created in this local demo. It has not been published to Reddit.');
  }

  function deletePost(post: Post) {
    if (remote && !live) { setModal('account'); return; }
    const remove = () => setStore(previous => ({ ...previous, posts: previous.posts.filter(p => p.id !== post.id), saved: previous.saved.filter(id => id !== post.id) }));
    if (live && post.redditName) { void perform(post.id, async () => { await action({ action: 'delete', id: post.redditName }); remove(); setToast('Your Reddit post was deleted.'); }); }
    else { remove(); setToast('Your local post was deleted.'); }
  }
  let feed = remote ? visibleStore.posts : store.posts.filter(p => section === 'popular' ? true : section === 'news' ? p.news : section === 'r' ? p.community === community?.name : section === 'saved' ? store.saved.includes(p.id) : section === 'search' ? `${p.title} ${p.body || ''} ${p.community}`.toLowerCase().includes(query.toLowerCase()) : store.subscriptions.includes(p.community));
  if (!remote) feed = [...feed].sort((a, b) => sort === 'New' ? b.created - a.created : sort === 'Top' ? (b.score + (store.votes[b.id] || 0)) - (a.score + (store.votes[a.id] || 0)) : (b.score + (store.votes[b.id] || 0)) / Math.pow((Date.now() - b.created) / 3600000 + 2, 1.8) - (a.score + (store.votes[a.id] || 0)) / Math.pow((Date.now() - a.created) / 3600000 + 2, 1.8));
  const followed = communities.filter(c => store.subscriptions.includes(c.name));
  const isKnownRoute = ['home', 'popular', 'news', 'saved', 'search', 'communities', 'profile'].includes(section) || !!community || !!selectedPost;

  function communityLink(name: string, recent = false) {
    return <a className={`community-nav ${communityName === name ? 'selected' : ''}`} href={`#/r/${name}`} key={name}>
      <CommunityIcon name={name} small /><span>r/{name}</span>{recent && <span className="recent-dot" />}
    </a>;
  }
  function postRow(post: Post) {
    return <article className={`post-row ${compact ? 'compact' : ''}`} key={post.id} data-testid="post" aria-label={post.title}>
      <VoteControl id={post.id} score={post.score} vote={visibleStore.votes[post.id] || 0} onVote={vote} />
      {!compact && <a className={`post-thumbnail ${post.image ? '' : 'text-thumbnail'}`} href={`#/post/${post.id}`} tabIndex={-1} aria-hidden="true">
        {post.image ? <img loading="lazy" src={post.image} alt="" style={{ objectPosition: post.imagePosition }} /> : post.url ? <LinkIcon size={26} /> : <List size={27} strokeWidth={1.2} />}
      </a>}
      <div className="post-main">
        <div className="post-byline"><a href={`#/r/${post.community}`}><CommunityIcon name={post.community} small /><strong>r/{post.community}</strong></a><span className="byline-dot">·</span><span>u/{post.author}</span><span className="byline-dot">·</span><time dateTime={new Date(post.created).toISOString()}>{timeAgo(post.created)} ago</time></div>
        <a className="post-title" href={`#/post/${post.id}`}>{post.title}</a>
        <div className="post-actions">
          {post.flair && <span className={`flair ${post.flair === 'Original content' ? 'green' : ''}`}>{post.flair}</span>}
          <a href={`#/post/${post.id}`} className="comments-link"><MessageCircle size={14} /><span>{post.commentCount} <span className="comment-label">comments</span></span></a>
          <button className={store.saved.includes(post.id) ? 'is-saved' : ''} aria-label={store.saved.includes(post.id) ? 'Unsave post' : 'Save post'} aria-pressed={store.saved.includes(post.id)} onClick={() => toggleSaved(post.id)}><Bookmark size={14} fill={store.saved.includes(post.id) ? 'currentColor' : 'none'} /><span className="action-label">{store.saved.includes(post.id) ? 'Saved' : 'Save'}</span></button>
          <button aria-label="Share post" onClick={() => share(post)}><Share2 size={14} /><span className="action-label">Share</span></button>
          {post.author === username && <button aria-label="Delete your post" onClick={() => deletePost(post)}><Trash2 size={14} /></button>}
        </div>
      </div>
      <a href={`#/post/${post.id}`} className="row-arrow" aria-label={`Open ${post.title}`}><ChevronRight size={17} /></a>
    </article>;
  }
  function renderComment(comment: Comment, depth = 0): ReactNode {
    const deleted = comment.author === '[deleted]';
    return <article className={`comment ${depth ? 'nested-comment' : ''}`} key={comment.id} aria-label={`Comment by ${comment.author}`}>
      <div className="comment-meta"><span className={`avatar ${comment.author === username ? 'you-avatar' : ''}`}>{comment.author === username ? username[0] : comment.author.slice(0, 1)}</span><strong>u/{comment.author}</strong>{comment.author === username && <span className="you-label">you</span>}<span>· {timeAgo(comment.created)} ago</span></div>
      <div className="comment-body"><RedditText>{comment.body}</RedditText></div>
      {!deleted && <div className="comment-actions"><VoteControl horizontal id={comment.id} score={comment.score} vote={visibleStore.votes[comment.id] || 0} onVote={vote} /><button onClick={() => { setReplyTo(replyTo === comment.id ? null : comment.id); setReplyBody(''); }}><MessageCircle size={14} />Reply</button>{comment.author === username && <button aria-label="Delete your comment" onClick={() => deleteComment(comment.id)}><Trash2 size={14} />Delete</button>}</div>}
      {replyTo === comment.id && <form className="reply-form" onSubmit={event => addComment(event, comment.id)}><label className="sr-only" htmlFor="reply-body">Your reply</label><textarea id="reply-body" autoFocus required maxLength={10000} value={replyBody} onChange={event => setReplyBody(event.target.value)} placeholder={`Reply to u/${comment.author}…`} /><div><button className="plain-button" type="button" onClick={() => setReplyTo(null)}>Cancel</button><button className="button primary small-button" disabled={!replyBody.trim() || pending.includes('comment')} type="submit">Reply</button></div></form>}
      {selectedPost?.comments.filter(c => c.parent === comment.id).map(c => renderComment(c, depth + 1))}
    </article>;
  }

  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to feed</a>
    <header className="app-header">
      <div className="brand-area"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu size={22} /></button><a href="#/home" className="brand" aria-label="Pureddit home"><span className="brand-symbol">p<span /></span><span>Pure<span className="brand-light">ddit</span><span className="brand-period">.</span></span></a></div>
      <form className="search-form" role="search" onSubmit={event => { event.preventDefault(); if (searchInput.trim()) go(`/search/${encodeURIComponent(searchInput.trim())}`); }}><Search size={17} /><input ref={searchRef} aria-label="Search posts and communities" placeholder="Search Reddit" value={searchInput} onChange={event => setSearchInput(event.target.value)} /><kbd>/</kbd><button type="submit" className="sr-only">Search</button></form>
      <div className="header-actions">{!live && <button className="button primary sign-in-button" onClick={() => setModal('account')} disabled={reddit.checking}>Sign in<span className="desktop-only"> with Reddit</span></button>}<button className="button create-button" aria-label="Create post" disabled={reddit.checking} onClick={openCompose}><Plus size={17} /><span>Create post</span></button><span className="header-divider" /><button className={`profile-button ${live ? "reddit-profile" : ""}`} onClick={() => setModal('account')} aria-label={live ? `Account for ${username}` : 'Local demo account'}><span className="avatar you-avatar">{username[0]}</span><span className="profile-text">u/{username}<small>{live ? 'Reddit account' : 'Local demo'}</small></span><ChevronDown size={14} /></button></div>
    </header>

    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`} aria-label="Main navigation">
      <nav className="primary-nav">
        <a className={section === 'home' ? 'active' : ''} href="#/home"><Home size={19} /><span>Home</span>{section === 'home' && <span className="active-dot" />}</a>
        <a className={section === 'popular' ? 'active' : ''} href="#/popular"><Flame size={19} /><span>Popular</span></a>
        <a className={section === 'news' ? 'active' : ''} href="#/news"><Newspaper size={19} /><span>News</span></a>
      </nav>
      <div className="sidebar-rule" />
      {store.recent.length > 0 && <section className="sidebar-section recent-section"><h2>Recently visited <span>{store.recent.length}/5</span></h2>{store.recent.map(name => communityLink(name, true))}</section>}
      <section className="sidebar-section"><div className="sidebar-section-heading"><h2>Your communities <span>{followed.length}</span></h2><a className="icon-button" href="#/communities" aria-label="Manage communities"><Plus size={16} /></a></div>{followed.map(c => communityLink(c.name))}<a href="#/communities" className={`all-communities ${section === 'communities' ? 'selected' : ''}`}><span>All communities</span><ArrowRight size={14} /></a></section>
      <div className="sidebar-rule" />
      <nav className="secondary-nav">{live && <a href="#/profile" className={section === 'profile' ? 'selected' : ''}><Home size={17} />Your posts</a>}<a href="#/saved" className={section === 'saved' ? 'selected' : ''}><Bookmark size={17} />Saved posts{store.saved.length > 0 && <span>{store.saved.length}</span>}</a><button onClick={() => setModal('about')}><CircleHelp size={17} />About Pureddit</button></nav>
    </aside>

    <div className="workspace">
      {storageError && <div className="storage-warning" role="alert">Browser storage is unavailable. Changes will last for this session only.</div>}
      <main className="main-content" id="main-content" tabIndex={-1}>
        {reddit.error && modal !== 'account' && <div className="account-service-error" role="alert">{reddit.error} <button onClick={() => setModal('account')}>Account settings</button></div>}
        {reddit.checking || (remote && liveLoading) ? <div className="empty-state" role="status"><Leaf size={28} /><h2>Loading from Reddit…</h2><p>Your communities. Your conversations.</p></div> : remote && liveError ? <div className="empty-state" role="alert"><CircleHelp size={28} /><h2>Couldn’t load Reddit.</h2><p>{liveError}</p><button className="button" onClick={() => setRefresh(previous => previous + 1)}>Try again</button><button className="plain-button" onClick={() => setModal('account')}>Account settings</button></div> : !isKnownRoute ? <div className="empty-state"><Compass size={32} /><h1>Nothing at this address.</h1><p>{live ? "This post or community could not be found." : "This post or community isn’t in this demo."}</p><a className="button primary" href="#/home">Back to Home</a></div> : section === 'communities' ? <>
          <div className="page-heading"><h1>Your communities</h1><p>Browse your subscriptions or find a community.</p></div>
          <div className="community-toolbar"><span>{followed.length} joined · {communities.length} to explore</span><div className="community-search"><Search size={16} /><input aria-label="Filter communities" value={communitySearch} onChange={event => setCommunitySearch(event.target.value)} placeholder="Find a community" /></div></div>
          <div className="community-grid">{communities.filter(c => `${c.name} ${c.category}`.toLowerCase().includes(communitySearch.toLowerCase())).map(c => <article className="community-card" key={c.name}><div className="community-card-top"><CommunityIcon name={c.name} /><button className={`button join-button ${store.subscriptions.includes(c.name) ? 'joined' : ''}`} aria-label={`${store.subscriptions.includes(c.name) ? 'Leave' : 'Join'} r/${c.name}`} onClick={() => toggleSubscription(c.name)}>{store.subscriptions.includes(c.name) ? <><Check size={14} />Joined</> : <><Plus size={14} />Join</>}</button></div><a href={`#/r/${c.name}`}><h2>r/{c.name}</h2></a><p>{c.description}</p><div className="community-card-bottom"><span>{c.members} members</span><span>{c.category}</span></div></article>)}</div>
          {!communities.some(c => `${c.name} ${c.category}`.toLowerCase().includes(communitySearch.toLowerCase())) && <div className="empty-state"><Search size={28} /><h2>No communities found.</h2><p>Try a different name or category.</p></div>}
        </> : selectedPost ? <>
          <a className="back-link" href={`#/r/${selectedPost.community}`}><ArrowLeft size={16} />Back to r/{selectedPost.community}</a>
          <article className="post-detail">
            <div className="post-byline"><a href={`#/r/${selectedPost.community}`}><CommunityIcon name={selectedPost.community} /><strong>r/{selectedPost.community}</strong></a><span>·</span><span>{timeAgo(selectedPost.created)} ago</span><span className="detail-author">u/{selectedPost.author}</span></div>
            <h1>{selectedPost.title}</h1>{selectedPost.flair && <span className="flair">{selectedPost.flair}</span>}
            {selectedPost.image && <img className="detail-image" src={selectedPost.image} alt={`Image shared with “${selectedPost.title}”`} />}
            {selectedPost.url && <a className="external-post-link" href={selectedPost.url} target="_blank" rel="noopener noreferrer"><LinkIcon size={18} />{selectedPost.url}<ExternalLink size={15} /></a>}
            {selectedPost.body && <div className="post-body"><RedditText>{selectedPost.body}</RedditText></div>}
            <div className="detail-actions"><VoteControl horizontal id={selectedPost.id} score={selectedPost.score} vote={visibleStore.votes[selectedPost.id] || 0} onVote={vote} /><span className="detail-comments-count"><MessageCircle size={16} />{selectedPost.commentCount} comments</span><button className={store.saved.includes(selectedPost.id) ? 'is-saved' : ''} onClick={() => toggleSaved(selectedPost.id)}><Bookmark size={16} />{store.saved.includes(selectedPost.id) ? 'Saved' : 'Save'}</button><button onClick={() => share(selectedPost)}><Share2 size={16} />Share</button></div>
          </article>
          <section className="comments-section"><div className="comments-heading"><h2>The conversation</h2><span>{selectedPost.commentCount} comments</span></div><form className="comment-form" onSubmit={event => addComment(event)}><label htmlFor="comment-body">{remote && !live ? 'Sign in to comment' : <>Comment as <strong>u/{username}</strong></>}</label><textarea id="comment-body" required maxLength={10000} value={commentBody} onChange={event => setCommentBody(event.target.value)} placeholder="Add something to the conversation…" /><div className="comment-form-footer"><span>Keep it kind. Keep it human.</span><button className="button primary small-button" type="submit" disabled={!commentBody.trim() || pending.includes('comment')}><Send size={14} />Comment</button></div></form><p className="sample-note">{remote ? <>Comments are live from Reddit. {selectedPost.moreComments && <a href={selectedPost.permalink} target="_blank" rel="noopener noreferrer">Open the full thread on Reddit for additional comments.</a>}</> : 'Local demo · Sample threads include a preview of the comments. New comments stay in this browser.'}</p><div className="comment-list">{selectedPost.comments.filter(c => !c.parent).map(c => renderComment(c))}{!selectedPost.comments.length && <div className="empty-state"><MessageCircle size={28} /><h3>Start the conversation.</h3><p>Good discussions start with a little curiosity.</p></div>}</div></section>
        </> : <>
          <div className="page-heading">
            <div className="heading-title-row"><h1>{community ? `r/${community.name}` : section === 'popular' ? 'Popular' : section === 'news' ? 'News' : section === 'profile' ? `Posts by u/${username}` : section === 'saved' ? 'Saved posts' : section === 'search' ? `Results for “${query}”` : 'Home'}</h1>{community && <button className={`button join-button ${store.subscriptions.includes(community.name) ? 'joined' : ''}`} onClick={() => toggleSubscription(community.name)}>{store.subscriptions.includes(community.name) ? <><Check size={15} />Joined</> : <><Plus size={15} />Join community</>}</button>}</div>
            <p>{community ? community.description : section === 'popular' ? 'Posts from r/popular.' : section === 'news' ? 'Posts from r/news.' : section === 'profile' ? 'Your posts, directly from your Reddit account.' : section === 'saved' ? 'Posts you’ve saved.' : section === 'search' ? `${feed.length} posts found across all communities.` : 'Posts from your subscribed communities. No recommendations or ads.'}</p>
          </div>
          <div className="feed-toolbar"><div className="sort-tabs" aria-label="Sort posts">{(['New', 'Hot', 'Top'] as Sort[]).map(option => <button aria-pressed={sort === option} className={sort === option ? 'active' : ''} key={option} onClick={() => setSort(option)}>{option === 'New' ? <Sparkles size={15} /> : option === 'Hot' ? <Flame size={15} /> : <ArrowUp size={15} />}{option}</button>)}</div><div className="feed-tools"><span>{section === 'home' ? 'YOUR FEED' : community ? `${community.members} MEMBERS` : `${feed.length} POSTS`}</span><span className="toolbar-divider" /><button aria-label={compact ? 'Use comfortable view' : 'Use compact view'} aria-pressed={compact} title={compact ? 'Comfortable view' : 'Compact view'} onClick={() => setCompact(!compact)}><SlidersHorizontal size={17} /></button></div></div>
          <div className="feed">{feed.map(postRow)}{!feed.length && <div className="empty-state">{section === 'saved' ? <Bookmark size={30} /> : section === 'search' ? <Search size={30} /> : <Leaf size={30} />}<h2>{section === 'saved' ? 'Keep the good ones.' : section === 'search' ? 'Nothing here just yet.' : 'A fresh start.'}</h2><p>{section === 'saved' ? 'Save a post and it’ll be waiting right here.' : section === 'search' ? 'Try a different word or search for a community.' : 'Join a community or start a conversation of your own.'}</p><button className="button" onClick={() => go('/communities')}>Explore communities<ArrowRight size={15} /></button></div>}</div>
          {remote && after ? <div className="load-more"><button className="button" disabled={pending.includes('load-more')} onClick={nextPage}>{pending.includes('load-more') ? 'Loading…' : 'Load more posts'}<ArrowDown size={14} /></button></div> : <p className="feed-end-label">End of feed</p>}
        </>}
        <footer className="content-footer"><span>Pureddit · Independent Reddit client</span><button onClick={() => setModal('about')}>{live ? 'About Pureddit' : 'About this demo'}<ExternalLink size={11} /></button></footer>
      </main>

      <aside className="right-rail" aria-label="Feed information">
        <div className="about-card"><div className="about-card-body"><h2>{activeCommunity ? `r/${activeCommunity.name}` : 'About Pureddit'}</h2><p>{activeCommunity?.description || 'A Reddit client with a subscription-only Home feed and familiar post and comment controls.'}</p>{activeCommunity ? <div className="community-stat"><strong>{activeCommunity.members}</strong><span>community members</span></div> : null}<button className="button primary full-width" onClick={openCompose}><Plus size={16} />Create a post</button></div></div>
        <div className="small-rail-card"><div className="rail-card-heading"><h3>{activeCommunity ? 'Community guidelines' : 'Communities'}</h3></div><p>{activeCommunity ? 'Be thoughtful. Assume good intentions. Stay on topic and give people room to disagree.' : 'Manage your subscriptions or search for a subreddit.'}</p><a href="#/communities">Explore communities<ArrowRight size={14} /></a></div>
        <div className="demo-note"><span className="status-dot" /><div><strong>{live ? `Connected as u/${username}` : remote ? 'Public Reddit feed' : 'Demo mode'}</strong><p>{live ? 'Your feed and actions are connected to your Reddit account.' : remote ? 'Posts are loaded from Reddit. Sign in to vote, save, comment, or post.' : 'Votes, posts, and comments are saved in this browser, not sent to Reddit.'}</p>{!live && <button onClick={() => setModal('account')}>Sign in with Reddit<ArrowRight size={12} /></button>}<button onClick={() => setModal('about')}>About Pureddit<ChevronRight size={12} /></button></div></div>
        <div className="rail-footer"><span>Pureddit © {new Date().getFullYear()}</span></div>
      </aside>
    </div>

    {modal === 'compose' && <Modal title="Create a post" close={() => setModal(null)}><p className="modal-subtitle">Choose a community and post type.</p><form className="compose-form" onSubmit={submitPost}><label htmlFor="post-community">Community</label>{live ? <><input id="post-community" required pattern="[A-Za-z0-9_]{2,64}" list="post-communities" value={composeCommunity} onChange={event => setComposeCommunity(event.target.value)} placeholder="Community name, without r/" /><datalist id="post-communities">{communities.map(c => <option key={c.name} value={c.name} />)}</datalist></> : <select id="post-community" value={composeCommunity} onChange={event => setComposeCommunity(event.target.value)}>{communities.map(c => <option key={c.name} value={c.name}>r/{c.name}{store.subscriptions.includes(c.name) ? ' · Joined' : ''}</option>)}</select>}<div className="compose-tabs">{(['Text', 'Link'] as const).map(kind => <button type="button" className={postKind === kind ? 'active' : ''} aria-pressed={postKind === kind} key={kind} onClick={() => setPostKind(kind)}>{kind === 'Text' ? <List size={16} /> : <LinkIcon size={16} />}{kind}</button>)}</div><label htmlFor="post-title">Title <span>{composeTitle.length}/300</span></label><input id="post-title" required maxLength={300} value={composeTitle} onChange={event => setComposeTitle(event.target.value)} placeholder="Post title" />{postKind === 'Link' && <><label htmlFor="post-url">Link URL</label><input id="post-url" type="url" required value={composeUrl} onChange={event => setComposeUrl(event.target.value)} placeholder="https://" /></>}<label htmlFor="post-body">Body <span>optional</span></label><textarea id="post-body" maxLength={40000} value={composeBody} onChange={event => setComposeBody(event.target.value)} placeholder="Post text…" rows={6} />{composeError && <p className="form-error" role="alert">{composeError}</p>}<div className="compose-note"><Leaf size={16} />{live ? 'This post will be published to Reddit under your account.' : 'Local demo. Your post stays in this browser.'}</div><div className="modal-footer"><button className="button" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button primary" type="submit" disabled={!composeTitle.trim() || !composeCommunity || pending.includes('submit')}><Plus size={16} />{pending.includes('submit') ? 'Publishing…' : live ? 'Publish to Reddit' : 'Create post'}</button></div></form></Modal>}
    {modal === 'about' && <Modal title="About Pureddit" close={() => setModal(null)} className="about-modal"><p>Pureddit is an independent Reddit client. Home shows posts from your subscriptions, with separate Popular and News feeds.</p><h3>Choose how you browse</h3><p>When signed out, explore sample posts and try local demo interactions. Sign in to load your real account and send actions to Reddit. Sample scores, members, images, and discussions in demo mode are illustrative.</p><h3>Connecting to Reddit</h3><p>Use Sign in with Reddit to authorize your account on Reddit’s own website. When connected, feeds, subscriptions, votes, saves, comments, and posts use Reddit’s API. Sign-in requires the site owner’s approved Reddit app configuration. Pureddit is an independent client and is not affiliated with Reddit.</p><p className="about-privacy">Demo changes stay in this browser. When connected, Reddit stores your posts and comments, and their Reddit links work across devices.</p><button className="button primary full-width" onClick={() => setModal(null)}>Close<ArrowRight size={16} /></button></Modal>}
    {modal === 'account' && <Modal title={live ? `u/${username}` : 'Sign in to Reddit'} close={() => setModal(null)} className="account-modal">
      {reddit.error && <p className="account-error" role="alert">{reddit.error}</p>}
      {live ? <>
        <p className="account-intro">Connected to your Reddit account.</p>
        <div className="account-stats"><div><strong>{formatCount(reddit.user!.karma)}</strong><span>karma</span></div><div><strong>{store.subscriptions.length}</strong><span>communities</span></div><div><strong>{new Date(reddit.user!.created).getFullYear()}</strong><span>on Reddit since</span></div></div>
        <div className="account-links"><a href="#/profile" onClick={() => setModal(null)}>Your posts<ArrowRight size={15} /></a><a href="#/saved" onClick={() => setModal(null)}>Saved posts<Bookmark size={15} /></a><a href="#/communities" onClick={() => setModal(null)}>Your communities<ChevronRight size={15} /></a><a href={`https://www.reddit.com/user/${encodeURIComponent(username)}`} target="_blank" rel="noopener noreferrer">Full profile on Reddit<ExternalLink size={15} /></a></div>
        <button className="button full-width" disabled={pending.includes('logout')} onClick={() => { void perform('logout', async () => { const revoked = await reddit.logout(); setModal(null); go('/home'); setToast(revoked ? 'Signed out of Reddit. You’re now browsing the demo.' : 'Signed out of Pureddit. Reddit was unavailable; revoke access in Reddit’s app settings if needed.'); }); }}>{pending.includes('logout') ? 'Signing out…' : 'Sign out of Reddit'}</button>
      </> : <>
        <p className="account-intro">Connect your account to load your subscriptions, saved posts, and profile.</p><ul className="account-benefits"><li><Check size={16} />See the communities you actually follow</li><li><Check size={16} />Vote, comment, and post with your account</li><li><Check size={16} />Keep your saved posts in sync with Reddit</li></ul>
        <p className="account-privacy">You’ll sign in on Reddit’s website. Pureddit never asks for your Reddit password. Access can be revoked from your Reddit account settings.</p>
        {reddit.checking ? <p role="status" className="account-intro">Checking account service…</p> : reddit.configured ? <a className="button primary full-width" href="/api/auth/start">Continue to Reddit<ExternalLink size={16} /></a> : <div className="account-setup"><h3>Reddit sign-in is coming online</h3><p>The site owner needs to configure the Reddit app credentials before accounts can connect. You can keep exploring the demo in the meantime.</p></div>}
        <button className="plain-button full-width" onClick={() => setModal(null)}>Keep browsing</button>
      </>}
    </Modal>}
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </>;
}
