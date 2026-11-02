import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHeadlines, headlineSearch, redditPostLink, MAX_PASTE_LENGTH } from '../src/headline-import.ts';

test('plain page text extracts a title per community block and discards actions, timestamps, and bodies', () => {
  const result = extractHeadlines(`Popular\nHot\nr/news\n•\n2 hr. ago\nLocal libraries expand their weekend opening hours\nThis is body text and should not become another headline\nUpvote\n1.2k\n43 comments\nShare\nr/science · 1 hr. ago\nResearchers publish a new ocean map\nJoin\nDownvote`);
  assert.deepEqual(result.headlines.map(item => item.title), ['Local libraries expand their weekend opening hours', 'Researchers publish a new ocean map']);
  assert.deepEqual(result.headlines.map(item => item.community), ['news', 'science']);
  assert.equal(result.method, 'plain-text');
});

test('old Reddit ranks, domain labels, duplicate titles, and standalone links are handled', () => {
  const result = extractHeadlines(`1\nA useful discussion about public libraries (example.org)\nsubmitted 3 hours ago by a reader\n45 comments\nhttps://old.reddit.com/r/news/comments/abc123/a_useful_discussion/?tracking=1\n2. A useful discussion about public libraries\n3. A second headline worth reading (self.news)`);
  assert.equal(result.headlines.length, 2);
  assert.equal(result.headlines[0].url, 'https://www.reddit.com/r/news/comments/abc123/');
  assert.equal(result.headlines[1].title, 'A second headline worth reading');
});

test('Markdown links and titles with trailing Reddit links preserve only valid original post URLs', () => {
  const result = extractHeadlines(`[An interesting headline to read](https://www.reddit.com/r/news/comments/abc123/title)\nAnother headline with a real link https://www.reddit.com/r/science/comments/def456/title\n[Do not import this external link](https://example.com/r/news/comments/ghi789)`);
  assert.equal(result.headlines.length, 2); assert.equal(result.headlines[1].community, 'science');
  assert.equal(result.headlines[1].url, 'https://www.reddit.com/r/science/comments/def456/');
});

test('untrusted or unrelated URLs cannot become original-post links; search URLs encode the title', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://reddit.com.evil.invalid/r/news/comments/abc123/', 'https://www.reddit.com@evil.invalid/r/news/comments/abc123/', 'https://www.reddit.com/search/?q=test', 'https://user:pass@www.reddit.com/r/news/comments/abc123/']) assert.equal(redditPostLink(url), null);
  const link = new URL(headlineSearch('A title & symbols #tag <script>'));
  assert.equal(link.origin, 'https://www.reddit.com'); assert.equal(link.searchParams.get('q'), 'A title & symbols #tag <script>');
});

test('Unicode titles are preserved, case-insensitive duplicates collapse, and empty input is explicit', () => {
  const result = extractHeadlines('Une nouvelle bibliothèque ouvre aujourd’hui\nUNE NOUVELLE BIBLIOTHÈQUE OUVRE AUJOURD’HUI\n東京の新しい図書館が 今週オープンします');
  assert.equal(result.headlines.length, 2); assert.match(result.headlines[0].title, /aujourd’hui/);
  assert.throws(() => extractHeadlines('  '), /Paste some/);
  assert.equal(extractHeadlines('Upvote\nDownvote\nShare\n1.3k\nNews').headlines.length, 0);
});

test('paste size and extracted item count are bounded', () => {
  assert.throws(() => extractHeadlines('x'.repeat(MAX_PASTE_LENGTH + 1)), /200,000/);
  assert.equal(extractHeadlines(Array.from({ length: 210 }, (_, index) => `An original headline number ${index}`).join('\n')).headlines.length, 200);
});
