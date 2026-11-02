import { test, expect } from '@playwright/test';

test('modern cards are extracted safely, deduplicated, and filtered by explicit promotion markers', async ({ page }) => {
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {extractPosts}=await import('/shared/extract.ts');
    const root=document.implementation.createHTMLDocument('').createElement('div');
    root.innerHTML=`<shreddit-post post-title="A title &lt;img src=x&gt;" subreddit-prefixed-name="r/news" author="reader" permalink="/r/news/comments/abc123/title/" score="42" comment-count="5"></shreddit-post><shreddit-post post-title="Duplicate title" subreddit-name="news" permalink="/r/news/comments/abc123/title/"></shreddit-post><shreddit-post promoted="" post-title="Paid placement" subreddit-name="news" permalink="/r/news/comments/ad1/title/"></shreddit-post><shreddit-post is-recommended="true" post-title="Recommendation" subreddit-name="books" permalink="/r/books/comments/rec1/title/"></shreddit-post><shreddit-post promoted="false" post-title="A normal post" subreddit-name="books" permalink="/r/books/comments/abc456/title/"><img slot="post-media-preview" src="javascript:alert(1)"></shreddit-post><shreddit-post post-title="Unsafe destination" subreddit-name="news" permalink="https://evil.invalid/r/news/comments/bad1/"></shreddit-post>`;
    return extractPosts(root);
  });
  expect(result.layout).toBe('modern');expect(result.filtered).toBe(2);expect(result.posts).toHaveLength(2);
  expect(result.posts[0].title).toBe('A title <img src=x>');expect(result.posts[1].thumbnail).toBeUndefined();
  expect(result.posts[0].href).toBe('https://www.reddit.com/r/news/comments/abc123/title/');
});

test('thumbnails use post media, preserve sensitive-content gates, and reject unrelated hosts', async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {extractPosts}=await import('/shared/extract.ts');const root=document.implementation.createHTMLDocument('').createElement('div');
    for(const [index,attributes,media] of [
      ['1','','<img src="https://styles.redditmedia.com/avatar.png"><div slot="post-media-container"><img src="https://preview.redd.it/photo.jpg"></div>'],
      ['2','spoiler=""','<img slot="post-media-preview" src="https://preview.redd.it/spoiler.jpg">'],
      ['3','nsfw="true"','<img slot="post-media-preview" src="https://preview.redd.it/nsfw.jpg">'],
      ['4','','<img slot="post-media-preview" src="https://unrelated.invalid/photo.jpg">'],
      ['5','','<img src="https://styles.redditmedia.com/avatar.png">'],
    ]) root.insertAdjacentHTML('beforeend',`<shreddit-post post-title="Post ${index}" subreddit-name="news" permalink="/r/news/comments/abc${index}/title/" ${attributes}>${media}</shreddit-post>`);
    return extractPosts(root).posts.map(post=>post.thumbnail ?? null);
  });
  expect(result).toEqual(['https://preview.redd.it/photo.jpg',null,null,null,null]);
});

test('old Reddit cards preserve native metadata and unsupported layouts fail visibly', async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {extractPosts}=await import('/shared/extract.ts');const root=document.implementation.createHTMLDocument('').createElement('div');
    root.innerHTML='<div class="thing link" data-fullname="t3_abc" data-subreddit="news" data-permalink="/r/news/comments/abc/title/"><a class="title">Old Reddit title</a><a class="author">reader</a><span class="score unvoted">123</span><a class="comments">45 comments</a></div>';
    return {old:extractPosts(root),empty:extractPosts(document.createElement('div'))};
  });
  expect(result.old.posts[0]).toMatchObject({title:'Old Reddit title',author:'reader',score:'123',comments:'45'});
  expect(result.empty.layout).toBe('unsupported');expect(result.empty.posts).toEqual([]);
});

test('source links, timestamps, and community icons come from native cards and reject unsafe values', async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {extractPosts}=await import('/shared/extract.ts');
    const root=document.implementation.createHTMLDocument('').createElement('div');
    root.innerHTML=`<shreddit-post post-title="Headline" subreddit-name="news" permalink="/r/news/comments/abc1/title/" content-href="https://example.org/story?section=news" created-timestamp="2026-11-02T12:00:00Z"><shreddit-subreddit-avatar><img src="https://styles.redditmedia.com/icon.png"></shreddit-subreddit-avatar></shreddit-post><shreddit-post post-title="Unsafe fields" subreddit-name="news" permalink="/r/news/comments/abc2/title/" content-href="javascript:alert(1)" created-timestamp="not-a-date"><img class="subreddit-icon" src="https://unrelated.invalid/tracking.png"></shreddit-post>`;
    const old=document.implementation.createHTMLDocument('').createElement('div');
    old.innerHTML='<div class="thing link" data-subreddit="news" data-permalink="/r/news/comments/abc3/title/"><a class="title" href="https://example.org/old-story">Old headline</a><time datetime="2026-11-02T12:00:00Z"></time></div>';
    const nativeLink=document.createElement('a');nativeLink.setAttribute('slot','full-post-link');nativeLink.setAttribute('href','/r/news/comments/abc4/title/');
    const card=root.firstElementChild!.cloneNode(true) as Element;card.removeAttribute('permalink');card.append(nativeLink);root.append(card);
    return {modern:extractPosts(root).posts,old:extractPosts(old).posts};
  });
  expect(result.modern[0]).toMatchObject({externalUrl:'https://example.org/story?section=news',createdAt:'2026-11-02T12:00:00.000Z',communityIcon:'https://styles.redditmedia.com/icon.png'});
  expect(result.modern[1].externalUrl).toBeUndefined();expect(result.modern[1].createdAt).toBeUndefined();expect(result.modern[1].communityIcon).toBeUndefined();
  expect(result.old[0]).toMatchObject({externalUrl:'https://example.org/old-story',createdAt:'2026-11-02T12:00:00.000Z'});
  expect(result.modern[2]).toMatchObject({href:'https://www.reddit.com/r/news/comments/abc4/title/',externalUrl:'https://example.org/story?section=news'});
});
