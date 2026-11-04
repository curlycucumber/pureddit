import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The preview runs the same preferences, title filters and tools as the extension.
test('reading preferences and literal title filters persist, reveal safely, and reset without losing shortcuts', async({page})=>{
  await page.goto('/');const reader=page.locator('#reader-host');
  const initial=await reader.getByRole('article').count();
  const title=await reader.locator('.post-title').first().textContent();
  await reader.getByRole('button',{name:'Preferences',exact:true}).click();
  const dialog=reader.getByRole('dialog',{name:'Make room for your feed'});
  await dialog.getByLabel('Text size',{exact:true}).selectOption('larger');
  await dialog.getByLabel('Content width',{exact:true}).selectOption('focused');
  await dialog.getByLabel('Spacing',{exact:true}).selectOption('compact');
  await dialog.getByLabel('Words or phrases to hide',{exact:true}).fill(title!.toUpperCase());
  await dialog.getByRole('button',{name:'Save preferences',exact:true}).click();
  await expect(reader.getByRole('article')).toHaveCount(initial-1);
  await expect(reader.locator('.reader')).toHaveAttribute('data-text-size','larger');
  await expect(reader.locator('.reader')).toHaveAttribute('data-content-width','focused');
  await expect(reader.locator('.reader')).toHaveAttribute('data-density','compact');
  await reader.getByRole('button',{name:'1 post filtered · Show',exact:true}).click();
  await expect(reader.getByRole('article')).toHaveCount(initial);
  await reader.getByRole('button',{name:'1 post revealed · Hide again',exact:true}).click();
  await expect(reader.getByRole('article')).toHaveCount(initial-1);
  await page.reload();await expect(reader.getByRole('article')).toHaveCount(initial-1);
  await reader.getByRole('button',{name:'Preferences',exact:true}).click();
  await expect(dialog.getByLabel('Text size',{exact:true})).toHaveValue('larger');
  await dialog.getByRole('button',{name:'Reset these preferences',exact:true}).click();
  await expect(dialog.getByLabel('Text size',{exact:true})).toHaveValue('default');
  await dialog.getByRole('button',{name:'Close preferences',exact:true}).click();
  await expect(reader.getByRole('article')).toHaveCount(initial);
  await reader.getByRole('button',{name:'Community shortcuts',exact:true}).click();
  await expect(reader.getByRole('dialog',{name:'Your shortcuts'}).getByRole('link',{name:'r/Design',exact:true})).toBeVisible();
});

test('searchable community menu pins, unpins and navigates while retaining focus and local state', async({page})=>{
  await page.goto('/');const reader=page.locator('#reader-host');
  await reader.getByRole('button',{name:'Community shortcuts',exact:true}).click();
  const dialog=reader.getByRole('dialog',{name:'Your shortcuts'});
  await dialog.getByLabel('Pin a community',{exact:true}).fill('r/books');
  await dialog.getByRole('button',{name:'Pin',exact:true}).click();
  await expect(dialog.getByRole('link',{name:'r/books',exact:true})).toBeVisible();
  await dialog.getByLabel('Search shortcuts and recent communities',{exact:true}).fill('BOOK');
  await expect(dialog.getByRole('link')).toHaveCount(1);
  await expect(dialog.getByRole('link',{name:'r/books',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await expect(reader.getByRole('button',{name:'Community shortcuts',exact:true})).toBeFocused();
  await reader.getByRole('button',{name:'Community shortcuts',exact:true}).click();
  await dialog.getByRole('link',{name:'r/books',exact:true}).click();
  await expect(dialog).not.toBeVisible();await expect(reader.locator('main h1')).toHaveText('r/books');
  await reader.getByRole('button',{name:'Community shortcuts',exact:true}).click();
  await expect(dialog.locator('section').first().getByRole('heading')).toHaveText('Recent communities');
  await dialog.getByLabel('Search shortcuts and recent communities',{exact:true}).fill('');
  await dialog.getByRole('button',{name:'Unpin r/books',exact:true}).first().click();
  await expect(dialog.getByRole('button',{name:'Unpin r/books',exact:true})).toHaveCount(0);
});

test('optional keyboard navigation opens and returns, without intercepting editor or dialog input', async({page})=>{
  await page.goto('/');const reader=page.locator('#reader-host');
  await page.keyboard.press('j');await expect(reader.locator('[data-pureddit-selected]')).toHaveCount(0);
  await reader.getByRole('button',{name:'Preferences',exact:true}).click();const dialog=reader.getByRole('dialog',{name:'Make room for your feed'});
  await dialog.getByLabel('Enable desktop keyboard shortcuts',{exact:true}).check();
  await dialog.getByRole('button',{name:'Save preferences',exact:true}).click();
  await reader.locator('main h1').click();await page.keyboard.press('j');
  await expect(reader.locator('.post').first()).toHaveAttribute('data-pureddit-selected','');
  await page.keyboard.press('j');await expect(reader.locator('.post').nth(1)).toHaveAttribute('data-pureddit-selected','');
  await page.keyboard.press('k');await page.keyboard.press('o');
  await expect(reader.locator('.reader')).toHaveAttribute('data-view','discussion');
  const editor=reader.getByLabel('Write a comment',{exact:true});await editor.fill('jkoc');await editor.press('Escape');
  await expect(reader.locator('.reader')).toHaveAttribute('data-view','discussion');await expect(editor).toHaveValue('jkoc');
  await reader.locator('.discussion-title').click();await page.keyboard.press('Escape');
  await expect(reader.locator('.reader')).toHaveAttribute('data-view','feed');
  await reader.getByRole('button',{name:'Preferences',exact:true}).click();
  await dialog.getByLabel('Words or phrases to hide',{exact:true}).fill('jkoc');await page.keyboard.press('j');
  await expect(reader.locator('[data-pureddit-selected]')).toHaveCount(0);
  await dialog.getByLabel('Words or phrases to hide',{exact:true}).fill('');await dialog.getByRole('button',{name:'Save preferences',exact:true}).click();
  await reader.locator('main h1').click();await page.keyboard.press('j');await expect(reader.locator('[data-pureddit-selected]')).toHaveCount(1);
  await reader.getByRole('button',{name:'Preferences',exact:true}).click();await dialog.getByLabel('Enable desktop keyboard shortcuts',{exact:true}).uncheck();await dialog.getByRole('button',{name:'Save preferences',exact:true}).click();
  await expect(reader.locator('[data-pureddit-selected]')).toHaveCount(0);
});

for(const appearance of ['modern','old']) for(const theme of ['light','dark']) test(`${appearance} ${theme} mobile tools fit and have accessible controls`,async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const reader=page.locator('#reader-host');
  await reader.getByRole('button',{name:appearance==='old'?'Old layout':'Modern layout',exact:true}).click();
  await reader.getByRole('button',{name:theme==='dark'?'Dark mode':'Light mode',exact:true}).click();
  await reader.getByRole('button',{name:'Preferences',exact:true}).click();
  const dialog=reader.getByRole('dialog',{name:'Make room for your feed'});await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await dialog.getByRole('button',{name:'Close preferences',exact:true}).click();
  await reader.getByRole('button',{name:'Community shortcuts',exact:true}).click();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Old preview feed arrows share their local vote state with the discussion',async({page})=>{
  await page.goto('/');const reader=page.locator('#reader-host');await reader.getByRole('button',{name:'Old layout',exact:true}).click();
  const post=reader.getByRole('article').first(),up=post.getByRole('button',{name:'Upvote post',exact:true}),down=post.getByRole('button',{name:'Downvote post',exact:true});
  const original=Number((await post.locator('.score-number').textContent())!.replaceAll(',',''));
  await up.click();await expect(up).toHaveAttribute('aria-pressed','true');await expect(post.locator('.score-number')).toHaveText(String(original+1));
  await down.click();await expect(down).toHaveAttribute('aria-pressed','true');await expect(post.locator('.score-number')).toHaveText(String(original-1));
  await post.locator('.post-title').click();await expect(reader.locator('.discussion-vote[aria-label="Downvote post"]')).toHaveAttribute('aria-pressed','true');await reader.getByRole('button',{name:'Back to feed',exact:true}).click();await expect(down).toHaveAttribute('aria-pressed','true');
  await down.click();await expect(down).toHaveAttribute('aria-pressed','false');await expect(post.locator('.score-number')).toHaveText(String(original));
});
