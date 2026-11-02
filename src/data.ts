export type Community = {
  name: string; label: string; color: string; background: string;
  description: string; members: string; category: string; redditName?: string;
};
export type Comment = { id: string; author: string; body: string; score: number; created: number; parent?: string; redditName?: string; vote?: -1 | 0 | 1 };
export type Post = {
  id: string; community: string; title: string; author: string; score: number;
  created: number; comments: Comment[]; commentCount: number; body?: string;
  image?: string; imagePosition?: string; flair?: string; url?: string; news?: boolean;
  redditName?: string; vote?: -1 | 0 | 1; saved?: boolean; permalink?: string; moreComments?: boolean;
};

export const communities: Community[] = [
  { name: 'Design', label: 'd', color: '#7d5894', background: '#eee7f5', description: 'Good design is a conversation. A place for thoughtful objects, interesting ideas, and the people who make them.', members: '4.2m', category: 'Art & design' },
  { name: 'technology', label: 't', color: '#3b6c88', background: '#e5eff5', description: 'The innovations, ideas, and people shaping the world around us.', members: '18.1m', category: 'Technology' },
  { name: 'programming', label: '</>', color: '#516a5e', background: '#e6eee7', description: 'Computer programming, useful projects, and the joy of figuring things out.', members: '6.7m', category: 'Technology' },
  { name: 'photography', label: 'ph', color: '#7e603f', background: '#f1eadd', description: 'A place to share the way you see the world. All cameras and experience levels welcome.', members: '5.4m', category: 'Art & design' },
  { name: 'books', label: 'b', color: '#875653', background: '#f3e5e2', description: 'For the love of reading. Talk about the books that stay with you.', members: '26.3m', category: 'Culture' },
  { name: 'science', label: 's', color: '#446e67', background: '#e3efeb', description: 'New research, big questions, and evidence-based conversations about our universe.', members: '33.2m', category: 'Science' },
  { name: 'space', label: '✳', color: '#5d638e', background: '#e9eaf5', description: 'Looking up. Exploration, astronomy, and our place in the cosmos.', members: '27.8m', category: 'Science' },
  { name: 'architecture', label: 'a', color: '#6f6352', background: '#eeeae0', description: 'Spaces worth thinking about. Architecture, buildings, and the life between them.', members: '2.1m', category: 'Art & design' },
  { name: 'movies', label: 'm', color: '#7e5b78', background: '#f0e6ef', description: 'A place to discuss films, discover something new, and stay for the credits.', members: '34.5m', category: 'Culture' },
  { name: 'worldnews', label: 'w', color: '#436e81', background: '#e5eef3', description: 'News and perspectives from around the world. Read widely. Discuss thoughtfully.', members: '42.1m', category: 'News' },
  { name: 'news', label: 'n', color: '#8a5b4d', background: '#f3e8e1', description: 'Today’s headlines, with room for a conversation.', members: '29.4m', category: 'News' },
  { name: 'Outdoors', label: 'o', color: '#516e49', background: '#e8efe1', description: 'Fresh air, small adventures, and the great outside.', members: '4.8m', category: 'Lifestyle' },
];

export const initialSubscriptions = communities.slice(0, 9).map(c => c.name);
const photo = (name: string) => `/images/${name}.webp`;
const now = Date.now();
const hoursAgo = (n: number) => now - n * 3_600_000;
function comments(topic: string): Comment[] {
  return [
    { id: `${topic}-1`, author: 'small_observations', body: 'This is exactly the kind of thing I come here for. There’s something really satisfying about seeing the thought behind it.', score: 143, created: hoursAgo(0.4) },
    { id: `${topic}-2`, author: 'quietly_curious', body: 'The details make all the difference. Thanks for sharing this — I’d love to see more of the process.', score: 68, created: hoursAgo(0.2) },
    { id: `${topic}-3`, author: 'another_perspective', body: 'A good reminder to slow down and actually look at the things around us.', score: 31, created: hoursAgo(0.1) },
  ];
}
export const initialPosts: Post[] = [
  { id: 'design-everyday', community: 'Design', title: 'The quiet beauty of everyday objects, designed to last.', author: 'formandfunction', score: 1248, created: hoursAgo(0.5), commentCount: 86, flair: 'Discussion', image: photo('desk'), body: 'Lately I’ve been noticing the objects I reach for every single day. A chair, a ceramic mug, a lamp. The best ones don’t ask for your attention — they just do their job beautifully.\n\nWhat’s an everyday object you own that feels genuinely well designed? I’d love to hear about the things you’ve kept, repaired, and grown attached to.', comments: comments('design') },
  { id: 'web-small', community: 'technology', title: 'Maybe the internet doesn’t need to be bigger. Maybe it needs to be smaller.', author: 'lowbandwidth', score: 892, created: hoursAgo(0.8), commentCount: 214, flair: 'Article', body: 'Personal websites, small forums, and independent blogs are having a quiet moment. There’s a growing appetite for places that feel like a neighborhood rather than a shopping mall.\n\nI’ve started keeping a bookmarks folder again. No recommendation engine, no infinite scroll. Just a handful of places made by people who care. What are your favorite small corners of the internet?', comments: comments('web') },
  { id: 'forest-morning', community: 'photography', title: 'Early mornings in the mountains. Worth every minute.', author: 'northernlight', score: 2103, created: hoursAgo(1.2), commentCount: 72, flair: 'Original content', image: photo('mountains'), body: 'A little appreciation for misty mornings, mountain air, and the photographers who capture them.\n\nThis sample discussion uses a photograph from the Start Bootstrap collection. What landscape would you love to photograph?', comments: comments('forest') },
  { id: 'programming-simple', community: 'programming', title: 'What’s a small piece of software you built just for yourself?', author: 'sometimesicompile', score: 647, created: hoursAgo(1.7), commentCount: 183, flair: 'Ask the community', body: 'Not a startup. Not a portfolio project. Just something that made your own life a little easier.\n\nI made a tiny script that turns my weekly notes into a printable page. It took one evening, and I’ve used it every week for two years. Tell me about your personal tools.', comments: comments('code') },
  { id: 'book-reread', community: 'books', title: 'A book hits differently when you read it ten years later.', author: 'one_more_chapter', score: 983, created: hoursAgo(2.1), commentCount: 129, flair: 'Discussion', image: photo('desk'), body: 'I reread a favorite from my early twenties and somehow it was an entirely different book. The words hadn’t changed, but I had.\n\nHas anyone else had this experience? Which book changed the most for you on a reread?', comments: comments('book') },
  { id: 'space-moon', community: 'space', title: 'An old photograph that still makes space feel impossibly big.', author: 'orbitalmechanic', score: 3421, created: hoursAgo(2.6), commentCount: 94, flair: 'Photography', image: photo('space'), body: 'The scale of a spacewalk is hard to put into words. One person, a machine, and an enormous amount of empty space.\n\nWhich photograph from space has stayed with you? This is a sample discussion, with an image from the Start Bootstrap collection.', comments: comments('moon') },
  { id: 'architecture-library', community: 'architecture', title: 'A little library that makes a big case for public spaces.', author: 'builtforpeople', score: 762, created: hoursAgo(3.2), commentCount: 48, flair: 'Spaces', body: 'Natural light, places to sit without buying anything, and shelves you can get lost in. Sometimes that’s all a neighborhood needs.\n\nWhat’s your favorite public space in your city?', comments: comments('library') },
  { id: 'science-rest', community: 'science', title: 'Taking a short walk can be the best way to get unstuck on a problem.', author: 'evidence_first', score: 581, created: hoursAgo(4.1), commentCount: 67, flair: 'Discussion', body: 'A discussion about movement, attention, and making space for creative thinking.\n\nWhat routines help you step back when you’ve been concentrating for too long? Please distinguish personal experience from research claims when sharing.', comments: comments('science') },
  { id: 'movies-perfect', community: 'movies', title: 'What film would you love to watch for the first time again?', author: 'endcredits', score: 1652, created: hoursAgo(5), commentCount: 326, flair: 'Discussion', body: 'That feeling when the credits roll and you just sit there for a minute. No spoilers please, but tell us which film gave you that feeling.', comments: comments('movies') },
  { id: 'outdoor-weekend', community: 'Outdoors', title: 'No signal, no plans. Just a very good weekend.', author: 'take_the_long_way', score: 4821, created: hoursAgo(1), commentCount: 153, flair: 'Outdoors', image: photo('forest'), body: 'Two days on the trail, one very cold lake, and the best coffee I’ve had in ages. A little time away goes a long way.', comments: comments('outdoors') },
  { id: 'news-city', community: 'worldnews', title: 'Cities are rethinking who their streets are for.', author: 'the_daily_brief', score: 1840, created: hoursAgo(1.5), commentCount: 237, flair: 'World', news: true, body: 'Sample news discussion: from protected cycle lanes to pedestrian squares, urban design continues to evolve.\n\nThis is a demonstration post, not a live news report. What changes would you like to see in your own neighborhood?', comments: comments('world') },
  { id: 'news-library', community: 'news', title: 'Local libraries find new ways to bring communities together.', author: 'public_interest', score: 1126, created: hoursAgo(2), commentCount: 106, flair: 'Community', news: true, body: 'Sample news discussion: libraries are becoming places for much more than borrowing books, with workshops, shared tools, and space to connect.\n\nThis is demonstration content, not a live news report.', comments: comments('news') },
];

export const getCommunity = (name: string): Community => communities.find(c => c.name === name) || { name, label: name.slice(0, 2).toLowerCase(), color: '#637254', background: '#e8eee0', description: '', members: '—', category: 'Reddit community' };
export function formatCount(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n); }
export function timeAgo(timestamp: number) {
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
}
