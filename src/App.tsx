import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, Check, ChevronDown,
  ChevronRight, CircleHelp, Compass, ExternalLink, Flame, Home,
  Leaf, Link as LinkIcon, List, Menu, MessageCircle, Newspaper,
  Plus, Search, Send, Share2, SlidersHorizontal, Sparkles, Trash2, X,
} from 'lucide-react';
import { communities, formatCount, getCommunity, initialPosts, initialSubscriptions, timeAgo, type Comment, type Post } from './data';

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
  const [store, setStore] = useState(loadStore);
  const [route, setRoute] = useState(currentRoute);
  const [sort, setSort] = useState<Sort>('New');
  const [compact, setCompact] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [communitySearch, setCommunitySearch] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState<'compose' | 'about' | null>(null);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [postKind, setPostKind] = useState<'Text' | 'Link'>('Text');
  const [composeCommunity, setComposeCommunity] = useState(store.subscriptions[0] || communities[0].name);
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [store]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const section = route.split('/')[1];
  const communityName = section === 'r' ? route.split('/')[2] : undefined;
  const community = communityName ? communities.find(c => c.name === communityName) : undefined;
  const selectedPost = section === 'post' ? store.posts.find(p => p.id === route.split('/')[2]) : undefined;
  const query = section === 'search' ? route.slice('/search/'.length) : '';
  const activeCommunity = selectedPost ? getCommunity(selectedPost.community) : community;

  useEffect(() => {
    const name = activeCommunity?.name;
    if (name) setStore(previous => {
      if (previous.recent[0] === name) return previous;
      return { ...previous, recent: [name, ...previous.recent.filter(item => item !== name)].slice(0, 5) };
    });
  }, [activeCommunity?.name]);
  useEffect(() => {
    document.title = `${selectedPost?.title || (community ? `r/${community.name}` : section === 'home' ? 'Your home' : section.charAt(0).toUpperCase() + section.slice(1))} · PUREDDIT`;
  }, [selectedPost?.title, community, section]);

  function vote(id: string, direction: Vote) {
    setStore(previous => ({ ...previous, votes: { ...previous.votes, [id]: previous.votes[id] === direction ? 0 : direction } }));
  }
  function toggleSaved(id: string) {
    setStore(previous => ({ ...previous, saved: previous.saved.includes(id) ? previous.saved.filter(item => item !== id) : [...previous.saved, id] }));
  }
  function toggleSubscription(name: string) {
    const leaving = store.subscriptions.includes(name);
    setStore(previous => ({ ...previous, subscriptions: leaving ? previous.subscriptions.filter(item => item !== name) : [...previous.subscriptions, name] }));
    setToast(leaving ? `Left r/${name}. Your Home feed has been updated.` : `Joined r/${name}. Welcome to your Home feed.`);
  }
  function openCompose() {
    setComposeCommunity(activeCommunity?.name || store.subscriptions[0] || communities[0].name);
    setComposeError(''); setModal('compose');
  }
  async function share(post: Post) {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/post/${post.id}`); setToast(post.author === 'you' ? 'Local post link copied. This post is available only in this browser.' : 'Post link copied. Sample posts open in other demo sessions.'); }
    catch { setToast('Copy the post link from your browser’s address bar.'); go(`/post/${post.id}`); }
  }
  function addComment(event: FormEvent, parent?: string) {
    event.preventDefault();
    const body = (parent ? replyBody : commentBody).trim();
    if (!body || !selectedPost) return;
    const comment: Comment = { id: crypto.randomUUID(), author: 'you', body, score: 1, created: Date.now(), parent };
    setStore(previous => ({ ...previous, posts: previous.posts.map(p => p.id === selectedPost.id ? { ...p, comments: [...p.comments, comment], commentCount: p.commentCount + 1 } : p) }));
    setCommentBody(''); setReplyBody(''); setReplyTo(null); setToast('Your comment was added to this local demo.');
  }
  function deleteComment(id: string) {
    if (!selectedPost) return;
    setStore(previous => ({ ...previous, posts: previous.posts.map(p => p.id === selectedPost.id ? { ...p, comments: p.comments.map(c => c.id === id ? { ...c, author: '[deleted]', body: '[deleted]' } : c) } : p) }));
  }
  function submitPost(event: FormEvent) {
    event.preventDefault();
    if (!composeTitle.trim()) { setComposeError('Give your post a title.'); return; }
    if (postKind === 'Link') {
      try { const url = new URL(composeUrl); if (!['https:', 'http:'].includes(url.protocol)) throw new Error(); }
      catch { setComposeError('Enter a complete http:// or https:// URL.'); return; }
    }
    const post: Post = { id: crypto.randomUUID(), community: composeCommunity, title: composeTitle.trim(), body: composeBody.trim(), url: postKind === 'Link' ? composeUrl : undefined, author: 'you', score: 1, created: Date.now(), comments: [], commentCount: 0, flair: postKind === 'Link' ? 'Link' : 'Discussion' };
    setStore(previous => ({ ...previous, posts: [post, ...previous.posts] }));
    setComposeTitle(''); setComposeBody(''); setComposeUrl(''); setModal(null); setSort('New'); go(`/post/${post.id}`);
    setToast('Post created in this local demo. It has not been published to Reddit.');
  }

  let feed = store.posts.filter(p => section === 'popular' ? true : section === 'news' ? p.news : section === 'r' ? p.community === community?.name : section === 'saved' ? store.saved.includes(p.id) : section === 'search' ? `${p.title} ${p.body || ''} ${p.community}`.toLowerCase().includes(query.toLowerCase()) : store.subscriptions.includes(p.community));
  feed = [...feed].sort((a, b) => sort === 'New' ? b.created - a.created : sort === 'Top' ? (b.score + (store.votes[b.id] || 0)) - (a.score + (store.votes[a.id] || 0)) : (b.score + (store.votes[b.id] || 0)) / Math.pow((Date.now() - b.created) / 3600000 + 2, 1.8) - (a.score + (store.votes[a.id] || 0)) / Math.pow((Date.now() - a.created) / 3600000 + 2, 1.8));
  const followed = communities.filter(c => store.subscriptions.includes(c.name));
  const isKnownRoute = ['home', 'popular', 'news', 'saved', 'search', 'communities'].includes(section) || !!community || !!selectedPost;

  function communityLink(name: string, recent = false) {
    return <a className={`community-nav ${communityName === name ? 'selected' : ''}`} href={`#/r/${name}`} key={name}>
      <CommunityIcon name={name} small /><span>r/{name}</span>{recent && <span className="recent-dot" />}
    </a>;
  }
  function postRow(post: Post) {
    return <article className={`post-row ${compact ? 'compact' : ''}`} key={post.id} data-testid="post" aria-label={post.title}>
      <VoteControl id={post.id} score={post.score} vote={store.votes[post.id] || 0} onVote={vote} />
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
          {post.author === 'you' && <button aria-label="Delete your post" onClick={() => { setStore(previous => ({ ...previous, posts: previous.posts.filter(p => p.id !== post.id), saved: previous.saved.filter(id => id !== post.id) })); setToast('Your local post was deleted.'); }}><Trash2 size={14} /></button>}
        </div>
      </div>
      <a href={`#/post/${post.id}`} className="row-arrow" aria-label={`Open ${post.title}`}><ChevronRight size={17} /></a>
    </article>;
  }
  function renderComment(comment: Comment, depth = 0): ReactNode {
    const deleted = comment.author === '[deleted]';
    return <article className={`comment ${depth ? 'nested-comment' : ''}`} key={comment.id} aria-label={`Comment by ${comment.author}`}>
      <div className="comment-meta"><span className={`avatar ${comment.author === 'you' ? 'you-avatar' : ''}`}>{comment.author === 'you' ? 'y' : comment.author.slice(0, 1)}</span><strong>u/{comment.author}</strong>{comment.author === 'you' && <span className="you-label">you</span>}<span>· {timeAgo(comment.created)} ago</span></div>
      <p>{comment.body}</p>
      {!deleted && <div className="comment-actions"><VoteControl horizontal id={comment.id} score={comment.score} vote={store.votes[comment.id] || 0} onVote={vote} /><button onClick={() => { setReplyTo(replyTo === comment.id ? null : comment.id); setReplyBody(''); }}><MessageCircle size={14} />Reply</button>{comment.author === 'you' && <button aria-label="Delete your comment" onClick={() => deleteComment(comment.id)}><Trash2 size={14} />Delete</button>}</div>}
      {replyTo === comment.id && <form className="reply-form" onSubmit={event => addComment(event, comment.id)}><label className="sr-only" htmlFor="reply-body">Your reply</label><textarea id="reply-body" autoFocus required maxLength={10000} value={replyBody} onChange={event => setReplyBody(event.target.value)} placeholder={`Reply to u/${comment.author}…`} /><div><button className="plain-button" type="button" onClick={() => setReplyTo(null)}>Cancel</button><button className="button primary small-button" disabled={!replyBody.trim()} type="submit">Reply</button></div></form>}
      {selectedPost?.comments.filter(c => c.parent === comment.id).map(c => renderComment(c, depth + 1))}
    </article>;
  }

  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to feed</a>
    <header className="app-header">
      <div className="brand-area"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu size={22} /></button><a href="#/home" className="brand" aria-label="PUREDDIT home"><span className="brand-symbol">p<span /></span><span>pure<span className="brand-light">ddit</span><span className="brand-period">.</span></span></a></div>
      <form className="search-form" role="search" onSubmit={event => { event.preventDefault(); if (searchInput.trim()) go(`/search/${encodeURIComponent(searchInput.trim())}`); }}><Search size={17} /><input ref={searchRef} aria-label="Search posts and communities" placeholder="Search something worth reading" value={searchInput} onChange={event => setSearchInput(event.target.value)} /><kbd>/</kbd><button type="submit" className="sr-only">Search</button></form>
      <div className="header-actions"><button className="button create-button" onClick={openCompose}><Plus size={17} /><span>Create post</span></button><span className="header-divider" /><button className="profile-button" onClick={() => setModal('about')} aria-label="Local demo account"><span className="avatar you-avatar">y</span><span className="profile-text">u/you<small>Local demo</small></span><ChevronDown size={14} /></button></div>
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
      <section className="sidebar-section"><div className="sidebar-section-heading"><h2>Your communities <span>{followed.length}</span></h2><a className="icon-button" href="#/communities" aria-label="Manage communities"><Plus size={16} /></a></div>{followed.slice(0, 9).map(c => communityLink(c.name))}<a href="#/communities" className={`all-communities ${section === 'communities' ? 'selected' : ''}`}><span>All communities</span><ArrowRight size={14} /></a></section>
      <div className="sidebar-rule" />
      <nav className="secondary-nav"><a href="#/saved" className={section === 'saved' ? 'selected' : ''}><Bookmark size={17} />Saved posts{store.saved.length > 0 && <span>{store.saved.length}</span>}</a><button onClick={() => setModal('about')}><CircleHelp size={17} />About PUREDDIT</button></nav>
      <div className="sidebar-bottom"><Leaf size={18} strokeWidth={1.4} /><p>A little less internet.<br /><strong>A little more community.</strong></p><span>Independent. Intentional. Uncluttered.</span></div>
    </aside>

    <div className="workspace">
      {storageError && <div className="storage-warning" role="alert">Browser storage is unavailable. Changes will last for this session only.</div>}
      <main className="main-content" id="main-content" tabIndex={-1}>
        {!isKnownRoute ? <div className="empty-state"><Compass size={32} /><h1>Nothing at this address.</h1><p>This post or community isn’t in this demo.</p><a className="button primary" href="#/home">Back to Home</a></div> : section === 'communities' ? <>
          <div className="page-heading"><span className="eyebrow">FIND YOUR PEOPLE</span><h1>Your communities<span className="orange-dot">.</span></h1><p>A good feed starts with places you actually want to be.</p></div>
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
            {selectedPost.body && <div className="post-body">{selectedPost.body.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>}
            <div className="detail-actions"><VoteControl horizontal id={selectedPost.id} score={selectedPost.score} vote={store.votes[selectedPost.id] || 0} onVote={vote} /><span className="detail-comments-count"><MessageCircle size={16} />{selectedPost.commentCount} comments</span><button className={store.saved.includes(selectedPost.id) ? 'is-saved' : ''} onClick={() => toggleSaved(selectedPost.id)}><Bookmark size={16} />{store.saved.includes(selectedPost.id) ? 'Saved' : 'Save'}</button><button onClick={() => share(selectedPost)}><Share2 size={16} />Share</button></div>
          </article>
          <section className="comments-section"><div className="comments-heading"><h2>The conversation</h2><span>{selectedPost.commentCount} comments</span></div><form className="comment-form" onSubmit={event => addComment(event)}><label htmlFor="comment-body">Comment as <strong>u/you</strong></label><textarea id="comment-body" required maxLength={10000} value={commentBody} onChange={event => setCommentBody(event.target.value)} placeholder="Add something to the conversation…" /><div className="comment-form-footer"><span>Keep it kind. Keep it human.</span><button className="button primary small-button" type="submit" disabled={!commentBody.trim()}><Send size={14} />Comment</button></div></form><p className="sample-note">Local demo · Sample threads include a preview of the comments. New comments stay in this browser.</p><div className="comment-list">{selectedPost.comments.filter(c => !c.parent).map(c => renderComment(c))}{!selectedPost.comments.length && <div className="empty-state"><MessageCircle size={28} /><h3>Start the conversation.</h3><p>Good discussions start with a little curiosity.</p></div>}</div></section>
        </> : <>
          <div className="page-heading">
            <div className="eyebrow">{community ? 'YOUR PEOPLE, YOUR PLACE' : section === 'popular' ? 'A WIDER PERSPECTIVE' : section === 'news' ? 'STAY IN THE KNOW' : section === 'saved' ? 'WORTH COMING BACK TO' : section === 'search' ? 'A LITTLE EXPLORATION' : 'LESS NOISE. MORE OF WHAT YOU LOVE.'}</div>
            <div className="heading-title-row"><h1>{community ? `r/${community.name}` : section === 'popular' ? 'The bigger picture' : section === 'news' ? 'What’s happening' : section === 'saved' ? 'Set aside for later' : section === 'search' ? `Results for “${query}”` : 'Your corner of Reddit'}<span className="orange-dot">.</span></h1>{community && <button className={`button join-button ${store.subscriptions.includes(community.name) ? 'joined' : ''}`} onClick={() => toggleSubscription(community.name)}>{store.subscriptions.includes(community.name) ? <><Check size={15} />Joined</> : <><Plus size={15} />Join community</>}</button>}</div>
            <p>{community ? community.description : section === 'popular' ? 'Discover the conversations people are gathering around.' : section === 'news' ? 'News and perspectives. Make room for the whole story.' : section === 'saved' ? 'Good reads, on your own time.' : section === 'search' ? `${feed.length} posts found across all communities.` : 'Just the communities you follow. Nothing more, nothing less.'}</p>
          </div>
          {section === 'home' && <div className="welcome-strip"><span className="welcome-icon"><Leaf size={18} strokeWidth={1.5} /></span><p><strong>A feed that feels like yours.</strong><span>No suggested posts. No ads. Just good conversations.</span></p><span className="welcome-tag"><span />Refreshingly simple</span></div>}
          <div className="feed-toolbar"><div className="sort-tabs" aria-label="Sort posts">{(['New', 'Hot', 'Top'] as Sort[]).map(option => <button aria-pressed={sort === option} className={sort === option ? 'active' : ''} key={option} onClick={() => setSort(option)}>{option === 'New' ? <Sparkles size={15} /> : option === 'Hot' ? <Flame size={15} /> : <ArrowUp size={15} />}{option}</button>)}</div><div className="feed-tools"><span>{section === 'home' ? 'YOUR FEED' : community ? `${community.members} MEMBERS` : `${feed.length} POSTS`}</span><span className="toolbar-divider" /><button aria-label={compact ? 'Use comfortable view' : 'Use compact view'} aria-pressed={compact} title={compact ? 'Comfortable view' : 'Compact view'} onClick={() => setCompact(!compact)}><SlidersHorizontal size={17} /></button></div></div>
          <div className="feed">{feed.map(postRow)}{!feed.length && <div className="empty-state">{section === 'saved' ? <Bookmark size={30} /> : section === 'search' ? <Search size={30} /> : <Leaf size={30} />}<h2>{section === 'saved' ? 'Keep the good ones.' : section === 'search' ? 'Nothing here just yet.' : 'A fresh start.'}</h2><p>{section === 'saved' ? 'Save a post and it’ll be waiting right here.' : section === 'search' ? 'Try a different word or search for a community.' : 'Join a community or start a conversation of your own.'}</p><button className="button" onClick={() => go('/communities')}>Explore communities<ArrowRight size={15} /></button></div>}</div>
          <div className="feed-end"><span /><Leaf size={16} /><span /></div><p className="feed-end-label">You’re all caught up. Go enjoy the rest of your day.</p>
        </>}
        <footer className="content-footer"><span>Reddit, with room to breathe.</span><button onClick={() => setModal('about')}>About this demo<ExternalLink size={11} /></button></footer>
      </main>

      <aside className="right-rail" aria-label="Feed information">
        <div className="about-card"><div className="about-illustration"><div className="sun" /><div className="hill hill-back" /><div className="hill hill-front" /><Leaf className="hill-leaf" size={38} strokeWidth={1} /></div><div className="about-card-body"><span className="eyebrow">{activeCommunity ? 'ABOUT THE COMMUNITY' : 'WELCOME TO A QUIETER CORNER'}</span><h2>{activeCommunity ? `r/${activeCommunity.name}` : 'Less, but better.'}</h2><p>{activeCommunity?.description || 'The good parts of Reddit, without the distractions. Built around the things you choose to follow.'}</p>{activeCommunity ? <div className="community-stat"><strong>{activeCommunity.members}</strong><span>community members</span></div> : <div className="our-principles"><span><Check size={14} />Your communities, your feed</span><span><Check size={14} />No ads or recommendations</span><span><Check size={14} />Conversations come first</span></div>}<button className="button primary full-width" onClick={openCompose}><Plus size={16} />Create a post</button></div></div>
        <div className="small-rail-card"><div className="rail-card-heading"><h3>{activeCommunity ? 'A few ground rules' : 'Make yourself at home'}</h3><Leaf size={16} /></div><p>{activeCommunity ? 'Be thoughtful. Assume good intentions. Stay on topic and give people room to disagree.' : 'Your feed is only as good as the communities in it. Find a few that feel like you.'}</p><a href="#/communities">Explore communities<ArrowRight size={14} /></a></div>
        <div className="demo-note"><span className="status-dot" /><div><strong>You’re exploring a local demo</strong><p>Votes, posts, and comments are saved in this browser, not sent to Reddit.</p><button onClick={() => setModal('about')}>A little more about PUREDDIT<ChevronRight size={12} /></button></div></div>
        <div className="rail-footer"><span>Made for people, not algorithms.</span><span>PUREDDIT © {new Date().getFullYear()}</span></div>
      </aside>
    </div>

    {modal === 'compose' && <Modal title="Start a conversation" close={() => setModal(null)}><p className="modal-subtitle">A thought, a question, something worth sharing.</p><form className="compose-form" onSubmit={submitPost}><label htmlFor="post-community">Community</label><select id="post-community" value={composeCommunity} onChange={event => setComposeCommunity(event.target.value)}>{communities.map(c => <option key={c.name} value={c.name}>r/{c.name}{store.subscriptions.includes(c.name) ? ' · Joined' : ''}</option>)}</select><div className="compose-tabs">{(['Text', 'Link'] as const).map(kind => <button type="button" className={postKind === kind ? 'active' : ''} aria-pressed={postKind === kind} key={kind} onClick={() => setPostKind(kind)}>{kind === 'Text' ? <List size={16} /> : <LinkIcon size={16} />}{kind}</button>)}</div><label htmlFor="post-title">Title <span>{composeTitle.length}/300</span></label><input id="post-title" required maxLength={300} value={composeTitle} onChange={event => setComposeTitle(event.target.value)} placeholder="Give your post a thoughtful title" />{postKind === 'Link' && <><label htmlFor="post-url">Link URL</label><input id="post-url" type="url" required value={composeUrl} onChange={event => setComposeUrl(event.target.value)} placeholder="https://" /></>}<label htmlFor="post-body">Body <span>optional</span></label><textarea id="post-body" maxLength={40000} value={composeBody} onChange={event => setComposeBody(event.target.value)} placeholder="Tell us a little more…" rows={6} />{composeError && <p className="form-error" role="alert">{composeError}</p>}<div className="compose-note"><Leaf size={16} />Local demo. Your post stays in this browser.</div><div className="modal-footer"><button className="button" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button primary" type="submit" disabled={!composeTitle.trim()}><Plus size={16} />Create post</button></div></form></Modal>}
    {modal === 'about' && <Modal title="A little less internet." close={() => setModal(null)} className="about-modal"><span className="about-modal-icon"><Leaf size={30} strokeWidth={1.3} /></span><p>PUREDDIT is an independent, minimalist Reddit client concept. A familiar place to read, share, and talk — with the noise turned down.</p><h3>This is a working local prototype</h3><p>Browse sample posts, join communities, vote, save, comment, and create posts. Changes are stored in this browser. Sample scores, members, images, and discussions are illustrative.</p><h3>Connecting to Reddit</h3><p>This version is not connected to Reddit or affiliated with it. Real feeds, subscriptions, voting, comments, and posting require approved Reddit API access and account authorization. There is no login or credential collection in this demo.</p><p className="about-privacy">Browser data is local to this origin. Shared links to posts you create won’t transfer their content to another browser.</p><button className="button primary full-width" onClick={() => setModal(null)}>Make yourself at home<ArrowRight size={16} /></button></Modal>}
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </>;
}
