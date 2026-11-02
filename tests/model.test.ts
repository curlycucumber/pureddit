import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalizePreferences, pageFromUrl, postUrl, sortUrl, visit } from '../shared/model';

test('only supported Reddit feed URLs activate the reader; discussions and private pages stay native', () => {
  assert.equal(pageFromUrl('https://www.reddit.com/new/')?.kind, 'home');
  assert.equal(pageFromUrl('https://old.reddit.com/r/news/top/')?.sort, 'top');
  assert.equal(pageFromUrl('https://www.reddit.com/r/photography/')?.kind, 'community');
  for (const url of ['https://example.com/r/news/', 'https://www.reddit.com.evil.invalid/', 'https://www.reddit.com/r/news/comments/abc/title/', 'https://www.reddit.com/message/inbox/', 'https://www.reddit.com/user/reader/', 'https://www.reddit.com/login/']) assert.equal(pageFromUrl(url), null);
  assert.equal(sortUrl(pageFromUrl('https://www.reddit.com/r/news/')!, 'new'), 'https://www.reddit.com/r/news/new/');
});
test('local preferences validate and deduplicate names without retaining arbitrary data', () => {
  const value = normalizePreferences({ enabled: false, pins: ['news', 'NEWS', '../bad', 'books', 42], recent: ['a1','a2','a3','a4','a5','a6'], token: 'never-store-this' });
  assert.equal(value.enabled, false); assert.deepEqual(value.pins, ['news','books']); assert.equal(value.recent.length, 5);
  assert.equal('token' in value, false); assert.deepEqual(normalizePreferences(null), DEFAULTS);
  assert.equal(normalizePreferences({ pins: Array.from({ length: 60 }, (_, index) => `community${index}`) }).pins.length, 50);
});
test('recent communities are unique, chronological, and limited to five', () => {
  let value = normalizePreferences(DEFAULTS);
  for (const name of ['news','books','space','science','technology','photography','NEWS']) value = visit(value,name);
  assert.deepEqual(value.recent,['NEWS','photography','technology','science','space']);
  assert.deepEqual(visit(value,'popular'),value);
});
test('post links cannot point at another site, run script, or expose URL credentials', () => {
  assert.equal(postUrl('/r/news/comments/abc123/title/?tracking=1'), 'https://www.reddit.com/r/news/comments/abc123/title/');
  for (const url of ['javascript:alert(1)', 'https://evil.invalid/comments/abc123/', 'https://reader:secret@www.reddit.com/comments/abc123/', '/login/']) assert.equal(postUrl(url), undefined);
});
