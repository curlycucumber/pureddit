import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('paste mode is the default, imports text locally, removes noise/duplicates, and keeps feeds separate', async ({ page }) => {
  const apiRequests: string[] = [];
  await page.route('**/api/**', async route => { apiRequests.push(route.request().url()); await route.fulfill({ json: {} }); });
  await page.goto('/#/read-only');
  await expect(page.getByRole('button', { name: 'Paste headlines', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const source = page.getByLabel('Copied text from r/popular');
  await source.fill('r/news\n•\n2 hr. ago\nLocal libraries add more opening hours\nAn extra paragraph from the post body\nUpvote\n43 comments\nShare\nr/science\nA new study maps the ocean floor\nr/news\nLocal libraries add more opening hours');
  await page.getByRole('button', { name: 'Extract headlines' }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('2 headlines');
  await expect(page.getByRole('article').first().getByRole('link', { name: 'Search on Reddit', exact: true })).toHaveAttribute('href', /\/search\/\?q=/);
  await page.getByRole('button', { name: 'r/news', exact: true }).click();
  await expect(page.getByLabel('Copied text from r/news')).toHaveValue('');
  await page.getByLabel('Copied text from r/news').fill('Another manually copied news headline');
  await page.getByRole('button', { name: 'Extract headlines' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'r/popular', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove headline: Local libraries add more opening hours' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear r/popular' }).click();
  await expect(source).toHaveValue(''); await expect(page.getByRole('article')).toHaveCount(0);
  expect(apiRequests).toEqual([]); expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('rich clipboard content preserves Reddit links without inserting HTML or loading embedded resources', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/') || request.url().includes('tracker.invalid')) requests.push(request.url()); });
  await page.goto('/#/read-only');
  await page.getByLabel('Copied text from r/popular').evaluate(element => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', 'A copied headline with its original link\nAnother headline with a valid Reddit link');
    clipboard.setData('text/html', `<img src="https://tracker.invalid/image"><iframe src="https://tracker.invalid/frame"></iframe><script>window.pastedScriptRan = true</script><a href="https://old.reddit.com/r/news/comments/abc123/title/?tracking=1"><h2>A copied headline with its original link</h2></a><a href="https://www.reddit.com/r/news/comments/abc123/title">43 comments</a><a href="/r/science/comments/def456/another"><h2>Another headline with a valid Reddit link</h2></a><a href="javascript:alert(1)">An unsafe link that must be ignored</a><a href="https://reddit.com.evil.invalid/r/news/comments/bad/title">A forged Reddit link to ignore</a>`);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await page.getByRole('button', { name: 'Extract headlines' }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  const link = page.getByRole('link', { name: 'A copied headline with its original link', exact: true });
  await expect(link).toHaveAttribute('href', 'https://www.reddit.com/r/news/comments/abc123/');
  await expect(link).toHaveAttribute('target', '_blank'); await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('status')).toContainText('Copied links');
  await expect(page.locator('.paste-reader img,.paste-reader iframe,.paste-reader script')).toHaveCount(0);
  expect(await page.evaluate(() => 'pastedScriptRan' in window)).toBe(false);
  expect(requests).toEqual([]);
  await page.reload(); await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByLabel('Copied text from r/popular')).toHaveValue('');
});

test('paste mode handles unrecognized text and remains accessible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/read-only');
  await page.getByLabel('Copied text from r/popular').fill('Upvote\nDownvote\nShare\n1.3k\nNews');
  await page.getByRole('button', { name: 'Extract headlines' }).click();
  await expect(page.getByRole('alert')).toContainText('No headlines were recognized');
  await page.getByLabel('Copied text from r/popular').fill('A valid manually pasted headline');
  await page.getByRole('button', { name: 'Extract headlines' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('live mode is opt-in and switching back to paste preserves local imports', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/read-only?**', async route => { requests.push(route.request().url()); await route.fulfill({ json: { posts: [], after: null } }); });
  await page.goto('/#/read-only');
  await page.getByLabel('Copied text from r/popular').fill('A headline to keep while switching modes');
  await page.getByRole('button', { name: 'Extract headlines' }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Live feeds', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No posts returned' })).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Paste headlines', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByLabel('Copied text from r/popular')).toHaveValue('A headline to keep while switching modes');
});
