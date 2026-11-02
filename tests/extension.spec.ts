import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// This is a bundled-script harness, not an installed-extension test. The host's
// managed Chromium blocks unpacked installs. WebExtension storage is simulated.
const fixture = `<!doctype html><html><head><title>Reddit fixture</title></head><body><div id="native"><button id="native-action">Native Reddit control</button><shreddit-post post-title="A post already loaded on Reddit" subreddit-prefixed-name="r/news" author="reader" permalink="/r/news/comments/abc123/discussion/" score="42" comment-count="5"></shreddit-post><shreddit-post promoted="true" post-title="A promoted card" subreddit-name="ads" permalink="/r/ads/comments/ad123/discussion/">Native advertisement</shreddit-post></div></body></html>`;
async function harness(context: BrowserContext, homeFixture?: string) {
  await context.addInitScript(() => {
    const listeners = new Set<(value: Record<string, {newValue:unknown}>, area:string)=>void>();
    const notify = (key:string, value:unknown) => listeners.forEach(listener=>listener({[key]:{newValue:value}},'local'));
    Object.assign(globalThis,{browser:{storage:{local:{
      async get(key:string){return {[key]:JSON.parse(localStorage.getItem(key)||'null')};},
      async set(values:Record<string,unknown>){for(const [key,value] of Object.entries(values)){localStorage.setItem(key,JSON.stringify(value));queueMicrotask(()=>notify(key,value));}},
    },onChanged:{addListener(callback:(value:Record<string,{newValue:unknown}>,area:string)=>void){listeners.add(callback);}}}}});
    window.addEventListener('storage',event=>{if(event.key)notify(event.key,JSON.parse(event.newValue||'null'));});
  });
  await context.route('https://www.reddit.com/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (['popup.html','popup.js','popup.css'].includes(name)) {
      await route.fulfill({ contentType: name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html', body:await readFile(path.join('dist/extensions/chrome',name),'utf8') }); return;
    }
    await route.fulfill({contentType:'text/html',body:name === '' && homeFixture ? homeFixture : fixture});
  });
}
const inject = (page:Page)=>page.addScriptTag({path:'dist/extensions/chrome/content.js'});

test('built content harness reads native cards, updates dynamically, restores Reddit, and persists shortcuts', async({context,page})=>{
  await harness(context);const requests:string[]=[];page.on('request',request=>{if(request.url().includes('/api/'))requests.push(request.url());});
  await page.goto('https://www.reddit.com/r/news/');await inject(page);const reader=page.locator('#pureddit-extension-root');
  await expect(reader.getByRole('article')).toHaveCount(1);
  await expect(reader.getByRole('link',{name:'A post already loaded on Reddit',exact:true})).toBeVisible();
  expect(await page.locator('#native').evaluate(node=>(node as HTMLElement).inert)).toBe(true);
  await reader.getByRole('button',{name:'Old layout',exact:true}).click();
  await reader.getByRole('button',{name:'Dark mode',exact:true}).click();
  await expect(reader.locator('.rank').first()).toBeVisible();
  await reader.getByLabel('Add a shortcut',{exact:true}).fill('books');await reader.getByRole('button',{name:'Add community shortcut'}).click();
  await page.reload();await inject(page);await expect(reader.getByRole('button',{name:'Remove r/books shortcut'})).toBeVisible();
  await expect(reader.getByRole('button',{name:'Old layout',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(reader.getByRole('button',{name:'Dark mode',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(reader.locator('.reader')).toHaveAttribute('data-theme','dark');
  await page.evaluate(()=>{const post=document.createElement('shreddit-post');post.setAttribute('post-title','A newly loaded native post');post.setAttribute('subreddit-name','books');post.setAttribute('permalink','/r/books/comments/new123/title/');document.querySelector('#native')!.append(post);});
  await expect(reader.getByRole('article')).toHaveCount(2);
  await reader.getByRole('button',{name:'Show Reddit ↗',exact:true}).click();
  await expect(page.getByRole('button',{name:'Native Reddit control'})).toBeVisible();
  expect(await page.locator('#native').evaluate(node=>(node as HTMLElement).inert)).toBe(false);
  await page.getByRole('button',{name:'pureddit · Reading view'}).click();await expect(reader.getByRole('article')).toHaveCount(2);
  await page.goto('https://www.reddit.com/r/news/comments/abc123/discussion/');await inject(page);await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
  await page.evaluate(()=>history.pushState({},'', '/r/news/'));
  await expect(page.locator('#pureddit-extension-root').getByRole('article')).toHaveCount(1);
  expect(requests).toEqual([]);
});

const homeFixture = `<!doctype html><html><body>
<nav role="tablist"><button role="tab" data-native-mode="following" aria-selected="false">Following</button><button role="tab" data-native-mode="for-you" aria-selected="true">For You</button></nav>
<div id="native-feed"></div>
<template id="followed"><shreddit-post post-title="A followed community post" subreddit-name="news" permalink="/r/news/comments/home1/title/"></shreddit-post></template>
<template id="extra"><shreddit-post post-title="A For You-only community" subreddit-name="othercommunity" permalink="/r/othercommunity/comments/home2/title/"></shreddit-post><shreddit-post is-recommended="true" post-title="A suggested post" subreddit-name="books" permalink="/r/books/comments/home3/title/"></shreddit-post></template>
<template id="ad"><shreddit-post promoted="true" post-title="Paid placement" subreddit-name="advertising" permalink="/r/advertising/comments/home4/title/"></shreddit-post></template>
<script>
function render(mode){const feed=document.querySelector('#native-feed');feed.replaceChildren(document.querySelector('#followed').content.cloneNode(true));if(mode==='for-you')feed.append(document.querySelector('#extra').content.cloneNode(true));feed.append(document.querySelector('#ad').content.cloneNode(true));document.querySelectorAll('[data-native-mode]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.nativeMode===mode)));}
document.querySelectorAll('[data-native-mode]').forEach(button=>button.addEventListener('click',()=>render(button.dataset.nativeMode)));render('for-you');
</script></body></html>`;

test('Home selects native Following on the same URL, allows For You, and never shows ads', async({context,page})=>{
  await harness(context,homeFixture);await page.goto('https://www.reddit.com/');await inject(page);
  const reader=page.locator('#pureddit-extension-root');
  await expect(reader.getByRole('article')).toHaveCount(1);
  await expect(reader.getByRole('tab',{name:'Following',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-native-mode="following"]')).toHaveAttribute('aria-selected','true');
  await expect(reader.getByText('A followed community post',{exact:true})).toBeVisible();
  await reader.getByRole('tab',{name:'For You',exact:true}).click();
  await expect(reader.getByRole('article')).toHaveCount(3);
  await expect(reader.getByText('A suggested post',{exact:true})).toBeVisible();
  await expect(reader.getByText('Paid placement',{exact:true})).toHaveCount(0);
  await expect(page).toHaveURL('https://www.reddit.com/');
  await reader.getByRole('tab',{name:'Following',exact:true}).click();await expect(reader.getByRole('article')).toHaveCount(1);
});

test('Home fails closed when native Following is unavailable, instead of relabeling For You', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/');
  await page.evaluate(()=>{
    const header=document.createElement('header'), joined=document.createElement('button');joined.textContent='Following';joined.setAttribute('aria-pressed','true');header.append(joined);document.querySelector('shreddit-post')!.append(header);
  });
  await inject(page);
  const reader=page.locator('#pureddit-extension-root');
  await expect(reader.getByRole('article')).toHaveCount(0);
  await expect(reader.locator('.home-feed-status')).toContainText('Following');
  await expect(reader.getByRole('button',{name:'Load more posts'})).toBeDisabled();
  await reader.getByRole('button',{name:'Open Reddit’s feed controls'}).click();
  await expect(page.getByRole('button',{name:'Native Reddit control'})).toBeVisible();
});

test('Home hides the old feed while native selection is pending', async({context,page})=>{
  const delayed=homeFixture.replace('()=>render(button.dataset.nativeMode)', '()=>setTimeout(()=>render(button.dataset.nativeMode),900)');
  await harness(context,delayed);await page.goto('https://www.reddit.com/');await inject(page);
  const reader=page.locator('#pureddit-extension-root');
  await expect(reader.locator('.home-feed-status')).toContainText('Switching Reddit');
  await expect(reader.getByRole('article')).toHaveCount(0);
  await expect(reader.getByRole('article')).toHaveCount(1);
});

for(const community of ['popular','news']) test(`${community} is a native Reddit feed with cosmetic ad hiding that turns off cleanly`, async({context,page})=>{
  await harness(context);await page.goto(`https://www.reddit.com/r/${community}/`);
  await expect(page.locator('shreddit-post[promoted=true]')).toBeVisible();await inject(page);
  const reader=page.locator('#pureddit-extension-root');
  await expect(reader.getByRole('article')).toHaveCount(1);
  await reader.getByRole('button',{name:'Show Reddit ↗',exact:true}).click();
  await expect(page.locator('shreddit-post[promoted=true]')).toBeHidden();
  const popup=await context.newPage();await popup.goto('https://www.reddit.com/popup.html');await popup.getByLabel('Enable reading view').uncheck();
  await expect(page.locator('shreddit-post[promoted=true]')).toBeVisible();
  await expect(page.locator('#pureddit-native-ad-style')).toHaveCount(0);
  expect(await page.locator('#native').evaluate(element=>(element as HTMLElement).inert)).toBe(false);
});

test('Load more delegates to the native feed without a Pureddit API request', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/r/news/');
  await page.evaluate(()=>window.addEventListener('scroll',()=>{
    if(document.getElementById('native-more'))return;
    const post=document.createElement('shreddit-post');post.id='native-more';post.setAttribute('post-title','Loaded by the native feed');post.setAttribute('subreddit-name','news');post.setAttribute('permalink','/r/news/comments/more1/title/');document.querySelector('#native')!.append(post);
  }));
  await inject(page);const reader=page.locator('#pureddit-extension-root');
  await reader.getByRole('button',{name:'Load more posts'}).click();
  await expect(reader.getByRole('article')).toHaveCount(2);
  await expect(reader.getByText('Loaded by the native feed',{exact:true})).toBeVisible();
});

test('top-bar controls activate original Reddit controls and keep native menus usable', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/r/news/');
  await page.evaluate(()=>{
    const header=document.createElement('header');
    for(const [action,label] of [['account','Open user menu'],['notifications','Open notifications'],['create','Create post'],['navigation','Open navigation']]) {
      const button=document.createElement('button');button.setAttribute('aria-label',label);button.textContent=label;
      button.addEventListener('click',()=>{document.body.dataset.nativeAction=action;});header.append(button);
    }
    document.querySelector('#native')!.prepend(header);
  });
  await inject(page);const reader=page.locator('#pureddit-extension-root');
  for(const [name,action] of [['Account','account'],['Notifications','notifications'],['Create post','create']]) {
    await reader.getByRole('button',{name,exact:true}).click();
    expect(await page.evaluate(()=>document.body.dataset.nativeAction)).toBe(action);
    expect(await page.locator('#native').evaluate(element=>(element as HTMLElement).inert)).toBe(false);
    await expect(reader).toBeHidden();await page.getByRole('button',{name:'pureddit · Reading view'}).click();
  }
  await reader.getByRole('button',{name:'Communities',exact:true}).click();
  await reader.getByRole('button',{name:'Reddit navigation & subscriptions ↗'}).click();
  expect(await page.evaluate(()=>document.body.dataset.nativeAction)).toBe('navigation');
  await expect(reader).toBeHidden();
});

test('open shadow-root posts update, late ad labels evict cached cards, and virtualized posts stay readable', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/r/news/');
  await page.evaluate(()=>{
    const host=document.createElement('section');host.id='shadow-feed';
    host.attachShadow({mode:'open'}).innerHTML='<shreddit-post post-title="Shadow feed story" subreddit-name="news" permalink="/r/news/comments/shadow1/title/"></shreddit-post><shreddit-ad-post>Native shadow ad</shreddit-ad-post>';
    document.body.append(host);
  });
  await inject(page);const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('article')).toHaveCount(2);
  expect(await page.locator('#shadow-feed').evaluate(element=>getComputedStyle(element.shadowRoot!.querySelector('shreddit-ad-post')!).display)).toBe('none');
  await page.locator('#shadow-feed').evaluate(element=>element.setAttribute('promoted','true'));
  await expect(reader.getByText('Shadow feed story',{exact:true})).toHaveCount(0);
  await page.locator('#native shreddit-post:not([promoted])').evaluate(element=>element.remove());
  await expect(reader.getByRole('article')).toHaveCount(1);
});

test('the bundled script does not activate on unrelated sites or Reddit account pages', async({context,page})=>{
  await harness(context);await context.route('https://example.org/**',route=>route.fulfill({contentType:'text/html',body:fixture}));
  for(const url of ['https://example.org/','https://www.reddit.com/settings/']) {
    await page.goto(url);await inject(page);
    await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);await expect(page.locator('#pureddit-native-ad-style')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Native Reddit control'})).toBeVisible();
  }
});

test('built popup and content harness coordinate enable/disable through simulated extension storage', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/r/news/');await inject(page);await expect(page.locator('#pureddit-extension-root')).toBeVisible();
  const popup=await context.newPage();await popup.goto('https://www.reddit.com/popup.html');
  await expect(popup.getByLabel('Enable reading view')).toBeChecked();
  await popup.getByLabel('Enable reading view').uncheck();await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
  await popup.getByLabel('Enable reading view').check();await expect(page.locator('#pureddit-extension-root')).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('enabled');
  await page.goto('https://www.reddit.com/message/inbox/');await inject(page);await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
});

test('modern post actions share and copy real links, handle clipboard denial, and open native voting', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/r/news/');await inject(page);
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).copiedPost=text;}}});
    Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{(window as any).sharedPost=data;}});
  });
  const reader=page.locator('#pureddit-extension-root'), post=reader.getByRole('article').first();
  const href='https://www.reddit.com/r/news/comments/abc123/discussion/';
  await post.locator('.post-menu summary').click();await post.getByRole('button',{name:'Copy post link'}).click();
  await expect(reader.getByRole('status')).toHaveText('Post link copied.');
  expect(await page.evaluate(()=>(window as any).copiedPost)).toBe(href);
  await post.getByRole('button',{name:'Share post',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).sharedPost)).toEqual({title:'A post already loaded on Reddit',url:href});
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Permission denied','NotAllowedError');}}});
  });
  await post.getByRole('button',{name:'Share post',exact:true}).click();
  await expect(reader.getByRole('status')).toContainText('Copying is unavailable');
  await post.getByRole('link',{name:'Vote on Reddit, 42 points'}).click();
  await expect(page).toHaveURL(href);await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Native Reddit control'})).toBeVisible();
});
