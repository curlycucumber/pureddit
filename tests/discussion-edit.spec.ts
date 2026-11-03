import { test, expect } from '@playwright/test';

test('clicking the thread line collapses descendants and the plus restores them', async({page})=>{
  await page.goto('/#post=t3_sample0');const reader=page.locator('#reader-host');
  const thread=reader.locator('[data-comment-id="sample-1"]');
  await thread.locator(':scope > .comment-content > .thread-rail').click({position:{x:6,y:12}});
  await expect(thread.getByRole('button',{name:'Expand thread',exact:true})).toBeVisible();
  await expect(thread.locator('[data-comment-id="sample-1-1"]')).toBeHidden();
  await thread.getByRole('button',{name:'Expand thread',exact:true}).click();
  await expect(thread.locator('[data-comment-id="sample-1-1"]')).toBeVisible();
});

test('upvotes and downvotes have distinct orange and blue colors in both themes', async({page})=>{
  await page.goto('/#post=t3_sample0');const reader=page.locator('#reader-host');
  for(const mode of ['Light mode','Dark mode']) {
    await reader.getByRole('button',{name:mode,exact:true}).click();
    const up=reader.getByRole('button',{name:'Upvote post',exact:true}), down=reader.getByRole('button',{name:'Downvote post',exact:true});
    await up.click();const warm=await up.evaluate(node=>getComputedStyle(node).color);
    await down.click();const cool=await down.evaluate(node=>getComputedStyle(node).color);
    expect(warm).not.toBe(cool);
    const values=(value:string)=>value.match(/\d+/g)!.map(Number);
    expect(values(warm)[0]).toBeGreaterThan(values(warm)[2]);expect(values(cool)[2]).toBeGreaterThan(values(cool)[0]);
    await down.click();
  }
});

test('own comments can be edited, canceled, and safely formatted', async({page})=>{
  await page.goto('/#post=t3_sample0');const reader=page.locator('#reader-host');
  await expect(reader.getByRole('button',{name:'Edit comment',exact:true})).toHaveCount(0);
  await reader.getByLabel('Write a comment',{exact:true}).fill('Original comment');await reader.getByRole('button',{name:'Post comment',exact:true}).click();
  const own=reader.locator('[data-comment-id="local-1"]');await own.getByRole('button',{name:'Edit comment',exact:true}).click();
  await reader.getByLabel('Edit your comment').fill('Discard me');await own.locator('.comment-editor').getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(own.getByText('Original comment',{exact:true})).toBeVisible();
  await own.getByRole('button',{name:'Edit comment',exact:true}).click();
  await reader.getByLabel('Edit your comment').fill('**Bold** and *italic*\n- First\n- Second\n<img src=x onerror=alert(1)>');
  await reader.getByRole('button',{name:'Save comment',exact:true}).click();
  await expect(own.locator('.comment-text strong')).toHaveText('Bold');await expect(own.locator('.comment-text em')).toHaveText('italic');await expect(own.locator('.comment-text li')).toHaveCount(2);
  await expect(own.getByText('<img src=x onerror=alert(1)>',{exact:true})).toBeVisible();await expect(own.locator('img')).toHaveCount(0);
  await expect(own.locator('.comment-age')).toContainText('edited');
});

test('formatting toolbar inserts selected markup and previews it', async({page})=>{
  await page.goto('/#post=t3_sample0');const reader=page.locator('#reader-host'), textarea=reader.getByLabel('Write a comment',{exact:true});
  await textarea.fill('Words');await textarea.evaluate(node=>(node as HTMLTextAreaElement).setSelectionRange(0,5));
  const form=reader.locator('.discussion-composer').first();await form.getByRole('button',{name:'Bold',exact:true}).click();await expect(textarea).toHaveValue('**Words**');
  await form.getByRole('button',{name:'Preview',exact:true}).click();await expect(form.locator('.format-preview strong')).toHaveText('Words');
  await reader.getByRole('button',{name:'Post comment',exact:true}).click();await expect(reader.locator('[data-comment-id="local-1"] strong')).toHaveText('Words');
});

test('users create and edit their own formatted text posts without editing a published title', async({page})=>{
  await page.goto('/#post=t3_sample0');const reader=page.locator('#reader-host');await expect(reader.getByRole('button',{name:'Edit post',exact:true})).toHaveCount(0);
  await reader.getByRole('button',{name:'Create post',exact:true}).click();
  await reader.getByLabel('Post title',{exact:true}).fill('My local preview post');await reader.getByLabel('Post body',{exact:true}).fill('**Hello**\n- One\n- Two');
  await reader.getByRole('button',{name:'Publish preview post',exact:true}).click();
  await expect(reader.getByRole('heading',{name:'My local preview post',exact:true})).toBeVisible();await expect(reader.locator('.discussion-body strong')).toHaveText('Hello');
  await reader.getByRole('button',{name:'Edit post',exact:true}).click();
  await expect(reader.getByLabel('Post title',{exact:true})).toHaveCount(0);
  await reader.getByLabel('Edit post body',{exact:true}).fill('*Updated* body');await reader.getByRole('button',{name:'Save post changes',exact:true}).click();
  await expect(reader.locator('.discussion-body em')).toHaveText('Updated');
  await reader.getByRole('button',{name:'Back to feed',exact:true}).click();
  await reader.getByRole('link',{name:'My local preview post',exact:true}).click();await expect(reader.locator('.discussion-body em')).toHaveText('Updated');
  expect(await page.evaluate(()=>JSON.stringify(Object.entries(localStorage)))).not.toContain('Updated');
});
