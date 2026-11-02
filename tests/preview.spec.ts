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
  await page.getByLabel('Page layout').selectOption('old');
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

test('mobile community controls and preview accessibility work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width:390,height:844 }); await page.goto('/');
  await page.getByRole('button', { name:'Safari · iPhone' }).click();
  const reader=page.locator('#reader-host');
  await reader.getByRole('button',{name:'Communities',exact:true}).click();
  await expect(reader.getByLabel('Add a shortcut', { exact:true })).toBeVisible();
  await reader.getByRole('button',{name:'Communities',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});

test('sample links are clearly simulated and all development packages can be downloaded', async ({ page, request }) => {
  await page.goto('/');
  await page.locator('#reader-host').locator('.post-title').first().click();
  await expect(page.locator('.preview-message')).toContainText('not live Reddit posts');
  // Downloads are generated into the production build rather than Vite's dev public directory.
  for (const browser of ['chrome','firefox','safari']) {
    const link = page.getByRole('link',{name: browser==='safari'?'Safari source ↓':`${browser==='chrome'?'Chrome':'Firefox'} package ↓`});
    await expect(link).toHaveAttribute('href',`/downloads/pureddit-${browser}.zip`);
  }
});
