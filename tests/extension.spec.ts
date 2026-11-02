import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// This is a bundled-script harness, not an installed-extension test. The host's
// managed Chromium blocks unpacked installs. WebExtension storage is simulated.
const fixture = `<!doctype html><html><head><title>Reddit fixture</title></head><body><div id="native"><button id="native-action">Native Reddit control</button><shreddit-post post-title="A post already loaded on Reddit" subreddit-prefixed-name="r/news" author="reader" permalink="/r/news/comments/abc123/discussion/" score="42" comment-count="5"></shreddit-post><shreddit-post promoted="true" post-title="A promoted card" subreddit-name="ads" permalink="/r/ads/comments/ad123/discussion/"></shreddit-post></div></body></html>`;
async function harness(context: BrowserContext) {
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
    await route.fulfill({contentType:'text/html',body:fixture});
  });
}
const inject = (page:Page)=>page.addScriptTag({path:'dist/extensions/chrome/content.js'});

test('built content harness reads native cards, updates dynamically, restores Reddit, and persists shortcuts', async({context,page})=>{
  await harness(context);const requests:string[]=[];page.on('request',request=>{if(request.url().includes('/api/'))requests.push(request.url());});
  await page.goto('https://www.reddit.com/r/news/');await inject(page);const reader=page.locator('#pureddit-extension-root');
  await expect(reader.getByRole('article')).toHaveCount(1);
  await expect(reader.getByRole('link',{name:'A post already loaded on Reddit',exact:true})).toBeVisible();
  expect(await page.locator('#native').evaluate(node=>(node as HTMLElement).inert)).toBe(true);
  await reader.getByLabel('Reading layout').selectOption('old');
  await expect(reader.locator('.rank').first()).toBeVisible();
  await reader.getByLabel('Add a shortcut',{exact:true}).fill('books');await reader.getByRole('button',{name:'Add community shortcut'}).click();
  await page.reload();await inject(page);await expect(reader.getByRole('button',{name:'Remove r/books shortcut'})).toBeVisible();
  await expect(reader.getByLabel('Reading layout')).toHaveValue('old');
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

test('built popup and content harness coordinate enable/disable through simulated extension storage', async({context,page})=>{
  await harness(context);await page.goto('https://www.reddit.com/r/news/');await inject(page);await expect(page.locator('#pureddit-extension-root')).toBeVisible();
  const popup=await context.newPage();await popup.goto('https://www.reddit.com/popup.html');
  await expect(popup.getByLabel('Enable reading view')).toBeChecked();
  await popup.getByLabel('Enable reading view').uncheck();await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
  await popup.getByLabel('Enable reading view').check();await expect(page.locator('#pureddit-extension-root')).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('enabled');
  await page.goto('https://www.reddit.com/message/inbox/');await inject(page);await expect(page.locator('#pureddit-extension-root')).toHaveCount(0);
});
