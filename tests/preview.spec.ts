import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('preview shares the reader, supports all three targets, and never calls a backend', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiCalls.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Popular', exact: true })).toBeVisible();
  await expect(page.locator('#reader-host').getByRole('article')).toHaveCount(7);
  await page.getByRole('button', { name: 'Chrome · desktop' }).click();
  await expect(page.getByRole('button', { name: 'Chrome · desktop' })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button', { name: 'Safari · iPhone' }).click();
  await expect(page.locator('.device-frame')).toHaveClass(/iphone/);
  await page.locator('#reader-host').getByRole('link', { name: 'News', exact: true }).click();
  await expect(page.locator('#reader-host').getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'r/news', exact: true })).toBeVisible();
  await page.locator('#reader-host').getByRole('button',{name:'Old layout',exact:true}).click();
  await expect(page.locator('#reader-host').getByRole('article')).toHaveCount(1);
  expect(apiCalls).toEqual([]);
});

test('shortcuts, five recent communities, preview persistence, and scoped legacy cleanup work', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('initialized')) { localStorage.setItem('pureddit:v1','old demo'); localStorage.setItem('pureddit:recent:old','[]'); localStorage.setItem('unrelated','keep'); sessionStorage.setItem('initialized','yes'); }
  });
  await page.goto('/');
  const reader = page.locator('#reader-host');
  await reader.getByLabel('Add a shortcut', { exact: true }).fill('books');
  await reader.getByRole('button', { name: 'Add community shortcut' }).click();
  await expect(reader.getByRole('button', { name: 'Remove r/books shortcut' })).toBeVisible();
  await page.reload(); await expect(reader.getByRole('button', { name: 'Remove r/books shortcut' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pureddit:v1'))).toBe(null);
  expect(await page.evaluate(() => localStorage.getItem('unrelated'))).toBe('keep');
  for (const name of ['Design','technology','photography','books']) await reader.locator('.pins').getByRole('link', { name: `r/${name}`, exact: true }).click();
  await reader.getByRole('link', { name: 'News', exact: true }).click();
  await reader.locator('.pins').getByRole('link', { name: 'r/books', exact: true }).click();
  await expect(reader.locator('.recent a')).toHaveCount(5);
  await expect(reader.locator('.recent a').first()).toHaveText('r/books');
  await reader.getByRole('button', { name: 'Remove r/books shortcut' }).click();
  await expect(reader.getByRole('button', { name: 'Remove r/books shortcut' })).toHaveCount(0);
});

test('old appearance visibly changes density and navigation, persists, and switches back', async ({ page }) => {
  await page.goto('/');
  const reader=page.locator('#reader-host'), firstPost=reader.getByRole('article').first();
  const modernPost=await firstPost.boundingBox(), modernSidebar=await reader.locator('.sidebar').boundingBox();
  expect(modernSidebar!.x).toBeLessThan(modernPost!.x);
  await expect(reader.locator('.rank').first()).toBeHidden();
  const title=await reader.locator('.post-title').first().textContent();
  await page.locator('#reader-host').getByRole('button',{name:'Old layout',exact:true}).click();
  const oldPost=await firstPost.boundingBox(), oldSidebar=await reader.locator('.sidebar').boundingBox();
  expect(oldPost!.height).toBeLessThan(modernPost!.height * 0.75);
  expect(oldSidebar!.x).toBeGreaterThan(oldPost!.x+oldPost!.width);
  await expect(reader.locator('.rank').first()).toHaveText('1');
  await expect(reader.locator('.rank').first()).toBeVisible();
  await expect(reader.locator('.classic-navigation').getByRole('link',{name:'Popular',exact:true})).toBeVisible();
  expect((await reader.locator('.thumbnail').first().boundingBox())!.width).toBe(60);
  await expect(reader.locator('.post-title').first()).toHaveText(title!);
  await page.reload();await expect(page.locator('#reader-host').getByRole('button',{name:'Old layout',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(reader.locator('.reader')).toHaveAttribute('data-appearance','old');
  await page.locator('#reader-host').getByRole('button',{name:'Modern layout',exact:true}).click();
  await expect(reader.locator('.rank').first()).toBeHidden();
  await expect(reader.locator('.sidebar').getByRole('link',{name:'Popular',exact:true})).toBeVisible();
  expect((await firstPost.boundingBox())!.height).toBe(modernPost!.height);
});

test('modern cards use the reference hierarchy and working menus without simulating account actions', async ({page}) => {
  await page.goto('/');
  const reader=page.locator('#reader-host'), post=reader.getByRole('article').first();
  const meta=await post.locator('.meta').boundingBox(), title=await post.locator('h2').boundingBox();
  const image=await post.locator('.thumbnail').boundingBox(), footer=await post.locator('.details').boundingBox();
  expect(meta!.y+meta!.height).toBeLessThan(title!.y);
  expect(image!.x).toBeGreaterThan(title!.x+title!.width);
  expect(footer!.y).toBeGreaterThan(image!.y+image!.height);
  expect(await post.locator('h2').evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(20);
  await expect(post.locator('.post-time')).toContainText('hr. ago');
  await expect(post.locator('.source-link')).toHaveAttribute('href','https://example.org/reading/design/');
  await expect(post.getByRole('link',{name:'Join or manage r/Design on Reddit'})).toHaveAttribute('href','https://www.reddit.com/r/Design/');
  for(const link of [post.getByRole('link',{name:'Vote on Reddit, 1248 points'}),post.getByRole('link',{name:'86 comments',exact:true})]) {
    const destination=new URL((await link.getAttribute('href'))!,page.url());
    expect(destination.origin).toBe(new URL(page.url()).origin);
    expect(new URLSearchParams(destination.hash.slice(1)).get('post')).toBe('t3_sample0');
  }
  await post.locator('.post-menu summary').click();
  await expect(post.getByRole('button',{name:'Copy post link'})).toBeVisible();
  await post.getByRole('button',{name:'Copy post link'}).click();
  await expect(reader.getByRole('status')).toContainText('real posts');
  await expect(post.locator('.post-menu')).not.toHaveAttribute('open');
  await post.getByRole('button',{name:'Share post',exact:true}).click();
  await expect(reader.getByRole('status')).toContainText('Sharing is available for real posts');
});

test('preview exposes Following and For You with keyboard navigation and honest native action previews', async({page})=>{
  await page.goto('/');const reader=page.locator('#reader-host');
  await reader.getByRole('link',{name:'Home',exact:true}).click();
  await expect(reader.getByRole('article')).toHaveCount(3);
  await reader.getByRole('tab',{name:'Your Feed',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await expect(reader.getByRole('tab',{name:'Suggested Feed',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(reader.getByRole('article')).toHaveCount(7);
  await reader.getByRole('button',{name:'Notifications',exact:true}).click();await expect(page.locator('.preview-message')).toContainText('does not connect to a Reddit account');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

for (const appearance of ['modern','old']) for (const colorScheme of ['light','dark']) test(`${appearance} ${colorScheme} mobile controls and accessibility work without horizontal overflow`, async ({ page }) => {
  await page.setViewportSize({ width:390,height:844 }); await page.goto('/');
  await page.locator('#reader-host').getByRole('button',{name:appearance === 'old'?'Old layout':'Modern layout',exact:true}).click();
  await page.locator('#reader-host').getByRole('button',{name:colorScheme === 'dark'?'Dark mode':'Light mode',exact:true}).click();
  await page.getByRole('button', { name:'Safari · iPhone' }).click();
  const reader=page.locator('#reader-host');
  await reader.getByRole('button',{name:'Communities',exact:true}).click();
  await expect(reader.getByLabel('Add a shortcut', { exact:true })).toBeVisible();
  await reader.getByRole('button',{name:'Communities',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('top-of-page layout and theme controls work together and persist after reload', async({page})=>{
  await page.goto('/');const reader=page.locator('#reader-host');
  expect((await reader.locator('.view-controls').boundingBox())!.y).toBeLessThan((await reader.locator('main h1').boundingBox())!.y);
  await reader.getByRole('button',{name:'Old layout',exact:true}).click();
  await reader.getByRole('button',{name:'Dark mode',exact:true}).click();
  await expect(reader.locator('.reader')).toHaveAttribute('data-appearance','old');
  await expect(reader.locator('.reader')).toHaveAttribute('data-theme','dark');
  expect(await reader.locator('main').evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(16, 18, 20)');
  await page.reload();
  await expect(reader.getByRole('button',{name:'Old layout',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(reader.getByRole('button',{name:'Dark mode',exact:true})).toHaveAttribute('aria-pressed','true');
  await reader.getByRole('button',{name:'Modern layout',exact:true}).click();
  await expect(reader.locator('.reader')).toHaveAttribute('data-theme','dark');
  await reader.getByRole('button',{name:'Light mode',exact:true}).click();
  expect(await reader.locator('main').evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
});

test('sample links are clearly simulated and all development packages can be downloaded', async ({ page, request }) => {
  await page.goto('/');
  await page.locator('#reader-host').locator('.post-title').first().click();
  await expect(page.locator('#reader-host').locator('.reader')).toHaveAttribute('data-view', 'discussion');
  await expect(page.locator('#reader-host').getByText(/Sample discussion/).first()).toBeVisible();
  // Downloads are generated into the production build rather than Vite's dev public directory.
  for (const browser of ['chrome','firefox','safari']) {
    const link = page.getByRole('link',{name: browser==='safari'?'Safari source ↓':`${browser==='chrome'?'Chrome':'Firefox'} package ↓`});
    await expect(link).toHaveAttribute('href',`/downloads/pureddit-${browser}.zip`);
  }
});

test('preview reload defaults Home to Your Feed even after explicitly choosing Suggested Feed', async({page})=>{
  await page.goto('/');const reader=page.locator('#reader-host');await reader.getByRole('link',{name:'Home',exact:true}).click();
  await reader.getByRole('tab',{name:'Suggested Feed',exact:true}).click();await expect(reader.getByRole('article')).toHaveCount(7);
  await page.reload();await expect(reader.getByRole('tab',{name:'Your Feed',exact:true})).toHaveAttribute('aria-selected','true');await expect(reader.getByRole('article')).toHaveCount(3);
});

test('Modern image posts expand below the title while outbound articles keep their side preview', async({page})=>{
  await page.goto('/');const reader=page.locator('#reader-host');
  const image=reader.locator('.post').filter({has:page.getByRole('link',{name:'Early mornings in the mountains. Worth every minute.',exact:true})});
  const article=reader.locator('.post').filter({has:page.getByRole('link',{name:'The quiet beauty of everyday objects, designed to last.',exact:true})});
  const title=await image.locator('h2').boundingBox(), media=await image.locator('.thumbnail').boundingBox();expect(media!.y).toBeGreaterThanOrEqual(title!.y+title!.height);expect(media!.width).toBeGreaterThan(400);
  expect((await article.locator('.thumbnail').boundingBox())!.width).toBe(148);
});
