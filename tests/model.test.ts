import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, externalUrl, matchesTitle, normalizePreferences, pageFromUrl, postUrl, sortUrl, visit } from '../shared/model';

test('only supported Reddit feed URLs activate the reader; discussions and private pages stay native', () => {
  assert.equal(pageFromUrl('https://www.reddit.com/new/')?.kind, 'home');
  assert.equal(pageFromUrl('https://old.reddit.com/r/news/top/')?.sort, 'top');
  assert.equal(pageFromUrl('https://www.reddit.com/r/photography/')?.kind, 'community');
  for (const url of ['https://example.com/r/news/', 'https://www.reddit.com.evil.invalid/', 'https://www.reddit.com/r/news/comments/abc/title/', 'https://www.reddit.com/message/inbox/', 'https://www.reddit.com/user/reader/', 'https://www.reddit.com/login/']) assert.equal(pageFromUrl(url), null);
  assert.equal(pageFromUrl('https://www.reddit.com/news')?.kind,'news');
  assert.equal(pageFromUrl('https://www.reddit.com/r/news/')?.kind,'community');
  assert.equal(sortUrl(pageFromUrl('https://www.reddit.com/r/news/')!, 'new'), 'https://www.reddit.com/r/news/new/');
});
test('local preferences validate and deduplicate names without retaining arbitrary data', () => {
  const value = normalizePreferences({ enabled: false, pins: ['news', 'NEWS', '../bad', 'books', 42], recent: ['a1','a2','a3','a4','a5','a6'], token: 'never-store-this' });
  assert.equal(value.enabled, false); assert.deepEqual(value.pins, ['news','books']); assert.equal(value.recent.length, 5);
  assert.equal('token' in value, false); assert.deepEqual(normalizePreferences(null), DEFAULTS);
  assert.equal(normalizePreferences({ pins: Array.from({ length: 60 }, (_, index) => `community${index}`) }).pins.length, 50);
  assert.equal(normalizePreferences({appearance:'old'}).appearance, 'old');
  assert.equal(normalizePreferences({appearance:'unsupported'}).appearance, 'modern');
  assert.equal(normalizePreferences({pins:['books']}).appearance, 'modern');
  assert.equal(normalizePreferences({colorScheme:'dark'}).colorScheme, 'dark');
  assert.equal(normalizePreferences({colorScheme:'invalid'}).colorScheme, 'light');
  assert.equal(normalizePreferences({appearance:'old'}).colorScheme, 'light');
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

test('outbound source links accept web destinations without scripts or embedded credentials', () => {
  assert.equal(externalUrl('https://example.org/story?section=news'), 'https://example.org/story?section=news');
  for (const value of ['javascript:alert(1)', 'data:text/html,unsafe', 'https://reader:secret@example.org/story', '/relative', 'https://www.reddit.com/r/news/comments/abc/title/']) assert.equal(externalUrl(value), undefined);
});

test('new preferences migrate old settings, bound literal filters and retain only explicit flags',()=>{
  const previous=normalizePreferences({appearance:'old',colorScheme:'dark',pins:['books']});
  assert.deepEqual(previous.reading,DEFAULTS.reading);assert.deepEqual(previous.distractions,DEFAULTS.distractions);assert.equal(previous.keyboard,false);
  const value=normalizePreferences({reading:{textSize:'larger',contentWidth:'wide',density:'compact'},distractions:{games:true,explore:'true',recommended:true},titleFilters:['Spoiler','SPOILER','  ','a+b',null,'x'.repeat(200)],keyboard:true});
  assert.deepEqual(value.titleFilters,['Spoiler','a+b','x'.repeat(100)]);assert.equal(value.distractions.explore,false);assert.equal(value.reading.textSize,'larger');
  assert.equal(normalizePreferences({titleFilters:Array.from({length:60},(_,i)=>`phrase${i}`)}).titleFilters.length,30);
  assert.equal(matchesTitle('A+B is literal',['a+b']),true);assert.equal(matchesTitle('AAAB',['a+b']),false);
  assert.equal(matchesTitle('ＳＰＯＩＬＥＲ in the title',['spoiler']),true);
});
