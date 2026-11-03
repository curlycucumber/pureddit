import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openFirstPost(page: Page) {
  const reader = page.locator('#reader-host');
  const title = await reader.locator('.post-title').first().textContent();
  await reader.locator('.post-title').first().click();
  await expect(reader.locator('.reader')).toHaveAttribute('data-view', 'discussion');
  await expect(reader.getByRole('heading', { name: title!, exact: true })).toBeVisible();
  return { reader, title: title! };
}

test('post and comment links open an explicitly local discussion and return to the feed', async ({ page }) => {
  await page.goto('/');
  const { reader } = await openFirstPost(page);
  await expect(reader.getByText(/Sample discussion/).first()).toBeVisible();
  await expect(reader.getByText(/discussions and account actions use Reddit/)).toBeVisible();
  await expect(reader.getByLabel('Write a comment', { exact: true })).toBeVisible();
  await reader.getByRole('button', { name: 'Back to feed', exact: true }).click();
  await expect(reader.getByRole('heading', { name: 'Popular', exact: true })).toBeVisible();
  await reader.locator('.comment-pill').first().click();
  await expect(reader.locator('.reader')).toHaveAttribute('data-view', 'discussion');
  await expect(reader.getByLabel('Write a comment', { exact: true })).toBeVisible();
});

test('comments remain literal, are kept only in page memory, and can be sorted newest first', async ({ page }) => {
  await page.goto('/');
  const { reader, title } = await openFirstPost(page);
  const comment = 'A local comment <img src=x onerror="window.__previewXss=true">';
  await reader.getByLabel('Write a comment', { exact: true }).fill(comment);
  await reader.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(reader.getByText(comment, { exact: true })).toBeVisible();
  await expect(reader.getByLabel('Write a comment', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => (window as Window & { __previewXss?: boolean }).__previewXss)).toBeUndefined();
  await expect(reader.locator('img[onerror]')).toHaveCount(0);
  await reader.getByLabel('Sort comments', { exact: true }).selectOption('new');
  await expect(reader.locator('[data-comment-id]').first()).toContainText(comment);
  await reader.getByRole('button', { name: 'Back to feed', exact: true }).click();
  await reader.getByRole('link', { name: title, exact: true }).click();
  await expect(reader.getByText(comment, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain('A local comment');
  await page.reload();
  await expect(reader.locator('.reader')).toHaveAttribute('data-view', 'discussion');
  await expect(reader.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(reader.getByText(comment, { exact: true })).toHaveCount(0);
});

test('browser Back/Forward and community links navigate between discussions and feeds', async ({ page }) => {
  await page.goto('/');
  const { reader, title } = await openFirstPost(page);
  await page.goBack();
  await expect(reader.getByRole('heading', { name: 'Popular', exact: true })).toBeVisible();
  await expect(reader.locator('.post-title')).toHaveCount(7);
  await page.goForward();
  await expect(reader.locator('.reader')).toHaveAttribute('data-view', 'discussion');
  await expect(reader.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await reader.getByRole('link', { name: 'News', exact: true }).click();
  await expect(reader.getByRole('heading', { name: 'r/news', exact: true })).toBeVisible();
  await expect(reader.getByRole('article')).toHaveCount(1);
  await page.goBack();
  await expect(reader.locator('.reader')).toHaveAttribute('data-view', 'discussion');
  await expect(reader.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

test('returning through another community preserves the original feed scroll position', async ({ page }) => {
  await page.goto('/');
  const reader = page.locator('#reader-host'), main = reader.locator('main');
  await main.evaluate(node => { node.scrollTop = 450; });
  const post = reader.locator('.post-title').nth(2);
  await post.scrollIntoViewIfNeeded();
  const savedScroll = await main.evaluate(node => node.scrollTop);
  expect(savedScroll).toBeGreaterThan(200);
  const title = await post.textContent();
  await post.click();
  await expect(reader.getByRole('heading', { name: title!, exact: true })).toBeVisible();
  await reader.getByRole('link', { name: 'News', exact: true }).click();
  await expect(reader.getByRole('heading', { name: 'r/news', exact: true })).toBeVisible();
  await page.goBack();
  await expect(reader.locator('.reader')).toHaveAttribute('data-view', 'discussion');
  await reader.getByRole('button', { name: 'Back to feed', exact: true }).click();
  await expect(reader.getByRole('heading', { name: 'Popular', exact: true })).toBeVisible();
  await expect.poll(() => main.evaluate(node => node.scrollTop)).toBeCloseTo(savedScroll, 0);
});

test('nested replies can be posted and collapsed without losing their local state', async ({ page }) => {
  await page.goto('/');
  const { reader } = await openFirstPost(page);
  const parent = reader.locator('[data-comment-id]').first();
  const parentId = await parent.getAttribute('data-comment-id');
  await parent.getByRole('button', { name: 'Reply', exact: true }).first().click();
  const reply = 'A reply nested under the selected sample comment.';
  await reader.getByLabel('Write a reply', { exact: true }).fill(reply);
  await reader.getByRole('button', { name: 'Post reply', exact: true }).click();
  const thread = reader.locator(`[data-comment-id="${parentId}"]`);
  await expect(thread.getByText(reply, { exact: true })).toBeVisible();
  await thread.getByRole('button', { name: 'Collapse thread', exact: true }).first().click();
  await expect(reader.getByText(reply, { exact: true })).toBeHidden();
  await thread.getByRole('button', { name: 'Expand thread', exact: true }).first().click();
  await expect(thread.getByText(reply, { exact: true })).toBeVisible();
});

test('post votes toggle locally and discussion interactions never contact Reddit or a mutation endpoint', async ({ page }) => {
  const external: string[] = [], mutations: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname) ? route.abort() : route.continue();
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(request.url());
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutations.push(`${request.method()} ${request.url()}`);
  });
  await page.goto('/');
  const { reader } = await openFirstPost(page);
  const up = reader.getByRole('button', { name: 'Upvote post', exact: true });
  const down = reader.getByRole('button', { name: 'Downvote post', exact: true });
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  await up.click(); await expect(up).toHaveAttribute('aria-pressed', 'true');
  await down.click(); await expect(down).toHaveAttribute('aria-pressed', 'true');
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  await down.click(); await expect(down).toHaveAttribute('aria-pressed', 'false');
  await reader.getByLabel('Write a comment', { exact: true }).fill('This comment remains in the local demonstration.');
  await reader.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(reader.getByText('This comment remains in the local demonstration.', { exact: true })).toBeVisible();
  expect(external).toEqual([]); expect(mutations).toEqual([]);
});

for (const appearance of ['modern', 'old']) for (const colorScheme of ['light', 'dark']) {
  test(`${appearance} ${colorScheme} discussion works in the iPhone preview without overflow or accessibility violations`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Safari · iPhone', exact: true }).click();
    const { reader } = await openFirstPost(page);
    await reader.getByRole('button', { name: appearance === 'old' ? 'Old layout' : 'Modern layout', exact: true }).click();
    await reader.getByRole('button', { name: colorScheme === 'dark' ? 'Dark mode' : 'Light mode', exact: true }).click();
    await expect(reader.locator('.reader')).toHaveAttribute('data-view', 'discussion');
    await expect(reader.locator('.reader')).toHaveAttribute('data-appearance', appearance);
    await expect(reader.locator('.reader')).toHaveAttribute('data-theme', colorScheme);
    await reader.getByLabel('Write a comment', { exact: true }).fill('Testing the mobile comment composer.');
    await reader.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(reader.getByText('Testing the mobile comment composer.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await reader.locator('main').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  });
}
