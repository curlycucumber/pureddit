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
- Home opens Reddit's actual Home page and defaults to Your Feed (native Following) on each fresh page load. The adapter waits for native selection and updated content. Suggested Feed selects Reddit's For You tab and includes suggestions. If native tab selection cannot be confirmed, Home shows an explicit message and no posts; `/new/` is not treated as Following. Popular opens `/r/popular/`, News opens `/news`; `/r/news` is a separate community.
- Provides New/Hot/Top navigation, native post/comment links, Reddit-provided thumbnails, local community shortcuts, and five recent communities. Explicitly marked NSFW/spoiler cards keep their image previews hidden.
- The shared control bar directly below the header offers Modern/Old layout and Light/Dark theme in the installed extension and preview. Both choices are saved locally; existing settings default to Light without losing shortcuts. Old Reddit uses compact numbered rows, a static score column, blue titles, tab navigation, and a right sidebar. Appearance works independently of Reddit's native page markup. Score arrows are decorative; use Show Reddit for voting.
- Modern cards show the community, native timestamp when available, a larger headline, a source URL when provided, and a right-side thumbnail. The rounded vote/comment controls open the native discussion; Join opens the community on Reddit. The post menu copies links or opens the original discussion/community. Share uses the browser's share sheet when available, falling back to copying the Reddit post URL with a visible error if clipboard access is denied. Preview sharing/copying is explicitly simulated.
- Recognized ad/promoted cards are always omitted, including in For You. Scoped CSS hides known ad containers in the original native feed as well, including accessible shadow roots. Recommendation markers are filtered outside For You. This is cosmetic filtering of known DOM markers, not network-level blocking or a promise that future unmarked ads will be recognized.
- In Old/compatibility reading view, the hamburger opens navigation, recent communities, and local shortcuts; account buttons activate Reddit's original controls. Current-site Modern retains Reddit's native navigation, search and account controls beneath one compact Pureddit appearance bar. The reader yields to Reddit while account menus are used; the floating Reading view button returns. Missing native selectors do not create fake account menus or state.
- Load more posts asks Reddit's original scroll loader to add content, or follows old Reddit's native Next link. There is no Pureddit feed API request. If Reddit requires another interaction, use Show Reddit to browse/scroll the original page and return with Reading view. Up to 500 feed posts are kept in tab memory so native virtualization does not immediately erase already read cards; feed changes clear that cache, and late ad/recommendation markers evict excluded cards.
- Discussion, profile, inbox, login, settings, wiki, and other non-feed pages remain in Reddit's native interface. Voting, commenting, posting, and Reddit subscription management happen there, not in a simulated Pureddit account.
- The extension popup enables/disables the reader and clears local shortcuts/recents. Shortcut changes do not follow/unfollow a subreddit on Reddit.
- If Reddit has not loaded supported cards, the reader shows an explicit empty/unsupported-layout message and offers the original view. Reddit login gates and access restrictions remain in place.

## Data and migration

There is **no Pureddit backend, database, OAuth, token exchange, or direct Reddit API client**. Explicit Light/Dark selections use Reddit’s own display controls; Reddit’s frontend saves its setting through the existing signed-in session. Pureddit never reads credentials or builds private account requests. Persistent extension state is limited to enabled status, layout/color theme and reading preferences, distraction choices, literal title-filter phrases, keyboard preference, shortcut names, and five recent community names in `storage.local`. Shortcuts and recent-community records are not transmitted. A user-requested display change is submitted by Reddit’s native interface, like a manual setting change. Reddit text and thumbnails are read from the current page and may be cached in tab memory; they are never saved to extension storage. Links and existing thumbnails can make normal browser requests when displayed or opened; the extension does not proxy or fetch its own feeds.

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


Version 0.3.9 keeps Modern feeds inside the current Reddit app instead of copying their posts into a second feed. Native images, galleries and video players stay in their original DOM, so Reddit handles loading, autoplay, mute state and profile preferences. Pureddit never forces playback or introduces an autoplay preference. Your Feed/Suggested Feed selection and cosmetic ad/recommendation filtering remain active. Old keeps the compact reader; older page layouts without `shreddit-app` use the compatibility reader. The preview illustrates expanded image posts and compact outbound-link previews with local sample content.

The compact/compatibility reader caches parsed metadata, reuses unchanged cards and navigation, and coalesces updates at animation frames. Root discovery inspects added subtrees and known shadow hosts instead of periodically querying the entire document. Feed updates pause in background tabs and catch up when visible. Browser bundles are minified. See [performance measurements](docs/PERFORMANCE.md); these are controlled Chromium fixtures, not a live Reddit speed guarantee.

Version 0.3.10 avoids Modern feed rescans for native score/text updates, batches nested DOM discovery, reuses discovered roots for account actions, and disconnects/releases caches while disabled. Ad/selection/hidden-state checks and fresh metadata after re-enabling remain covered by regressions. Follow-up work counts are in the performance notes.

Version 0.3.11 removes stacked navigation on the current app: Pureddit contributes a compact appearance bar, while Reddit supplies the single native navigation/account/search interface. Home labels are applied to Reddit’s existing tab buttons, retaining their events. Local palette overrides cover open shadow components and do not modify account preferences. Native Old discussions use denser classic styling. News points to `/news`, distinct from the `/r/news` community.

Version 0.3.12 synchronizes explicit Light/Dark clicks with Reddit’s native Display mode options (`theme-option-*` and native selection state). The account menu is opened only when needed; an already selected option is left alone. Startup and native theme changes follow Reddit’s rendered theme. Missing/failed native controls show a settings link and never report profile success based on Pureddit CSS alone. The hosted preview remains local-only.

Version 0.3.13 recognizes native ad-click attributes, Advertisement labels and Reddit ad redirect links, including markers inside nested open shadow roots. It hides the enclosing card rather than only its transparent click overlay. Scoped metadata disclosures and late marker changes also remove ads from the compact reader cache. Cosmetic filtering stays active in Show Reddit and supported native discussions/account pages while Pureddit is enabled; disabling restores the original page. Ordinary post text or usernames mentioning ads are not disclosure labels.

## Reading tools (0.4.0)

The top bar's **Preferences** button adds optional text size, Automatic/Focused/Wide content width, Comfortable/Compact spacing, and individual sidebar cleanup for Games, Explore, Recent posts and recommended communities. Defaults preserve the existing presentation. Supported sidebar markers/headings are scoped away from post content, joined-community lists and subreddit rules.

Title filters match up to 30 literal case-insensitive words/phrases in feed titles only. The filtered-post count can reveal/hide matching posts for the current feed; revealing them never reveals ads or bypasses Following selection. Native post/comment pages remain readable. **Reset these preferences** restores the new options without removing shortcuts, layout or theme.

**Shortcuts** opens a searchable community dialog on Modern, Old and the preview. Five recent communities appear before pinned communities. Pin/unpin locally, or open Reddit's own communities control to manage subscriptions. There is no additional subscriptions request or stored account data.

Optional desktop keyboard navigation uses J/K for posts, Enter/O to open, C for comments and Escape to return after opening with a shortcut. It stays inactive in inputs, contenteditable editors, menus and tool dialogs. Focused links keep their normal Enter action. Native media nodes, autoplay settings and account actions remain with Reddit.

[Publishing preparation](docs/PUBLISHING.md) · [Draft store listing](docs/STORE-LISTING.md) · [Privacy policy](https://pureddit.vercel.app/privacy.html). Publisher accounts are not configured; the new release-candidate and optional Firefox-signing workflows do not mean a store/TestFlight release exists.
