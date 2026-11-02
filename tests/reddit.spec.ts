import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Community, Post } from '../src/data';

const profile = { id: 'acct1', name: 'real_reader', karma: 1250, created: 1400000000000 };
const joined: Community = { name: 'knitting', label: 'kn', description: 'People who make things.', members: '100,000', color: '#637254', background: '#e8eee0', category: 'Reddit community', redditName: 't5_knit' };
const makePost = (id = 'abc123'): Post => ({ id, redditName: `t3_${id}`, community: 'knitting', title: `A real account post ${id}`, author: 'real_reader', score: 49, vote: 1, saved: false, created: Date.now(), commentCount: 1, body: 'A **thoughtful** post with a [source](https://example.com).', permalink: `https://www.reddit.com/r/knitting/comments/${id}`, comments: [{ id: 'def456', redditName: 't1_def456', author: 'another_reader', body: 'What a lovely project.', score: 4, created: Date.now() }] });

async function connected(page: Page, options: { failVote?: boolean; failFeed?: boolean } = {}) {
  const writes: Record<string, unknown>[] = [];
  let authenticated = true;
  let subscriptions = [joined];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/session') { await route.fulfill({ json: { configured: true, authenticated, user: authenticated ? profile : undefined } }); return; }
    if (url.pathname === '/api/auth/logout') { authenticated = false; await route.fulfill({ json: { signedOut: true, revoked: true } }); return; }
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON(); writes.push(data);
      if (data.action === 'subscribe') subscriptions = data.join ? [joined] : [];
      if (data.action === 'vote' && options.failVote) { await route.fulfill({ status: 403, json: { error: 'Reddit denied this vote.' } }); return; }
      if (data.action === 'comment') await route.fulfill({ json: { comment: { id: 'reply1', redditName: 't1_reply1', author: 'real_reader', body: data.text, score: 0, vote: 1, created: Date.now() } } });
      else if (data.action === 'submit') await route.fulfill({ json: { id: 'new123' } });
      else await route.fulfill({ json: { success: true } });
      return;
    }
    const resource = url.searchParams.get('resource');
    if (resource === 'subscriptions' || resource === 'communities') await route.fulfill({ json: { communities: subscriptions } });
    else if (resource === 'community') await route.fulfill({ json: { community: joined, subscribed: true } });
    else if (resource === 'post') await route.fulfill({ json: { post: makePost(url.searchParams.get('id')!) } });
    else if (options.failFeed) await route.fulfill({ status: 429, json: { error: 'Reddit’s rate limit was reached. Please wait a minute.' } });
    else await route.fulfill({ json: { posts: [makePost(url.searchParams.has('after') ? 'next123' : 'abc123')], after: url.searchParams.has('after') ? null : 't3_next123' } });
  });
  await page.goto('/');
  return writes;
}

test('unconfigured sign-in is honest and never collects Reddit passwords', async ({ page }) => {
  await page.goto('/');
  await page.locator('.header-actions').getByRole('button', { name: 'Sign in with Reddit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reddit sign-in is coming online' })).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Continue to Reddit' })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('configured sign-in offers Reddit authorization and handles callback errors', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { configured: true, authenticated: false } }));
  await page.goto('/?auth_error=denied#/home');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('cancelled Reddit authorization');
  await expect(page.getByRole('link', { name: 'Continue to Reddit' })).toHaveAttribute('href', '/api/auth/start');
  expect(page.url()).not.toContain('auth_error');
});

test('connected account replaces demo content, shows all communities, and pages live posts', async ({ page }) => {
  await connected(page);
  await expect(page.getByTestId('post')).toHaveCount(1);
  await expect(page.getByTestId('post')).toContainText('A real account post abc123');
  await expect(page.locator('.sidebar .community-nav')).toHaveCount(1);
  await expect(page.locator('.sidebar .community-nav')).toContainText('r/knitting');
  await expect(page.getByRole('button', { name: 'Account for real_reader' })).toBeVisible();
  await page.getByRole('button', { name: 'Load more posts' }).click();
  await expect(page.getByTestId('post')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Load more posts' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Account for real_reader' }).click();
  await expect(page.getByRole('dialog')).toContainText('1.3k');
  await expect(page.getByRole('dialog')).toContainText('2014');
  await page.getByRole('dialog').getByRole('link', { name: 'Your posts' }).click();
  await expect(page.getByRole('heading', { name: 'Posts by u/real_reader.' })).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain('redditName'); expect(storage).not.toContain('access_token'); expect(storage).not.toContain('A real account post');
});

test('account votes, saves, subscriptions, comments, and posts use authenticated API actions', async ({ page }) => {
  const writes = await connected(page);
  const row = page.getByTestId('post');
  await row.getByRole('button', { name: 'Upvote', exact: true }).click();
  await expect(row.getByLabel('49 points')).toBeVisible();
  expect(writes.at(-1)).toEqual({ action: 'vote', id: 't3_abc123', direction: 0 });
  await row.getByRole('button', { name: 'Save post', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Unsave post' })).toBeVisible();
  expect(writes.at(-1)).toEqual({ action: 'save', id: 't3_abc123' });
  await page.locator('.post-title').click();
  await expect(page.locator('.post-body strong')).toHaveText('thoughtful');
  await expect(page.locator('.post-body a')).toHaveAttribute('rel', 'noopener noreferrer');
  await page.getByLabel('Comment as').fill('A real comment');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Comment by real_reader', exact: true })).toContainText('A real comment');
  expect(writes.at(-1)).toEqual({ action: 'comment', id: 't3_abc123', text: 'A real comment' });
  await page.getByRole('article', { name: 'Comment by another_reader' }).getByRole('button', { name: 'Reply', exact: true }).click();
  await page.getByLabel('Your reply').fill('A reply on Reddit');
  await page.locator('.reply-form').getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.locator('.nested-comment')).toContainText('A reply on Reddit');
  expect(writes.at(-1)).toEqual({ action: 'comment', id: 't1_def456', text: 'A reply on Reddit' });
  await page.getByRole('link', { name: 'All communities', exact: true }).click();
  await page.getByRole('button', { name: 'Leave r/knitting' }).click();
  await expect(page.getByRole('button', { name: 'Join r/knitting', exact: true })).toBeVisible();
  expect(writes.at(-1)).toEqual({ action: 'subscribe', community: 'knitting', join: false });
  await page.locator('.header-actions').getByRole('button', { name: 'Create post' }).click();
  await page.getByLabel('Community', { exact: true }).fill('knitting');
  await page.getByLabel('Title', { exact: false }).fill('A new real post');
  await page.getByLabel('Body', { exact: false }).fill('A real post body');
  await page.getByRole('button', { name: 'Publish to Reddit' }).click();
  await expect(page.getByRole('heading', { name: 'A real account post new123' })).toBeVisible();
  expect(writes.at(-1)).toMatchObject({ action: 'submit', community: 'knitting', title: 'A new real post', text: 'A real post body', kind: 'self' });
});

test('failed Reddit writes do not change votes or fall back to local success', async ({ page }) => {
  await connected(page, { failVote: true });
  const row = page.getByTestId('post');
  await expect(row.getByLabel('50 points')).toBeVisible();
  await row.getByRole('button', { name: 'Downvote', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Reddit denied this vote.');
  await expect(row.getByLabel('50 points')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Upvote', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('failed live feeds show the actual error and never show demo posts', async ({ page }) => {
  await connected(page, { failFeed: true });
  await expect(page.getByRole('alert')).toContainText('rate limit');
  await expect(page.getByTestId('post')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('mobile account access is visible and sign-out restores the separate demo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connected(page);
  await page.getByRole('button', { name: 'Account for real_reader' }).click();
  await expect(page.getByRole('dialog')).toContainText('Connected to your Reddit account.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Sign out of Reddit', exact: true }).click();
  await expect(page.getByTestId('post')).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
