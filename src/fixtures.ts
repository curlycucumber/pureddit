// Only the hosted design preview uses these illustrative fixtures.
const rows = [
  ['Design', 'The quiet beauty of everyday objects, designed to last.', 'formandfunction', '1248', '86', 'desk'],
  ['technology', 'Maybe the internet needs to be smaller.', 'lowbandwidth', '892', '214', ''],
  ['photography', 'Early mornings in the mountains. Worth every minute.', 'northernlight', '2103', '72', 'mountains'],
  ['programming', 'What’s a small piece of software you built just for yourself?', 'sometimesicompile', '647', '183', ''],
  ['books', 'A book hits differently when you read it ten years later.', 'one_more_chapter', '983', '129', 'desk'],
  ['space', 'An old photograph that still makes space feel impossibly big.', 'orbitalmechanic', '3421', '94', 'space'],
  ['news', 'Libraries are finding new ways to bring communities together.', 'public_interest', '1126', '106', ''],
];
export function createFixture(kind: 'modern' | 'old', feed: string) {
  const root = document.createElement('div');
  rows.forEach((row, index) => {
    if (feed === 'news' ? row[0] !== 'news' : !['home', 'popular'].includes(feed) && row[0].toLowerCase() !== feed.toLowerCase()) return;
    const [community, title, author, score, comments, image] = row;
    const permalink = `/r/${community}/comments/sample${index}/sample_discussion/`;
    const card = document.createElement(kind === 'modern' ? 'shreddit-post' : 'div');
    if (kind === 'modern') {
      Object.entries({ id: `t3_sample${index}`, 'post-title': title, 'subreddit-prefixed-name': `r/${community}`, author, score, 'comment-count': comments, permalink }).forEach(([key, value]) => card.setAttribute(key, value));
    } else {
      card.className = 'thing link'; card.setAttribute('data-fullname', `t3_sample${index}`); card.setAttribute('data-subreddit', community); card.setAttribute('data-permalink', permalink);
      for (const [tag, cls, value] of [['a', 'title', title], ['a', 'author', author], ['span', 'score unvoted', score], ['a', 'comments', `${comments} comments`]]) { const node = document.createElement(tag); node.className = cls; node.textContent = value; if (tag === 'a') node.setAttribute('href', permalink); card.append(node); }
    }
    const timestamp = new Date(Date.now() - (index + 1) * 3 * 60 * 60 * 1000).toISOString();
    const time = document.createElement('time'); time.dateTime = timestamp; card.append(time);
    if (image) {
      const source = `https://example.org/reading/${community.toLowerCase()}/`;
      if (kind === 'modern') card.setAttribute('content-href', source);
      else card.querySelector('a.title')!.setAttribute('href', source);
    }
    if (image) { const link = document.createElement('a'); link.className = 'thumbnail'; const img = document.createElement('img'); img.src = `/images/${image}.webp`; img.setAttribute('slot', 'post-media-preview'); link.append(img); card.append(link); }
    root.append(card);
  });
  return root;
}
