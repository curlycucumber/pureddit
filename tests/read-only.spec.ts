import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sample = (id: string, community = 'news') => ({ id, community, title: `Live post ${id}`, author: 'reader', score: 50, created: 1700000000000, commentCount: 5, comments: [], permalink: `https://www.reddit.com/r/${community}/comments/${id}/discussion` });

test('Read Only switches public feeds, sorts, paginates, and has no account actions or session requests', async ({ page, context }) => {
  const requests: string[] = []; const otherApis: string[] = [];
  await context.addCookies([{ name: 'pureddit_session', value: 'should-not-be-sent', url: 'http://127.0.0.1:5173' }]);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/read-only') { otherApis.push(url.pathname); await route.fulfill({ json: {} }); return; }
    expect(route.request().method()).toBe('GET'); expect(route.request().headers().cookie).toBeUndefined();
    requests.push(url.search);
    const id = url.searchParams.has('after') ? 'second' : 'first';
    await route.fulfill({ json: { posts: [sample(id, url.searchParams.get('feed') === 'news' ? 'news' : 'books')], after: id === 'first' ? 't3_next' : null } });
  });
  await page.goto('/#/read-only');
  await expect(page.getByRole('heading', { name: 'Read Only', exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(requests.some(query => query.includes('feed=popular') && query.includes('sort=hot'))).toBe(true);
  const title = page.getByRole('link', { name: 'Live post first', exact: true });
  await expect(title).toHaveAttribute('href', 'https://www.reddit.com/r/books/comments/first/discussion');
  await expect(title).toHaveAttribute('target', '_blank'); await expect(title).toHaveAttribute('rel', 'noopener noreferrer');
  await page.getByRole('button', { name: 'Load more posts', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Load more posts' })).toHaveCount(0);
  await page.getByRole('button', { name: 'r/news', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('r/news');
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await expect.poll(() => requests.some(query => query.includes('feed=news') && query.includes('sort=top'))).toBe(true);
  for (const name of ['Upvote', 'Downvote', 'Comment', 'Create post', 'Save post', 'Sign in with Reddit']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(page.locator('textarea,input')).toHaveCount(0);
  expect(otherApis).toEqual([]); expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('blocked public requests show an error and retry without sample posts', async ({ page }) => {
  let blocked = true;
  await page.route('**/api/read-only?**', route => route.fulfill(blocked ? { status: 403, json: { error: 'Reddit blocked this public feed request.' } } : { json: { posts: [sample('retry')], after: null } }));
  await page.goto('/#/read-only');
  await expect(page.getByRole('alert')).toContainText('Reddit blocked');
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Browse on Reddit' })).toHaveAttribute('href', 'https://www.reddit.com/r/popular/');
  blocked = false; await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Read Only handles empty feeds and mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/read-only?**', route => route.fulfill({ json: { posts: [], after: null } }));
  await page.goto('/#/read-only');
  await expect(page.getByRole('heading', { name: 'No posts returned' })).toBeVisible();
  await page.getByRole('button', { name: 'r/news', exact: true }).click();
  await expect(page).toHaveTitle('Read Only · r/news · Pureddit');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('the existing app links to Read Only and browser back returns to it', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { configured: false, authenticated: false } }));
  await page.route('**/api/read-only?**', route => route.fulfill({ json: { posts: [], after: null } }));
  await page.goto('/#/home');
  await page.getByRole('link', { name: 'Read Only', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Read Only', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Pureddit' }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Read Only', exact: true })).toBeVisible();
});

test('HTML platform failures identify the feed endpoint and HTTP status without claiming an account error', async ({ page }) => {
  await page.route('**/api/read-only?**', route => route.fulfill({
    status: 500, contentType: 'text/html', headers: { 'x-vercel-error': 'FUNCTION_INVOCATION_FAILED' },
    body: '<html><body>Internal platform error. Private diagnostic text.</body></html>',
  }));
  await page.goto('/#/read-only');
  await expect(page.getByRole('alert')).toContainText('feed endpoint');
  await expect(page.getByRole('alert')).toContainText('HTTP 500');
  await expect(page.getByRole('alert')).toContainText('FUNCTION_INVOCATION_FAILED');
  await expect(page.getByRole('alert')).not.toContainText('account service');
  await expect(page.getByRole('alert')).not.toContainText('Private diagnostic text');
  await expect(page.getByRole('article')).toHaveCount(0);
});
