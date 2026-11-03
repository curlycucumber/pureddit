# Pureddit

A compact reading view for Reddit, packaged as a WebExtension. The Vercel website is now an **extension design preview with sample content**, not a Reddit API client.

The preview and the Firefox, Chrome, and Safari packages use the same DOM adapter, renderer, and stylesheet in `shared/`. The visible logo stays lowercase **pureddit**.

## What runs where

| Location | Purpose |
| --- | --- |
| GitHub | Source, tests, build workflow, and downloadable development artifacts |
| Vercel | Static desktop/iPhone-sized design preview and development ZIP downloads |
| Chrome / Firefox desktop | Reading view on Reddit feed pages the user opens |
| Safari on iPhone | The same WebExtension source, inside an Xcode-generated and signed Apple wrapper |

Vercel does not run the extension inside Reddit. Choosing Safari in the preview changes the viewport; it does not emulate Safari or verify installation on an iPhone.

## Development

Use Node.js 24, then:

```sh
npm ci
npm run dev
```

Open the local Vite server to review the shared UI. In the Codex cloud workspace, use `npm ci --cache /tmp/pureddit-npm-cache` if the default npm cache is not writable.

```sh
npm run build
npm test
npm run lint:extension
```

`npm run build` type-checks, builds the Vercel preview, and generates:

```text
dist/extensions/chrome/
dist/extensions/firefox/
dist/extensions/safari/
dist/downloads/pureddit-chrome.zip
dist/downloads/pureddit-firefox.zip
dist/downloads/pureddit-safari.zip
```

`npm test` rebuilds packages before model/packaging tests and Playwright browser checks. `npm run preview` serves the production preview and its generated downloads.

[Installation and Safari packaging](docs/INSTALL.md) · [Architecture and limitations](docs/ARCHITECTURE.md) · [Readiness audit](docs/READINESS.md)

On a Mac with full Xcode/iOS SDK and Node.js 24, run `npm ci` then `npm run safari:prepare` to generate the Safari wrapper. Open the `.xcodeproj` under `build/safari`, select the iOS scheme, and configure your signing team for the containing app and extension before running on your iPhone. Generated native projects and signing settings stay out of Git; the extension source and packaging instructions remain in GitHub.

## Reading behavior

- Supports modern `shreddit-post` cards and old Reddit `.thing.link` cards, using only content already present on the opened page.
- Home opens Reddit's actual Home page and defaults to Following on each fresh page load. The adapter selects Reddit's same-page Following tab and waits for its selected state before showing Home posts. For You selects the native For You/Suggested tab and includes suggestions. If native tab selection cannot be confirmed, Home shows an explicit message and no posts; `/new/` is not treated as Following. Popular opens `/r/popular/`, News opens `/r/news/`.
- Provides New/Hot/Top navigation, native post/comment links, Reddit-provided thumbnails, local community shortcuts, and five recent communities. Explicitly marked NSFW/spoiler cards keep their image previews hidden.
- The shared control bar directly below the header offers Modern/Old layout and Light/Dark theme in the installed extension and preview. Both choices are saved locally; existing settings default to Light without losing shortcuts. Old Reddit uses compact numbered rows, a static score column, blue titles, tab navigation, and a right sidebar. Appearance works independently of Reddit's native page markup. Score arrows are decorative; use Show Reddit for voting.
- Modern cards show the community, native timestamp when available, a larger headline, a source URL when provided, and a right-side thumbnail. The rounded vote/comment controls open the native discussion; Join opens the community on Reddit. The post menu copies links or opens the original discussion/community. Share uses the browser's share sheet when available, falling back to copying the Reddit post URL with a visible error if clipboard access is denied. Preview sharing/copying is explicitly simulated.
- Recognized ad/promoted cards are always omitted, including in For You. Scoped CSS hides known ad containers in the original native feed as well, including accessible shadow roots. Recommendation markers are filtered outside For You. This is cosmetic filtering of known DOM markers, not network-level blocking or a promise that future unmarked ads will be recognized.
- The hamburger opens navigation, recent communities, and local shortcuts. Its Reddit navigation/subscriptions button, plus Create post, Notifications, and Account, activate Reddit's original controls after restoring the native page. The reader yields to Reddit while account menus are used; the floating Reading view button returns. Missing native selectors do not create fake account menus or state.
- Load more posts asks Reddit's original scroll loader to add content, or follows old Reddit's native Next link. There is no Pureddit feed API request. If Reddit requires another interaction, use Show Reddit to browse/scroll the original page and return with Reading view. Up to 500 feed posts are kept in tab memory so native virtualization does not immediately erase already read cards; feed changes clear that cache, and late ad/recommendation markers evict excluded cards.
- Discussion, profile, inbox, login, settings, wiki, and other non-feed pages remain in Reddit's native interface. Voting, commenting, posting, and Reddit subscription management happen there, not in a simulated Pureddit account.
- The extension popup enables/disables the reader and clears local shortcuts/recents. Shortcut changes do not follow/unfollow a subreddit on Reddit.
- If Reddit has not loaded supported cards, the reader shows an explicit empty/unsupported-layout message and offers the original view. Reddit login gates and access restrictions remain in place.

## Data and migration

There is **no backend, database, OAuth, token exchange, or Reddit API request** in this version. Persistent extension state is limited to enabled status, layout/color theme preferences, shortcut names, and five recent community names in `storage.local`. It is not transmitted. Reddit text and thumbnails are read from the current page and may be cached in tab memory; they are never saved to extension storage. Links and existing thumbnails can make normal browser requests when displayed or opened; the extension does not proxy or fetch its own feeds.

The retired React web app, account service, API routes, token helpers, manual imports, and their dependencies/tests have been removed. No application database files or database client were present, so no database migration or remote deletion was performed.

The preview stores only its own local settings under `pureddit:preview:v2`; it removes the old `pureddit:v1` and `pureddit:recent:*` demo records while preserving unrelated site data. Preview state is separate from installed extension preferences. Any old Vercel `REDDIT_*` or `SESSION_SECRET` variables are unused and can be removed from Vercel project settings. Old browser cookies, if any, are not used; clear site data to remove them. No credentials are included in the packages.

## Validation and remaining checks

Automated checks cover URL/permission boundaries, storage normalization, promotion markers, malicious post text/URLs, modern/old DOM fixtures, dynamic post updates, original-view restoration, popup interactions with simulated WebExtension storage, mobile overflow, accessibility, and package completeness.

The bundled content/popup scripts run in a **browser harness with simulated extension storage**. This is meaningful behavior testing, not an installed-extension test. This cloud machine's managed Chromium explicitly disallows unpacked-extension loading. The Firefox test-browser download is also blocked by its network policy. Firefox source is checked with Mozilla's `web-ext lint`; an actual Firefox install has not been verified here. Safari/iPhone build, signing, and device validation require macOS/Xcode and have not been performed here. Real Reddit layouts must still be checked on the user's browsers; fixture tests cannot establish live-site compatibility.

The GitHub workflow runs the build, tests, and Firefox validator. On GitHub-hosted runners it can additionally test the preview/harness in the Firefox engine. Optional manual Safari-project generation runs on macOS; that workflow must succeed before claiming an Xcode project has been produced. Store signing/submission and iPhone installation are separate steps requiring the owner's accounts.

Sample photography in the Vercel preview retains its notices in `public/images/`. It is not included in extension packages.

## Interactive discussion preview

On the Vercel preview, click a sample post title or its comment count to open a discussion. Try post/comment votes, nested replies, collapsing threads, Best/New sorting, saving a post, and copying the preview link. Modern/Old and Light/Dark controls remain available. Back to feed and browser Back/Forward preserve your place; hash links can open a sample discussion directly.

Discussion text, votes, saves, and drafts live only in page memory and reset on reload. No Reddit credentials, API requests, or account writes are involved. These are clearly labeled interaction mock-ups; the installed extension still opens Reddit's native discussion/account interface. The preview does not establish that Reddit's own commenting UI matches the sample.

Click the thread line or minus/plus control to collapse/expand replies. Upvotes are orange and downvotes blue. The comment, reply, and post editors offer Bold, Italic, lists, quotes, inline code, and a formatted preview. Create a local text post with the header's + button, then edit its body; edit controls appear only on your own demo content. Published titles stay fixed as on Reddit. Formatting supports a limited Markdown subset and renders HTML as literal text.

Native discussions, profiles, notifications, and post composers keep Reddit’s functional interface with Pureddit colors and a persistent Pureddit header and feed navigation. The native Modern/Old treatment changes typography and spacing; it does not reproduce the preview’s custom discussion layout. Home tab detection accepts additional explicit selection markers, and unchanged extracted feeds preserve their existing reader cards.

Version 0.3.5 starts as soon as the document body exists, shows the destination feed while Reddit navigates, and keeps the old feed from repopulating during the transition. Discussions and native account actions retain the Pureddit header, appearance controls, and Home/Popular/News links above Reddit’s live interface. These pages still use Reddit’s real content and editors; the preview’s simulated discussion is not substituted for a real post.

Version 0.3.6 uses Reddit’s native link navigation, caches open-root discovery, ignores unrelated hover-class mutations, and prevents stale cards from the preceding feed during a client-side route transition. Post-page palettes apply to nested Reddit theme containers. No Reddit application internals or private session state are invoked.

Home uses **Your Feed** (Reddit’s Following) and **Suggested Feed** (Reddit’s For You). Your Feed is the default on startup and when returning Home. Selecting Suggested Feed is an explicit session action, not a saved default. The reader waits for native Following selection and changed content, and excludes unchanged cards retained from a prior suggested feed during the transition.

Version 0.3.8 releases pending navigation on native redirects and explicit cancellation, honors explicit native tab deselection over stale highlights, and evicts hidden/excluded cards from the reader cache. The popup can disable Pureddit immediately during a stalled transition.
