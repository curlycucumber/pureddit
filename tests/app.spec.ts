import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('Home includes only followed communities; joining and leaving updates it persistently', async ({ page }) => {
  await expect(page.getByTestId('post')).toHaveCount(9);
  await expect(page.getByTestId('post').filter({ hasText: 'No signal, no plans.' })).toHaveCount(0);
  await page.getByRole('link', { name: 'All communities', exact: true }).click();
  await page.getByRole('button', { name: 'Join r/Outdoors', exact: true }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('post')).toHaveCount(10);
  await expect(page.getByTestId('post').filter({ hasText: 'No signal, no plans.' })).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('post')).toHaveCount(10);
  await page.getByRole('link', { name: 'All communities', exact: true }).click();
  await page.getByRole('button', { name: 'Leave r/Outdoors', exact: true }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('post')).toHaveCount(9);
});

test('Popular and News are distinct feeds, and Top changes ordering', async ({ page }) => {
  await page.getByRole('link', { name: 'Popular', exact: true }).click();
  await expect(page.getByTestId('post')).toHaveCount(12);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await expect(page.getByTestId('post').first()).toContainText('No signal, no plans.');
  await page.getByRole('link', { name: 'News', exact: true }).click();
  await expect(page.getByTestId('post')).toHaveCount(2);
  await expect(page.getByTestId('post').first()).toContainText('worldnews');
});

test('votes toggle, switch direction, and persist; saved posts can be removed', async ({ page }) => {
  const post = page.getByTestId('post').filter({ hasText: 'Maybe the internet' });
  await post.getByRole('button', { name: 'Upvote', exact: true }).click();
  await expect(post.getByLabel('893 points')).toBeVisible();
  await post.getByRole('button', { name: 'Downvote', exact: true }).click();
  await expect(post.getByLabel('891 points')).toBeVisible();
  await post.getByRole('button', { name: 'Downvote', exact: true }).click();
  await expect(post.getByLabel('892 points')).toBeVisible();
  await post.getByRole('button', { name: 'Upvote', exact: true }).click();
  await post.getByRole('button', { name: 'Save post', exact: true }).click();
  await page.reload();
  await expect(post.getByRole('button', { name: 'Upvote', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Saved posts' }).click();
  await expect(page.getByTestId('post')).toHaveCount(1);
  await page.getByRole('button', { name: 'Unsave post' }).click();
  await expect(page.getByRole('heading', { name: 'Keep the good ones.' })).toBeVisible();
});

test('create a post, comment, reply, vote on a comment, delete a comment, and reload', async ({ page }) => {
  await page.locator('.header-actions').getByRole('button', { name: 'Create post' }).click();
  await page.getByLabel('Community', { exact: true }).selectOption('programming');
  await page.getByLabel('Title', { exact: false }).fill('A useful little tool I made');
  await page.getByLabel('Body', { exact: false }).fill('A small script to organize my reading list.');
  await page.getByRole('dialog').getByRole('button', { name: 'Create post', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A useful little tool I made' })).toBeVisible();
  await page.getByLabel('Comment as').fill('This would be handy!');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  const comment = page.getByRole('article', { name: 'Comment by you', exact: true }).first();
  await expect(comment).toContainText('This would be handy!');
  await comment.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.getByLabel('Your reply').fill('Happy to share the source.');
  await page.locator('.reply-form').getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.locator('.nested-comment')).toContainText('Happy to share the source.');
  await page.locator('.nested-comment').getByRole('button', { name: 'Upvote', exact: true }).click();
  await expect(page.locator('.nested-comment').getByLabel('2 points')).toBeVisible();
  await page.reload();
  await expect(page.locator('.nested-comment')).toContainText('Happy to share the source.');
  await page.locator('.nested-comment').getByRole('button', { name: 'Delete your comment' }).click();
  await expect(page.locator('.nested-comment')).toContainText('[deleted]');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('post').first()).toContainText('A useful little tool I made');
  await page.getByRole('button', { name: 'Delete your post' }).click();
  await expect(page.getByTestId('post').filter({ hasText: 'A useful little tool I made' })).toHaveCount(0);
});

test('recent communities are unique, newest first, capped at five, and persist', async ({ page }) => {
  for (const name of ['Design', 'technology', 'programming', 'photography', 'books', 'science', 'books']) {
    await page.goto(`/#/r/${name}`);
    await expect(page.locator('.recent-section .community-nav').first()).toContainText(`r/${name}`);
  }
  await expect(page.locator('.recent-section .community-nav')).toHaveCount(5);
  await expect(page.locator('.recent-section .community-nav > span:nth-child(2)')).toHaveText(['r/books', 'r/science', 'r/photography', 'r/programming', 'r/technology']);
  await page.reload();
  await expect(page.locator('.recent-section .community-nav')).toHaveCount(5);
});

test('search, compact view, community filter, and direct post links work', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.keyboard.press('/');
  await expect(page.getByLabel('Search posts and communities')).toBeFocused();
  await page.getByLabel('Search posts and communities').fill('software');
  await page.getByLabel('Search posts and communities').press('Enter');
  await expect(page.getByTestId('post')).toHaveCount(1);
  await expect(page.getByTestId('post')).toContainText('small piece of software');
  await page.getByRole('button', { name: 'Use compact view' }).click();
  await expect(page.locator('.post-thumbnail')).toHaveCount(0);
  await page.locator('.post-title').click();
  await expect(page.getByRole('heading', { name: 'What’s a small piece of software you built just for yourself?' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.comment-list .comment')).toHaveCount(3);
  await page.getByRole('link', { name: 'All communities', exact: true }).click();
  await page.getByLabel('Filter communities').fill('science');
  await expect(page.locator('.community-card')).toHaveCount(2);
  await page.getByLabel('Filter communities').fill('does-not-exist');
  await expect(page.getByRole('heading', { name: 'No communities found.' })).toBeVisible();
});

test('link posts validate protocols and render a safe outbound link', async ({ page }) => {
  await page.locator('.header-actions').getByRole('button', { name: 'Create post' }).click();
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByLabel('Title', { exact: false }).fill('An interesting link');
  await page.getByLabel('Link URL').fill('javascript:alert(1)');
  await page.getByRole('dialog').getByRole('button', { name: 'Create post', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a complete http:// or https:// URL.');
  await page.getByLabel('Link URL').fill('https://example.com/article');
  await page.getByRole('dialog').getByRole('button', { name: 'Create post', exact: true }).click();
  await expect(page.locator('.external-post-link')).toHaveAttribute('href', 'https://example.com/article');
  await expect(page.locator('.external-post-link')).toHaveAttribute('rel', 'noopener noreferrer');
});

test('mobile navigation and composing work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Popular', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Popular' })).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  await page.locator('.header-actions').getByRole('button', { name: 'Create post', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('core views and the compose dialog have no automated WCAG A/AA violations', async ({ page }) => {
  for (const route of ['/#/home', '/#/post/design-everyday', '/#/communities']) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
  }
  await page.locator('.header-actions').getByRole('button', { name: 'Create post' }).click();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('invalid routes and broken URI escapes show a useful fallback', async ({ page }) => {
  await page.goto('/#/post/not-a-post');
  await expect(page.getByRole('heading', { name: 'Nothing at this address.' })).toBeVisible();
  await page.goto('/#/%E0%A4%A');
  await expect(page.getByRole('heading', { name: 'Nothing at this address.' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page.getByTestId('post')).toHaveCount(9);
});
