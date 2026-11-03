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
  await page.goto('https://www.reddit.com/news');await inject(page);const reader=page.locator('#pureddit-extension-root');
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
  await page.evaluate(()=>history.pushState({},'', '/news'));
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
  await expect(reader.getByRole('tab',{name:'Your Feed',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-native-mode="following"]')).toHaveAttribute('aria-selected','true');
  await expect(reader.getByText('A followed community post',{exact:true})).toBeVisible();
  await reader.getByRole('tab',{name:'Suggested Feed',exact:true}).click();
  await expect(reader.getByRole('article')).toHaveCount(3);
  await expect(reader.getByText('A suggested post',{exact:true})).toBeVisible();
  await expect(reader.getByText('Paid placement',{exact:true})).toHaveCount(0);
  await expect(page).toHaveURL('https://www.reddit.com/');
  await reader.getByRole('tab',{name:'Your Feed',exact:true}).click();await expect(reader.getByRole('article')).toHaveCount(1);
  await reader.getByRole('button',{name:'Show Reddit ↗',exact:true}).click();
  await page.locator('[data-native-mode="for-you"]').click();
  await page.getByRole('button',{name:'pureddit · Reading view'}).click();
  await expect(reader.getByRole('article')).toHaveCount(1);
  await expect(page.locator('[data-native-mode="following"]')).toHaveAttribute('aria-selected','true');
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

test('Following does not cache stale For You cards when the tab changes before the posts arrive', async({context,page})=>{
  const delayed=homeFixture.replace('()=>render(button.dataset.nativeMode)', `()=>{document.querySelectorAll('[data-native-mode]').forEach(tab=>tab.setAttribute('aria-selected',String(tab===button)));setTimeout(()=>render(button.dataset.nativeMode),900);}`);
  await harness(context,delayed);await page.goto('https://www.reddit.com/');await inject(page);
  const reader=page.locator('#pureddit-extension-root');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false})));
  await reader.getByRole('tab',{name:'Your Feed',exact:true}).click();
  await expect(reader.locator('.home-feed-status')).toContainText('Switching Reddit');
  await expect(reader.getByRole('article')).toHaveCount(0);
  await expect(reader.getByRole('article')).toHaveCount(1);
  await expect(reader.getByText('A For You-only community',{exact:true})).toHaveCount(0);
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
  await harness(context);await page.goto('https://www.reddit.com/news');
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
  await harness(context);await page.goto('https://www.reddit.com/news');
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
    await expect(page.locator('#pureddit-native-controls').getByRole('link',{name:'pureddit home',exact:true})).toBeVisible();
    expect(await page.locator('#native').evaluate(element=>(element as HTMLElement).inert)).toBe(false);
    await expect(reader).toBeHidden();await page.getByRole('button',{name:'pureddit · Reading view'}).click();
  }
  await reader.getByRole('button',{name:'Communities',exact:true}).click();
  await reader.getByRole('button',{name:'Reddit navigation & subscriptions ↗'}).click();
  expect(await page.evaluate(()=>document.body.dataset.nativeAction)).toBe('navigation');
  await expect(reader).toBeHidden();
});

test('open shadow-root posts update, late ad labels evict cached cards, and virtualized posts stay readable', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');
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

test('late-created shadow roots are discovered without a light-DOM mutation', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');
  await page.evaluate(()=>{const host=document.createElement('section');host.id='late-root';document.body.append(host);});
  await inject(page);const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('article')).toHaveCount(1);
  // Let initial extension mutations settle before native hydration attaches a root.
  await page.waitForTimeout(250);
  await page.locator('#late-root').evaluate(element=>{element.attachShadow({mode:'open'}).innerHTML='<shreddit-post post-title="Late hydrated story" subreddit-name="news" permalink="/r/news/comments/late1/title/"></shreddit-post>';});
  await expect(reader.getByText('Late hydrated story',{exact:true})).toBeVisible();
});

test('native shadow rerenders cannot permanently remove ad filtering', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');
  await page.evaluate(()=>{
    const host=document.createElement('section');host.id='rerender-root';host.attachShadow({mode:'open'}).innerHTML='<shreddit-ad-post>Native advertisement</shreddit-ad-post>';document.body.append(host);
  });
  await inject(page);const reader=page.locator('#pureddit-extension-root');
  await reader.getByRole('button',{name:'Show Reddit ↗',exact:true}).click();
  await page.locator('#rerender-root').evaluate(element=>{element.shadowRoot!.replaceChildren(Object.assign(document.createElement('shreddit-ad-post'),{textContent:'Rerendered advertisement'}));});
  await expect.poll(()=>page.locator('#rerender-root').evaluate(element=>getComputedStyle(element.shadowRoot!.querySelector('shreddit-ad-post')!).display)).toBe('none');
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
  await harness(context);await page.goto('https://www.reddit.com/news');await inject(page);await expect(page.locator('#pureddit-extension-root')).toBeVisible();
  const popup=await context.newPage();await popup.goto('https://www.reddit.com/popup.html');
  await expect(popup.getByLabel('Enable reading view')).toBeChecked();
  await popup.getByLabel('Enable reading view').uncheck();await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
  await popup.getByLabel('Enable reading view').check();await expect(page.locator('#pureddit-extension-root')).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('enabled');
  await page.goto('https://www.reddit.com/message/inbox/');await inject(page);await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
});

test('modern post actions share and copy real links, handle clipboard denial, and open native voting', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await inject(page);
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

test('native discussion, profile, notifications and composer retain appearance with working Reddit controls', async({context,page})=>{
  await harness(context);
  for (const path of ['/r/news/comments/abc123/discussion/','/user/reader/','/notifications','/submit','/r/news/submit/']) {
    await page.goto(`https://www.reddit.com${path}`);await inject(page);
    const controls=page.locator('#pureddit-native-controls');await expect(controls).toBeVisible();
    await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
    await controls.getByRole('button',{name:'Dark mode',exact:true}).click();
    await expect(page.locator('body')).toHaveCSS('background-color','rgb(16, 18, 20)');
    await controls.getByRole('button',{name:'Old layout',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-pureddit-native','old');
    await page.evaluate(()=>{document.getElementById('native-action')!.addEventListener('click',()=>document.body.dataset.clicked='yes');});
    await page.getByRole('button',{name:'Native Reddit control',exact:true}).click();
    expect(await page.locator('body').getAttribute('data-clicked')).toBe('yes');
    expect(await page.locator('#native').evaluate(node=>(node as HTMLElement).inert)).toBe(false);
  }
  const popup=await context.newPage();await popup.goto('https://www.reddit.com/popup.html');await popup.getByLabel('Enable reading view').uncheck();
  await expect(page.locator('#pureddit-native-appearance')).toHaveCount(0);await expect(page.locator('#pureddit-native-controls')).toHaveCount(0);
});

test('unrelated native page mutations preserve existing feed cards and focused controls', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await inject(page);
  const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('article')).toHaveCount(1);
  await reader.getByRole('article').first().evaluate(node=>(node as HTMLElement).dataset.identity='preserved');
  await page.locator('#native').evaluate(node=>{node.classList.add('hover-state');node.append(document.createElement('span'));});
  await page.waitForTimeout(400);
  await expect(reader.getByRole('article').first()).toHaveAttribute('data-identity','preserved');
});

test('Home recognizes selection on wrapper tabs outside navigation and in-place card updates', async({context,page})=>{
  const custom=`<!doctype html><html><body><div><div data-selected="false" id="following"><button>Following</button></div><div data-selected="true" id="suggested"><button>For You</button></div></div><shreddit-post is-recommended="true" post-title="A native story" subreddit-name="news" permalink="/r/news/comments/home1/title/"></shreddit-post><script>document.querySelector('#following button').onclick=()=>{document.querySelector('#following').dataset.selected='true';document.querySelector('#suggested').dataset.selected='false';document.querySelector('shreddit-post').removeAttribute('is-recommended');};</script></body></html>`;
  await harness(context,custom);await page.goto('https://www.reddit.com/');await inject(page);
  const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('article')).toHaveCount(1);await expect(reader.getByText('A native story',{exact:true})).toBeVisible();
});

test('Home excludes retained hidden feed panels after a native tab switch', async({context,page})=>{
  const retained=`<!doctype html><html><body><div role="tablist"><button role="tab" aria-selected="false" id="following">Following</button><button role="tab" aria-selected="true" id="for-you">For You</button></div><div id="followed" hidden><shreddit-post post-title="Only followed content" subreddit-name="news" permalink="/r/news/comments/follow1/title/"></shreddit-post></div><div id="suggestions"><shreddit-post post-title="Retained For You card" subreddit-name="books" permalink="/r/books/comments/extra1/title/"></shreddit-post></div><script>document.querySelector('#following').onclick=()=>{setTimeout(()=>{document.querySelector('#following').setAttribute('aria-selected','true');document.querySelector('#for-you').setAttribute('aria-selected','false');document.querySelector('#followed').hidden=false;document.querySelector('#suggestions').hidden=true;},100);};</script></body></html>`;
  await harness(context,retained);await page.goto('https://www.reddit.com/');await inject(page);
  const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('article')).toHaveCount(1);
  await expect(reader.getByText('Only followed content',{exact:true})).toBeVisible();await expect(reader.getByText('Retained For You card',{exact:true})).toHaveCount(0);
});


test('Home recognizes Reddit faceplate selection markers without ARIA selection', async({context,page})=>{
  const faceplate=homeFixture.replace(/ aria-selected="(?:true|false)"/g,'').replace("button.setAttribute('aria-selected',String(button.dataset.nativeMode===mode))", "(button.toggleAttribute('faceplate-tab-selected',button.dataset.nativeMode===mode),button.classList.toggle('tab-selected',button.dataset.nativeMode===mode))");
  await harness(context,faceplate);await page.goto('https://www.reddit.com/');await inject(page);
  const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('article')).toHaveCount(1);
  await expect(page.locator('[data-native-mode="following"]')).toHaveAttribute('faceplate-tab-selected','');
  await expect(reader.getByText('A followed community post',{exact:true})).toBeVisible();
  await reader.getByRole('tab',{name:'Suggested Feed',exact:true}).click();await expect(reader.getByRole('article')).toHaveCount(3);
  await reader.getByRole('tab',{name:'Your Feed',exact:true}).click();await expect(reader.getByRole('article')).toHaveCount(1);
});

test('feed tabs survive full Reddit navigations and browser Back with the correct feed selected', async({context,page})=>{
  await harness(context,homeFixture);await page.goto('https://www.reddit.com/news');await inject(page);
  page.on('domcontentloaded',()=>{void inject(page).catch(()=>{});});
  const reader=page.locator('#pureddit-extension-root');
  for (const [name,url] of [['Home','https://www.reddit.com/'],['Popular','https://www.reddit.com/r/popular/'],['News','https://www.reddit.com/news']]) {
    await reader.locator('.primary').getByRole('link',{name,exact:true}).click();await expect(page).toHaveURL(url);
    await expect(reader.getByRole('article')).toHaveCount(1);
    await expect(reader.locator('.primary a.active')).toHaveText(name);
  }
  await page.goBack();await expect(page).toHaveURL('https://www.reddit.com/r/popular/');
  await expect(reader.getByRole('article')).toHaveCount(1);await expect(reader.locator('.primary a.active')).toHaveText('Popular');
});

test('post navigation retains the Pureddit header and native editors without reparenting them', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await inject(page);
  page.on('domcontentloaded',()=>{void inject(page).catch(()=>{});});
  await page.locator('#pureddit-extension-root').getByRole('link',{name:'A post already loaded on Reddit',exact:true}).click();
  await expect(page).toHaveURL('https://www.reddit.com/r/news/comments/abc123/discussion/');
  const shell=page.locator('#pureddit-native-controls');
  await expect(shell.getByRole('link',{name:'pureddit home',exact:true})).toBeVisible();
  await expect(shell.getByRole('button',{name:'Account',exact:true})).toBeVisible();
  await expect(shell.locator('.native-feeds').getByRole('link',{name:'Popular',exact:true})).toBeVisible();
  await page.evaluate(()=>{const editor=document.createElement('textarea');editor.setAttribute('aria-label','Native comment editor');document.querySelector('#native')!.append(editor);});
  await page.getByLabel('Native comment editor').fill('A comment kept in Reddit’s own editor');
  await shell.getByRole('button',{name:'Dark mode',exact:true}).click();
  await expect(page.getByLabel('Native comment editor')).toHaveValue('A comment kept in Reddit’s own editor');
  expect(await page.getByLabel('Native comment editor').evaluate(node=>node.parentElement?.id)).toBe('native');
  await shell.getByRole('button',{name:'Show Reddit ↗',exact:true}).click();await expect(shell).toHaveCount(0);
  await page.getByRole('button',{name:'pureddit · Reading view',exact:true}).click();
  await expect(shell.getByRole('link',{name:'pureddit home',exact:true})).toBeVisible();
  await expect(page.getByLabel('Native comment editor')).toHaveValue('A comment kept in Reddit’s own editor');
  await shell.locator('.native-feeds').getByRole('link',{name:'Popular',exact:true}).click();await expect(page).toHaveURL('https://www.reddit.com/r/popular/');
  await expect(page.locator('#pureddit-extension-root').getByRole('article')).toHaveCount(1);
});

test('slow feed navigation clears old cards and keeps destination feedback during native mutations', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await inject(page);
  let release!:()=>void; const wait=new Promise<void>(resolve=>{release=resolve;});
  await context.route('https://www.reddit.com/r/popular/',async route=>{await wait;await route.fulfill({contentType:'text/html',body:fixture});});
  try {
    // Locator assertions wait for pending navigation to commit. Inspect the old
    // document directly while the response is deliberately held instead.
    const snapshot=await page.evaluate(async()=>{
      const root=document.querySelector('#pureddit-extension-root')!.shadowRoot!;
      [...root.querySelectorAll<HTMLAnchorElement>('.primary a')].find(link=>link.textContent==='Popular')!.click();
      document.querySelector('#native')!.append(document.createElement('div'));
      await new Promise(resolve=>setTimeout(resolve,250));
      return {status:root.querySelector('.notice')?.textContent,posts:root.querySelectorAll('article').length,active:root.querySelector('.primary a.active')?.textContent};
    });
    expect(snapshot).toEqual({status:'Opening Popular on Reddit…',posts:0,active:'Popular'});
  } finally {release();}
  await page.waitForURL('https://www.reddit.com/r/popular/');
});

test('a stalled native feed exposes its real retry controls beneath Pureddit and recovers when cards arrive', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/r/popular/');
  await page.locator('shreddit-post').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
  await page.clock.install();await inject(page);await expect(page.locator('#pureddit-extension-root')).toBeVisible();
  await page.clock.fastForward(6500);
  await expect(page.locator('#pureddit-extension-root')).toBeHidden();
  const shell=page.locator('#pureddit-native-controls');await expect(shell.getByRole('link',{name:'pureddit home',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Native Reddit control',exact:true})).toBeVisible();
  await expect(shell.getByRole('status')).toContainText('live feed and retry controls');
  await page.evaluate(()=>{const post=document.createElement('shreddit-post');post.setAttribute('post-title','Native loading recovered');post.setAttribute('subreddit-name','news');post.setAttribute('permalink','/r/news/comments/recover1/title/');document.querySelector('#native')!.append(post);});
  await page.clock.runFor(200);
  await expect(page.locator('#pureddit-extension-root').getByRole('link',{name:'Native loading recovered',exact:true})).toBeVisible();
  await expect(shell).toHaveCount(0);
});

test('feed and post links use the native router without another document request or stale feed cards', async({context,page})=>{
  await harness(context,homeFixture);await page.goto('https://www.reddit.com/');
  await page.evaluate(()=>{
    const nav=document.createElement('nav');nav.id='router-links';
    for(const [name,path] of [['Home','/'],['Popular','/r/popular/'],['News','/news'],['Post','/r/news/comments/soft1/title/']]) {
      const a=document.createElement('a');a.href=path;a.textContent=name;
      a.onclick=event=>{event.preventDefault();history.pushState({},'',path);document.body.dataset.router=name;
        if(name==='Post'){document.querySelector('#native-feed')!.setAttribute('hidden','');const section=document.createElement('main');section.className='theme-light';section.innerHTML='<h1>A real native discussion</h1><textarea aria-label="Reddit editor"></textarea>';document.body.append(section);return;}
        setTimeout(()=>{document.querySelector('#native-feed')!.removeAttribute('hidden');if(name==='Home')(window as any).render('for-you');else document.querySelector('#native-feed')!.innerHTML=`<shreddit-post post-title="${name} native story" subreddit-name="${name.toLowerCase()}" permalink="/r/${name.toLowerCase()}/comments/soft1/title/"></shreddit-post>`;},200);
      };nav.append(a);
    }document.body.prepend(nav);
    const news=[...nav.querySelectorAll('a')].find(a=>a.textContent==='News')!;news.remove();
    document.addEventListener('click',event=>{const link=(event.target as Element).closest?.('a');if(link?.getAttribute('href')==='https://www.reddit.com/news'&&news.onclick)news.onclick.call(link,event as PointerEvent);});
  });
  await inject(page);const reader=page.locator('#pureddit-extension-root');
  await reader.getByRole('button',{name:'Dark mode',exact:true}).click();
  await reader.locator('.reader').evaluate(node=>node.setAttribute('data-same-reader','yes'));
  const documents:string[]=[];page.on('request',request=>{if(request.isNavigationRequest())documents.push(request.url());});
  for(const name of ['Popular','News','Home','News']) {
    await reader.locator('.primary').getByRole('link',{name,exact:true}).click();
    await expect(page.locator('body')).toHaveAttribute('data-router',name);
    await expect(reader.getByRole('article')).toHaveCount(1);
    await expect(reader.getByRole('link',{name:name==='Home'?'A followed community post':`${name} native story`,exact:true})).toBeVisible();
    await expect(reader.locator('.reader')).toHaveAttribute('data-same-reader','yes');
  }
  await reader.getByRole('link',{name:'News native story',exact:true}).click();
  const shell=page.locator('#pureddit-native-controls');await expect(shell.getByRole('link',{name:'pureddit home',exact:true})).toBeVisible();
  await page.getByLabel('Reddit editor').fill('Still using the real Reddit editor');
  await expect(page.locator('main.theme-light')).toHaveCSS('background-color','rgb(16, 18, 20)');
  await expect(page.locator('main.theme-light h1')).toHaveCSS('font-size','27px');
  expect(documents).toEqual([]);
});

test('navigation hover mutations do not repeatedly extract the feed', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await inject(page);
  await expect(page.locator('#pureddit-extension-root').getByRole('article')).toHaveCount(1);await page.waitForTimeout(250);
  await page.evaluate(()=>{
    (window as any).feedScans=0;const original=document.querySelectorAll.bind(document);
    document.querySelectorAll=((selector:string)=>{if(selector==='shreddit-post')(window as any).feedScans++;return original(selector);}) as typeof document.querySelectorAll;
    const nav=document.getElementById('native-action')!;for(let i=0;i<100;i++)nav.classList.toggle('hovered');
  });
  await page.waitForTimeout(400);expect(await page.evaluate(()=>(window as any).feedScans)).toBe(0);
});

test('Your Feed defaults on startup, same-URL Home clicks and reload after choosing Suggested Feed', async({context,page})=>{
  await harness(context,homeFixture);await page.goto('https://www.reddit.com/');await inject(page);
  const reader=page.locator('#pureddit-extension-root');
  await expect(reader.getByRole('tab',{name:'Your Feed',exact:true})).toHaveAttribute('aria-selected','true');
  await reader.getByRole('tab',{name:'Suggested Feed',exact:true}).click();await expect(reader.getByRole('article')).toHaveCount(3);
  await reader.locator('.primary').getByRole('link',{name:'Home',exact:true}).click();
  await expect(reader.getByRole('tab',{name:'Your Feed',exact:true})).toHaveAttribute('aria-selected','true');await expect(reader.getByRole('article')).toHaveCount(1);
  await reader.getByRole('tab',{name:'Suggested Feed',exact:true}).click();await page.reload();await inject(page);
  await expect(reader.getByRole('tab',{name:'Your Feed',exact:true})).toHaveAttribute('aria-selected','true');await expect(reader.getByText('A For You-only community',{exact:true})).toHaveCount(0);
});

test('Your Feed excludes unchanged suggested cards retained during a partial native transition', async({context,page})=>{
  const partial=`<!doctype html><html><body><nav role="tablist"><button role="tab" aria-selected="false" id="following">Following</button><button role="tab" aria-selected="true" id="suggested">For You</button></nav><div id="cards"><shreddit-post post-title="An old unmarked suggestion" subreddit-name="othercommunity" permalink="/r/othercommunity/comments/old1/title/"></shreddit-post></div><script>document.querySelector('#following').onclick=()=>{document.querySelector('#following').setAttribute('aria-selected','true');document.querySelector('#suggested').setAttribute('aria-selected','false');const card=document.createElement('shreddit-post');card.setAttribute('post-title','From a followed community');card.setAttribute('subreddit-name','news');card.setAttribute('permalink','/r/news/comments/new1/title/');document.querySelector('#cards').append(card);};</script></body></html>`;
  await harness(context,partial);await page.goto('https://www.reddit.com/');await inject(page);const reader=page.locator('#pureddit-extension-root');
  await expect(reader.getByRole('article')).toHaveCount(1);await expect(reader.getByText('From a followed community',{exact:true})).toBeVisible();await expect(reader.getByText('An old unmarked suggestion',{exact:true})).toHaveCount(0);
});

test('canceling a stalled feed switch restores the current feed immediately', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');
  await page.evaluate(()=>{const a=document.createElement('a');a.href='/r/popular/';a.textContent='Popular';a.onclick=e=>e.preventDefault();document.querySelector('#native')!.append(a);});
  await inject(page);const reader=page.locator('#pureddit-extension-root');
  await reader.locator('.primary').getByRole('link',{name:'Popular',exact:true}).click();
  await reader.locator('.primary').getByRole('link',{name:'News',exact:true}).click();
  await expect(reader.locator('.primary a.active')).toHaveText('News');
  await expect(reader.getByRole('link',{name:'A post already loaded on Reddit',exact:true})).toBeVisible();
  await reader.locator('.primary').getByRole('link',{name:'Popular',exact:true}).click();
  const popup=await context.newPage();await popup.goto('https://www.reddit.com/popup.html');await popup.getByLabel('Enable reading view').uncheck();
  await expect(reader).toHaveCount(0);
});

test('native routing redirects with canonical query parameters do not stall the reader', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');
  await page.evaluate(()=>{const a=document.createElement('a');a.href='/r/popular/';a.textContent='Popular';a.onclick=e=>{e.preventDefault();history.pushState({},'', '/r/popular/?feed=popular');const card=document.querySelector('shreddit-post')!;card.setAttribute('post-title','Canonical destination story');card.setAttribute('permalink','/r/news/comments/canon1/title/');};document.querySelector('#native')!.append(a);});
  await inject(page);const reader=page.locator('#pureddit-extension-root');await reader.locator('.primary').getByRole('link',{name:'Popular',exact:true}).click();
  await expect(reader.getByRole('link',{name:'Canonical destination story',exact:true})).toBeVisible();
});

test('explicit native deselection overrides stale tab-selected CSS classes', async({context,page})=>{
  await harness(context,homeFixture);await page.goto('https://www.reddit.com/');
  await page.locator('[data-native-mode=following]').evaluate(node=>node.classList.add('tab-selected'));
  await inject(page);const reader=page.locator('#pureddit-extension-root');
  await expect(page.locator('[data-native-mode=following]')).toHaveAttribute('aria-selected','true');
  await expect(reader.getByRole('article')).toHaveCount(1);
  await expect(reader.getByText('A For You-only community',{exact:true})).toHaveCount(0);
});

test('native-hidden cards are evicted from the reading cache', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await inject(page);const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('article')).toHaveCount(1);
  await page.locator('#native shreddit-post').first().evaluate(node=>{(node as HTMLElement).hidden=true;});
  await expect(reader.getByRole('article')).toHaveCount(0);
});

test('Modern uses native media without duplicating players or changing autoplay preferences', async({context,page})=>{
  const native=fixture.replace('<div id="native">','<shreddit-app><div id="native">').replace('</body>','</shreddit-app></body>');
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:native}));
  await page.goto('https://www.reddit.com/news');
  await page.evaluate(()=>{
    const post=document.querySelector('shreddit-post')!;post.innerHTML='<h2>A native video post</h2><video slot="post-media-container" autoplay muted controls></video><img slot="post-media-preview" src="https://i.redd.it/preview.jpg">';
    (window as any).originalPlayer=post.querySelector('video');(window as any).playerParent=post;(window as any).playerCalls=0;
    HTMLMediaElement.prototype.play=async()=>{(window as any).playerCalls++;};HTMLMediaElement.prototype.pause=()=>{(window as any).playerCalls++;};
  });
  await inject(page);const shell=page.locator('#pureddit-native-controls');await expect(shell).toBeVisible();await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
  await expect(page.locator('video')).toHaveAttribute('autoplay','');await shell.getByRole('button',{name:'Dark mode',exact:true}).click();
  await page.evaluate(()=>{(window as any).originalPlayer.autoplay=false;});
  await shell.getByRole('button',{name:'Old layout',exact:true}).click();await expect(page.locator('#pureddit-extension-root')).toBeVisible();
  await page.locator('#pureddit-extension-root').getByRole('button',{name:'Modern layout',exact:true}).click();await expect(shell).toBeVisible();
  expect(await page.evaluate(()=>({same:document.querySelector('video')===(window as any).originalPlayer,parent:(window as any).originalPlayer.parentElement===(window as any).playerParent,autoplay:(window as any).originalPlayer.autoplay,calls:(window as any).playerCalls}))).toEqual({same:true,parent:true,autoplay:false,calls:0});
  await expect(page.locator('video')).toHaveCount(1);await expect(page.locator('shreddit-post[promoted=true]')).toBeHidden();
});

test('native Modern Home defaults to Your Feed and filters suggestions without replacing content', async({context,page})=>{
  const native=homeFixture.replace('<body>','<body><shreddit-app>').replace('</body>','</shreddit-app></body>');
  await harness(context,native);await page.goto('https://www.reddit.com/');await inject(page);const shell=page.locator('#pureddit-native-controls');
  await expect(page.getByRole('tab',{name:'Your Feed',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-native-mode=following]')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#native-feed shreddit-post:not([data-pureddit-filtered])')).toHaveCount(1);
  await page.getByRole('tab',{name:'Suggested Feed',exact:true}).click();await expect(page.locator('#native-feed shreddit-post:not([data-pureddit-filtered])')).toHaveCount(3);
  await page.getByRole('tab',{name:'Your Feed',exact:true}).click();await expect(page.locator('#native-feed shreddit-post:not([data-pureddit-filtered])')).toHaveCount(1);
  await expect(page.locator('#native-feed shreddit-post[promoted]')).toBeHidden();
});

test('a one-card update reparses one card and preserves other rows, menu state and shortcut drafts', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');
  await page.evaluate(()=>{const host=document.getElementById('native')!;for(let i=0;i<100;i++){const post=document.createElement('shreddit-post');post.setAttribute('post-title',`Story ${i}`);post.setAttribute('subreddit-name','news');post.setAttribute('permalink',`/r/news/comments/perf${i}/title/`);post.setAttribute('score','1');host.append(post);}});
  await inject(page);const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('article')).toHaveCount(101);
  await reader.getByLabel('Add a shortcut',{exact:true}).fill('draft');await reader.getByRole('article').nth(2).locator('.post-menu summary').click();
  await page.evaluate(()=>{
    const root=document.querySelector('#pureddit-extension-root')!.shadowRoot!;(window as any).rows=[...root.querySelectorAll('article')];(window as any).parsed=0;
    const query=Element.prototype.querySelector;Element.prototype.querySelector=function(selector:string){if(selector.startsWith('img[slot="post-media-preview"]'))(window as any).parsed++;return query.call(this,selector);} as typeof query;
    document.querySelector('shreddit-post')!.setAttribute('score','999');
  });
  await expect(reader.locator('.score-number').first()).toHaveText('999');
  expect(await page.evaluate(()=>(window as any).rows.filter((node:Node)=>node.isConnected).length)).toBe(100);
  expect(await page.evaluate(()=>(window as any).parsed)).toBe(1);
  await expect(reader.getByLabel('Add a shortcut',{exact:true})).toHaveValue('draft');await expect(reader.getByRole('article').nth(2).locator('.post-menu')).toHaveAttribute('open','');
});

test('background feed updates wait for visibility and resume with current metadata', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await inject(page);const reader=page.locator('#pureddit-extension-root');await expect(reader.locator('.score-number').first()).toHaveText('42');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.querySelector('shreddit-post')!.setAttribute('score','321');});
  await page.waitForTimeout(150);await expect(reader.locator('.score-number').first()).toHaveText('42');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(reader.locator('.score-number').first()).toHaveText('321');
});

test('cached metadata updates when a native link target or text node changes', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');
  await page.evaluate(()=>{const post=document.querySelector('shreddit-post')!;post.removeAttribute('permalink');post.removeAttribute('post-title');post.innerHTML='<a slot="full-post-link" href="/r/news/comments/first1/title/"></a><h2>Initial native title</h2>';});
  await inject(page);const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('link',{name:'Initial native title',exact:true})).toBeVisible();
  await page.evaluate(()=>{document.querySelector('#native a[slot=full-post-link]')!.setAttribute('href','/r/news/comments/second1/title/');document.querySelector('#native h2')!.firstChild!.textContent='Updated native title';});
  await expect(reader.getByRole('link',{name:'Updated native title',exact:true})).toHaveAttribute('href','https://www.reddit.com/r/news/comments/second1/title/');
  // Keep previously seen cards when Reddit recycles a node for another post.
  await expect(reader.getByRole('link',{name:'Initial native title',exact:true})).toHaveAttribute('href','https://www.reddit.com/r/news/comments/first1/title/');
  await page.evaluate(()=>{document.querySelector('#native h2')!.firstChild!.textContent='Text-only metadata update';});
  await expect(reader.getByRole('link',{name:'Text-only metadata update',exact:true})).toHaveAttribute('href','https://www.reddit.com/r/news/comments/second1/title/');
  await expect(reader.getByRole('link',{name:'Updated native title',exact:true})).toHaveCount(0);
});

test('native Modern score and text updates do not rescan the feed, while ad changes still filter', async({context,page})=>{
  await harness(context);const native=fixture.replace('<div id="native">','<shreddit-app><div id="native">').replace('</body>','</shreddit-app></body>');await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:native}));await page.goto('https://www.reddit.com/news');
  await page.evaluate(()=>{document.querySelector('shreddit-post')!.innerHTML='<h2>Native title</h2>';});await inject(page);await expect(page.locator('#pureddit-native-controls')).toBeVisible();await page.waitForTimeout(150);
  const scans=await page.evaluate(async()=>{let scans=0;const query=document.querySelectorAll.bind(document);document.querySelectorAll=((s:string)=>{if(s==='shreddit-post, .thing.link')scans++;return query(s);}) as typeof query;
    const post=document.querySelector('shreddit-post')!;for(let i=0;i<4;i++){post.setAttribute('score',String(100+i));post.querySelector('h2')!.firstChild!.textContent=`Title ${i}`;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);}return scans;});
  expect(scans).toBe(0);await page.locator('#native shreddit-post').first().evaluate(node=>{(node as HTMLElement).hidden=true;});await expect(page.locator('#native shreddit-post').first()).toBeHidden();await page.locator('#native shreddit-post').first().evaluate(node=>{(node as HTMLElement).hidden=false;node.setAttribute('promoted','true');});await expect(page.locator('#native shreddit-post').first()).toBeHidden();
});

test('nested native insertions discover the added subtree once per mutation batch', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await inject(page);await expect(page.locator('#pureddit-extension-root').getByRole('article')).toHaveCount(1);await page.waitForTimeout(150);
  await page.evaluate(()=>{(window as any).subtreeScans=0;const query=Element.prototype.querySelectorAll;Element.prototype.querySelectorAll=function(s:string){if(s==='*')(window as any).subtreeScans++;return query.call(this,s);} as typeof query;let parent=document.getElementById('native')!;for(let i=0;i<100;i++){const child=document.createElement('div');parent.append(child);parent=child;}});
  await page.waitForTimeout(250);expect(await page.evaluate(()=>(window as any).subtreeScans)).toBeLessThanOrEqual(2);
});

test('disabled extension skips root discovery and restarts with fresh metadata when enabled', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await page.evaluate(()=>{localStorage.setItem('pureddit.preferences.v1',JSON.stringify({enabled:false}));(window as any).disabledScans=0;const query=Element.prototype.querySelectorAll;Element.prototype.querySelectorAll=function(s:string){if(s==='*')(window as any).disabledScans++;return query.call(this,s);} as typeof query;});
  await inject(page);await page.evaluate(()=>{document.querySelector('shreddit-post')!.setAttribute('post-title','Changed while disabled');document.querySelector('#native')!.append(document.createElement('section'));});await page.waitForTimeout(200);
  expect(await page.evaluate(()=>(window as any).disabledScans)).toBe(0);
  const popup=await context.newPage();await popup.goto('https://www.reddit.com/popup.html');await popup.getByLabel('Enable reading view').check();await expect(page.locator('#pureddit-extension-root').getByRole('link',{name:'Changed while disabled',exact:true})).toBeVisible();
});

test('new shadow hosts are checked on the next frame without waiting for the periodic probe', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/news');await page.clock.install();await inject(page);const reader=page.locator('#pureddit-extension-root');await expect(reader.getByRole('article')).toHaveCount(1);await page.clock.runFor(300);
  await page.evaluate(()=>{const host=document.createElement('section');document.getElementById('native')!.append(host);queueMicrotask(()=>{host.attachShadow({mode:'open'}).innerHTML='<shreddit-post post-title="Ready on the next frame" subreddit-name="news" permalink="/r/news/comments/fastroot1/title/"></shreddit-post>';});});
  await page.clock.runFor(100);await expect(reader.getByRole('link',{name:'Ready on the next frame',exact:true})).toBeVisible();
});

test('Modern uses one native navigation and overrides dark-profile surfaces in open shadow roots', async({context,page})=>{
  const native=homeFixture.replace('<body>','<body class="theme-dark"><shreddit-app>').replace('</body>','<reddit-header-large>Native account and search</reddit-header-large><nav><a id="native-home" href="/">Home</a></nav><aside class="bg-neutral-background-strong text-neutral-content">Sidebar</aside><section id="component"></section><fieldset aria-label="Display mode"><label><input type="radio" name="display" value="light">Light</label><label><input type="radio" name="display" value="dark" checked>Dark</label></fieldset><script>document.querySelectorAll("input[name=display]").forEach(input=>input.onchange=()=>{document.body.className="theme-"+input.value;});</script></shreddit-app></body>');
  await harness(context,native);await page.goto('https://www.reddit.com/');await page.evaluate(()=>{document.getElementById('component')!.attachShadow({mode:'open'}).innerHTML='<style>:host{--color-neutral-background-strong:#000;--color-neutral-content-strong:#eee}.panel{background:var(--color-neutral-background-strong);color:var(--color-neutral-content-strong)}</style><div class="panel"><h2>Shadow heading</h2></div>';});
  await page.locator('#native-home').evaluate(node=>node.addEventListener('click',event=>event.preventDefault()));
  await inject(page);const shell=page.locator('#pureddit-native-controls');await expect(shell.getByRole('button',{name:'Dark mode',exact:true})).toHaveAttribute('aria-pressed','true');await shell.getByRole('button',{name:'Light mode',exact:true}).click();await expect(shell.getByRole('button',{name:'Light mode',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(shell.locator('.topbar')).toBeHidden();await expect(shell.locator('.native-feeds')).toBeHidden();await expect(shell.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'Your Feed',exact:true})).toHaveCount(1);await expect(page.getByRole('tab',{name:'Suggested Feed',exact:true})).toHaveCount(1);
  await expect(page.locator('aside.bg-neutral-background-strong')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(page.locator('aside.bg-neutral-background-strong')).toHaveCSS('color','rgb(38, 52, 63)');
  await expect(page.locator('#component .panel')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(page.locator('#component h2')).toHaveCSS('color','rgb(38, 52, 63)');
  expect(await page.locator('#component').evaluate(node=>node.shadowRoot!.adoptedStyleSheets.length)).toBe(1);
  await page.getByRole('tab',{name:'Suggested Feed',exact:true}).click();await expect(page.locator('[data-native-mode=for-you]')).toHaveAttribute('aria-selected','true');await expect(page.locator('#native-feed shreddit-post:not([data-pureddit-filtered])')).toHaveCount(3);
  await page.locator('#native-home').click();await expect(page.getByRole('tab',{name:'Your Feed',exact:true})).toHaveAttribute('aria-selected','true');
  await shell.getByRole('button',{name:'Dark mode',exact:true}).click();await expect(page.locator('#component .panel')).toHaveCSS('background-color','rgb(16, 18, 20)');
  const popup=await context.newPage();await popup.goto('https://www.reddit.com/popup.html');await popup.getByLabel('Enable reading view').uncheck();await expect(page.getByRole('tab',{name:'Following',exact:true})).toBeVisible();await expect(page.locator('#component #pureddit-shadow-theme')).toHaveCount(0);expect(await page.locator('#component').evaluate(node=>node.shadowRoot!.adoptedStyleSheets.length)).toBe(0);await expect(page.locator('#component .panel')).toHaveCSS('background-color','rgb(0, 0, 0)');
});

test('Old native discussions retain classic typography, compact media, and editable Reddit forms in both themes', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/r/news/comments/old1/title/',route=>route.fulfill({contentType:'text/html',body:'<html><body><shreddit-app><main><shreddit-post><h1>Classic native post</h1><img slot="post-media-preview" src="https://i.redd.it/classic.jpg"></shreddit-post><shreddit-comment-tree><shreddit-comment>Native comment<textarea aria-label="Native reply"></textarea><button id="reply">Reply</button></shreddit-comment></shreddit-comment-tree></main></shreddit-app></body></html>'}));
  await page.goto('https://www.reddit.com/r/news/comments/old1/title/');await page.evaluate(()=>localStorage.setItem('pureddit.preferences.v1',JSON.stringify({appearance:'old'})));await inject(page);const shell=page.locator('#pureddit-native-controls');
  for(const mode of ['Light mode','Dark mode']){await shell.getByRole('button',{name:mode,exact:true}).click();await expect(page.locator('shreddit-app main h1')).toHaveCSS('font-size','20px');await expect(page.locator('shreddit-comment')).toHaveCSS('font-size','12px');await expect(page.locator('shreddit-app main button')).toHaveCSS('border-radius','2px');await expect(page.locator('img')).toHaveCSS('max-width','300px');}
  await page.getByLabel('Native reply').fill('Native draft stays editable');await shell.getByRole('button',{name:'Modern layout',exact:true}).click();await shell.getByRole('button',{name:'Old layout',exact:true}).click();await expect(page.getByLabel('Native reply')).toHaveValue('Native draft stays editable');
});

test('the single native News link opens /news even if its original router handler targets r/news', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/r/popular/',route=>route.fulfill({contentType:'text/html',body:'<html><body><shreddit-app><nav><a id="native-news" href="/r/news/">News</a></nav><shreddit-post post-title="Story" subreddit-name="news" permalink="/r/news/comments/story1/title/"></shreddit-post><script>document.querySelector("#native-news").onclick=event=>{event.preventDefault();history.pushState({},"","/r/news/");};</script></shreddit-app></body></html>'}));
  await page.goto('https://www.reddit.com/r/popular/');await inject(page);await expect(page.locator('#native-news')).toHaveAttribute('href','https://www.reddit.com/news');await expect(page.getByRole('link',{name:'News',exact:true})).toHaveCount(1);
  await page.locator('#native-news').click();await expect(page).toHaveURL('https://www.reddit.com/news');
});

test('integrated Home keeps an explanation and native controls available when Following is unavailable', async({context,page})=>{
  const native='<html><body><shreddit-app><reddit-header-large><button>Sign in to Reddit</button></reddit-header-large><shreddit-post post-title="Unconfirmed feed" subreddit-name="news" permalink="/r/news/comments/unconfirmed1/title/"><h2>Unconfirmed feed</h2></shreddit-post></shreddit-app></body></html>';
  await harness(context,native);await page.goto('https://www.reddit.com/');await inject(page);const shell=page.locator('#pureddit-native-controls');await expect(shell.getByRole('status')).toContainText('Following');await expect(page.locator('shreddit-post')).toBeHidden();
  await shell.getByRole('button',{name:'Open Reddit’s feed controls',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in to Reddit',exact:true})).toBeVisible();await expect(page.locator('shreddit-post')).toBeVisible();
});

const displayFixture=`<html><body class="theme-dark"><shreddit-app><header><button aria-label="Open user menu" aria-expanded="false" id="account">Account</button><div role="menu" id="account-menu" hidden><button aria-haspopup="listbox" aria-expanded="false" id="display">Display mode Dark</button><ul role="listbox" id="theme-list" hidden><li data-testid="theme-option-0" role="presentation"><div role="option" aria-selected="false">Automatic</div></li><li data-testid="theme-option-1" role="presentation"><div role="option" tabindex="-1" aria-selected="false"><span><svg icon-name="day-fill"></svg><span>Light</span></span></div></li><li data-testid="theme-option-2" role="presentation"><div role="option" tabindex="0" aria-selected="true"><span><svg icon-name="night"></svg><span>Dark</span></span></div></li></ul></div></header><shreddit-post post-title="Native story" subreddit-name="news" permalink="/r/news/comments/theme1/title/"><h2>Native story</h2></shreddit-post></shreddit-app><script>
const account=document.getElementById('account'),display=document.getElementById('display'),menu=document.getElementById('account-menu'),list=document.getElementById('theme-list');
account.onclick=()=>{menu.hidden=!menu.hidden;account.setAttribute('aria-expanded',String(!menu.hidden));};display.onclick=()=>{list.hidden=!list.hidden;display.setAttribute('aria-expanded',String(!list.hidden));};
function apply(mode){document.body.className='theme-'+mode;document.body.dataset.nativeDisplay=mode;display.textContent='Display mode '+mode[0].toUpperCase()+mode.slice(1);document.querySelectorAll('#theme-list [role=option]').forEach(option=>option.setAttribute('aria-selected',String(option.textContent.trim().toLowerCase()===mode)));}
localStorage.setItem('reddit:test-display',localStorage.getItem('reddit:test-display')||'dark');apply(localStorage.getItem('reddit:test-display'));window.nativeWrites=0;
document.querySelectorAll('#theme-list [role=option]').forEach(option=>option.onclick=()=>{const mode=option.textContent.trim().toLowerCase();if(mode==='automatic')throw Error('Automatic was not requested');window.nativeWrites++;localStorage.setItem('reddit:test-display',mode);apply(mode);menu.hidden=true;list.hidden=true;account.setAttribute('aria-expanded','false');display.setAttribute('aria-expanded','false');});
</script></body></html>`;

test('Pureddit theme buttons change the actual native theme-option setting and survive reload', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:displayFixture}));await page.goto('https://www.reddit.com/news');await inject(page);const shell=page.locator('#pureddit-native-controls');await expect(shell.getByRole('button',{name:'Dark mode',exact:true})).toHaveAttribute('aria-pressed','true');
  await shell.getByRole('button',{name:'Light mode',exact:true}).click();await expect(page.locator('body')).toHaveAttribute('data-native-display','light');await expect(shell.getByRole('status')).toHaveText('Reddit display mode: Light.');expect(await page.evaluate(()=>(window as any).nativeWrites)).toBe(1);expect(await page.evaluate(()=>localStorage.getItem('reddit:test-display'))).toBe('light');
  await page.reload();await inject(page);await expect(shell.getByRole('button',{name:'Light mode',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-testid=theme-option-1] [role=option]')).toHaveAttribute('aria-selected','true');
  await shell.getByRole('button',{name:'Dark mode',exact:true}).click();await expect(page.locator('body')).toHaveAttribute('data-native-display','dark');await expect(shell.getByRole('status')).toHaveText('Reddit display mode: Dark.');
});

test('native display changes synchronize the Pureddit indicator and the latest requested mode wins', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:displayFixture}));await page.goto('https://www.reddit.com/news');await inject(page);const shell=page.locator('#pureddit-native-controls');
  await page.locator('#account').click();await page.locator('#display').click();await page.locator('[data-testid=theme-option-1] [role=option]').click();await expect(shell.getByRole('button',{name:'Light mode',exact:true})).toHaveAttribute('aria-pressed','true');
  await shell.getByRole('button',{name:'Dark mode',exact:true}).click();await shell.getByRole('button',{name:'Light mode',exact:true}).click();await expect(page.locator('body')).toHaveAttribute('data-native-display','light');await expect(shell.getByRole('status')).toHaveText('Reddit display mode: Light.');
});

test('a native Display mode select saves only its scoped group', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:'<html><body class="theme-dark"><shreddit-app><fieldset aria-label="Display mode"><select aria-label="Display mode"><option value="day-setting">Light</option><option value="night-setting" selected>Dark</option></select><button id="save-theme">Save</button></fieldset><button id="unrelated">Save</button></shreddit-app><script>window.themeSaves=0;window.unrelatedSaves=0;document.querySelector("#save-theme").onclick=()=>{window.themeSaves++;document.body.className=document.querySelector("select").value==="day-setting"?"theme-light":"theme-dark";};document.querySelector("#unrelated").onclick=()=>window.unrelatedSaves++;</script></body></html>'}));await page.goto('https://www.reddit.com/news');await inject(page);const shell=page.locator('#pureddit-native-controls');await shell.getByRole('button',{name:'Light mode',exact:true}).click();await expect(shell.getByRole('status')).toHaveText('Reddit display mode: Light.');expect(await page.evaluate(()=>(window as any).themeSaves)).toBe(1);expect(await page.evaluate(()=>(window as any).unrelatedSaves)).toBe(0);
});

test('unavailable native display controls never report a successful profile change', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:'<html><body class="theme-dark"><shreddit-app><h1>Native Reddit without an accessible display menu</h1></shreddit-app></body></html>'}));await page.goto('https://www.reddit.com/news');await inject(page);const shell=page.locator('#pureddit-native-controls');await shell.getByRole('button',{name:'Light mode',exact:true}).click();await expect(shell.getByRole('status')).toContainText('Reddit did not confirm Light');await expect(shell.getByRole('button',{name:'Dark mode',exact:true})).toHaveAttribute('aria-pressed','true');await expect(shell.getByRole('link',{name:'Open Reddit display settings (new tab)',exact:true})).toHaveAttribute('href','https://www.reddit.com/settings/preferences');await expect(page.locator('body')).toHaveClass('theme-dark');
});

test('disabling cancels a pending display-menu traversal and re-enabling follows Reddit', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:displayFixture}));await page.goto('https://www.reddit.com/news');await page.evaluate(()=>{document.getElementById('display')!.onclick=()=>{document.getElementById('display')!.setAttribute('aria-expanded','true');(window as any).releaseThemeMenu=()=>{document.getElementById('theme-list')!.hidden=false;};};});await inject(page);const shell=page.locator('#pureddit-native-controls');await shell.getByRole('button',{name:'Light mode',exact:true}).click();await expect(page.locator('#display')).toHaveAttribute('aria-expanded','true');
  const popup=await context.newPage();await popup.goto('https://www.reddit.com/popup.html');await popup.getByLabel('Enable reading view').uncheck();await expect(shell).toHaveCount(0);await page.evaluate(()=>(window as any).releaseThemeMenu());await page.waitForTimeout(200);expect(await page.evaluate(()=>(window as any).nativeWrites)).toBe(0);await expect(page.locator('body')).toHaveClass('theme-dark');
  await popup.getByLabel('Enable reading view').check();await expect(shell.getByRole('button',{name:'Dark mode',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('display synchronization never clicks matching poll choices inside a post', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:'<html><body class="theme-dark"><shreddit-app><shreddit-post><fieldset aria-label="Display mode"><label><input type="radio" name="poll" onclick="window.pollVotes++">Light</label><label><input type="radio" name="poll" onclick="window.pollVotes++">Dark</label></fieldset></shreddit-post></shreddit-app><script>window.pollVotes=0;</script></body></html>'}));await page.goto('https://www.reddit.com/news');await inject(page);const shell=page.locator('#pureddit-native-controls');await shell.getByRole('button',{name:'Light mode',exact:true}).click();await expect(shell.getByRole('status')).toContainText('Reddit did not confirm Light');expect(await page.evaluate(()=>(window as any).pollVotes)).toBe(0);
});

test('native save errors are not reported as profile success even after optimistic selection', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:displayFixture}));await page.goto('https://www.reddit.com/news');await page.evaluate(()=>{(document.querySelector('[data-testid=theme-option-1] [role=option]') as HTMLElement).onclick=()=>{document.querySelector('[data-testid=theme-option-1] [role=option]')!.setAttribute('aria-selected','true');document.body.className='theme-light';const alert=document.createElement('div');alert.setAttribute('role','alert');alert.textContent='Could not save display mode';const toast=document.createElement('section');toast.attachShadow({mode:'open'}).append(alert);document.body.append(toast);};});await inject(page);const shell=page.locator('#pureddit-native-controls');await shell.getByRole('button',{name:'Light mode',exact:true}).click();await expect(shell.getByRole('status')).toContainText('Reddit did not confirm Light');expect(await page.evaluate(()=>localStorage.getItem('reddit:test-display'))).toBe('dark');
});

test('an unchanged dark page is not proof that Automatic changed to the explicit Dark preference', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:displayFixture}));await page.goto('https://www.reddit.com/news');await page.evaluate(()=>{localStorage.setItem('reddit:test-display','automatic');document.getElementById('display')!.textContent='Display mode Automatic';document.querySelectorAll('#theme-list [role=option]').forEach(option=>option.setAttribute('aria-selected',String(option.parentElement!.getAttribute('data-testid')==='theme-option-0')));(document.querySelector('[data-testid=theme-option-2] [role=option]') as HTMLElement).onclick=()=>{};});await inject(page);const shell=page.locator('#pureddit-native-controls');await shell.getByRole('button',{name:'Dark mode',exact:true}).click();await expect(shell.getByRole('status')).toContainText('Reddit did not confirm Dark');expect(await page.evaluate(()=>localStorage.getItem('reddit:test-display'))).toBe('automatic');
});

test('a disabled required Save button cannot turn an unsaved display selection into success', async({context,page})=>{
  await harness(context);await context.route('https://www.reddit.com/news',route=>route.fulfill({contentType:'text/html',body:'<html><body class="theme-dark"><shreddit-app><fieldset aria-label="Display mode"><select aria-label="Display mode"><option value="light">Light</option><option value="dark" selected>Dark</option></select><button disabled>Save</button></fieldset></shreddit-app></body></html>'}));await page.goto('https://www.reddit.com/news');await inject(page);const shell=page.locator('#pureddit-native-controls');await shell.getByRole('button',{name:'Light mode',exact:true}).click();await expect(shell.getByRole('status')).toContainText('Reddit did not confirm Light');await expect(shell.getByRole('button',{name:'Dark mode',exact:true})).toHaveAttribute('aria-pressed','true');
});
