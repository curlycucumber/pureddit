import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDown, ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import type { Post } from './data';
import { timeAgo } from './data';
import { request } from './reddit';
import './read-only.css';

type Feed = 'popular' | 'news';
type Sort = 'hot' | 'new' | 'top';
type Listing = { posts: Post[]; after: string | null; access?: 'app-oauth' | 'public-json' };

function redditLink(post: Post) {
  try { const url = new URL(post.permalink || ''); if (url.protocol === 'https:' && ['www.reddit.com', 'reddit.com'].includes(url.hostname)) return url.href; } catch { /* Construct a safe Reddit fallback. */ }
  return `https://www.reddit.com/comments/${encodeURIComponent(post.id)}`;
}

export default function ReadOnlyPage() {
  const [feed, setFeed] = useState<Feed>('popular');
  const [sort, setSort] = useState<Sort>('hot');
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<Listing>({ posts: [], after: null });
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const moreRequest = useRef<AbortController | null>(null);
  const morePending = useRef(false);

  useEffect(() => {
    document.title = `Read Only · r/${feed} · Pureddit`;
    const controller = new AbortController();
    moreRequest.current?.abort(); morePending.current = false;
    setLoading(true); setMoreLoading(false); setError(''); setMoreError(''); setData({ posts: [], after: null });
    request<Listing>(`/api/read-only?${new URLSearchParams({ feed, sort })}`, { credentials: 'omit', signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); moreRequest.current?.abort(); };
  }, [feed, sort, reload]);

  async function loadMore() {
    if (!data.after || morePending.current) return;
    const controller = new AbortController(); moreRequest.current = controller;
    morePending.current = true; setMoreLoading(true); setMoreError('');
    try {
      const value = await request<Listing>(`/api/read-only?${new URLSearchParams({ feed, sort, after: data.after })}`, { credentials: 'omit', signal: controller.signal });
      if (!controller.signal.aborted) setData(previous => ({ posts: [...previous.posts, ...value.posts.filter(post => !previous.posts.some(item => item.id === post.id))], after: value.after, access: value.access }));
    } catch (error) { if (!controller.signal.aborted) setMoreError(error instanceof Error ? error.message : 'Could not load more posts.'); }
    finally { if (!controller.signal.aborted) { morePending.current = false; setMoreLoading(false); } }
  }

  return <>
    <a className="skip-link" href="#reader-main" onClick={event => { event.preventDefault(); document.getElementById('reader-main')?.focus(); }}>Skip to feed</a>
    <header className="app-header reader-header">
      <a href="#/home" className="brand" aria-label="Pureddit home"><span className="brand-symbol">p<span /></span><span>pure<span className="brand-light">ddit</span><span className="brand-period">.</span></span></a>
      <a href="#/home" className="reader-back"><ArrowLeft size={15} />Back to Pureddit</a>
    </header>
    <main className="reader-shell" id="reader-main" tabIndex={-1}>
      <div className="reader-heading"><div><span className="reader-test-label">Test page</span><h1>Read Only</h1><p>Browse r/popular and r/news. Posts open on Reddit.</p></div><Newspaper size={27} aria-hidden="true" /></div>
      <p className="reader-notice">No Reddit account connection, voting, commenting, or posting. This reader uses app-authorized access when configured, or tests public feeds otherwise. Reddit API approval is still required for app access.</p>
      <nav className="reader-feed-tabs" aria-label="Choose feed">{(['popular', 'news'] as Feed[]).map(value => <button key={value} aria-pressed={feed === value} onClick={() => setFeed(value)}>r/{value}</button>)}</nav>
      <div className="reader-toolbar"><div className="sort-tabs" aria-label="Sort posts">{(['hot', 'new', 'top'] as Sort[]).map(value => <button key={value} aria-pressed={sort === value} className={sort === value ? 'active' : ''} onClick={() => setSort(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div><div className="reader-tools"><span>{sort === 'top' ? 'Top this week' : `r/${feed}`}</span><button className="icon-button" aria-label="Refresh feed" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} /></button></div></div>
      {loading ? <div className="empty-state" role="status"><h2>Loading r/{feed}…</h2><p>Requesting posts from Reddit.</p></div> : error ? <div className="reader-error" role="alert"><h2>Couldn’t load r/{feed}</h2><p>{error}</p><div><button className="button" onClick={() => setReload(value => value + 1)}>Try again</button><a className="button" href={`https://www.reddit.com/r/${feed}/`} target="_blank" rel="noopener noreferrer">Browse on Reddit<ExternalLink size={14} /></a></div></div> : <>
        <section className="feed reader-feed" aria-label={`r/${feed} posts`}>
          {data.posts.map(post => <article className="reader-post" key={post.id}>
            {post.image && <img className="reader-thumbnail" src={post.image} alt="" loading="lazy" />}
            <div className="reader-post-content"><div className="reader-post-meta"><a href={`https://www.reddit.com/r/${encodeURIComponent(post.community)}/`} target="_blank" rel="noopener noreferrer">r/{post.community}</a><span>·</span><span>u/{post.author}</span><span>·</span><time dateTime={new Date(post.created).toISOString()}>{timeAgo(post.created)} ago</time></div><h2><a className="post-title" href={redditLink(post)} target="_blank" rel="noopener noreferrer">{post.title}</a></h2>{post.flair && <span className="flair">{post.flair}</span>}</div>
            <a className="reader-open" href={redditLink(post)} target="_blank" rel="noopener noreferrer" aria-label={`Open on Reddit: ${post.title}`}><ExternalLink size={17} /></a>
          </article>)}
          {!data.posts.length && <div className="empty-state"><h2>No posts returned</h2><p>Try another sort order or refresh the feed.</p></div>}
        </section>
        {moreError && <p className="reader-more-error" role="alert">{moreError}</p>}
        {data.after ? <div className="load-more"><button className="button" onClick={loadMore} disabled={moreLoading}>{moreLoading ? 'Loading…' : 'Load more posts'}<ArrowDown size={15} /></button></div> : data.posts.length > 0 && <p className="feed-end-label">End of feed</p>}
      </>}
      <footer className="content-footer"><span>Pureddit · Read Only test{data.access && ` · ${data.access === 'app-oauth' ? 'App-authorized' : 'Public JSON'}`}</span><span>Access remains subject to Reddit’s permissions and rate limits.</span></footer>
    </main>
  </>;
}
