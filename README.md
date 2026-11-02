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

[Installation and Safari packaging](docs/INSTALL.md) · [Architecture and limitations](docs/ARCHITECTURE.md)

On a Mac with full Xcode/iOS SDK and Node.js 24, run `npm ci` then `npm run safari:prepare` to generate the Safari wrapper. Open the `.xcodeproj` under `build/safari`, select the iOS scheme, and configure your signing team for the containing app and extension before running on your iPhone. Generated native projects and signing settings stay out of Git; the extension source and packaging instructions remain in GitHub.

## Reading behavior

- Supports modern `shreddit-post` cards and old Reddit `.thing.link` cards, using only content already present on the opened page.
- Home opens Reddit's chronological `/new/` page. Reddit determines the feed using the browser's existing account session. Popular opens `/r/popular/`, News opens `/r/news/`.
- Provides New/Hot/Top navigation, native post/comment links, Reddit-provided thumbnails, local community shortcuts, and five recent communities. Explicitly marked NSFW/spoiler cards keep their image previews hidden.
- Choose Modern Reddit or Old Reddit in the preview's Page layout control or the extension's Reading layout control. Old Reddit uses compact numbered rows, a static score column, blue titles, tab navigation, and a right sidebar. The appearance is saved locally and works independently of Reddit's native page markup. Score arrows are decorative; use Show Reddit for voting.
- Modern cards show the community, native timestamp when available, a larger headline, a source URL when provided, and a right-side thumbnail. The rounded vote/comment controls open the native discussion; Join opens the community on Reddit. The post menu copies links or opens the original discussion/community. Share uses the browser's share sheet when available, falling back to copying the Reddit post URL with a visible error if clipboard access is denied. Preview sharing/copying is explicitly simulated.
- Omits explicitly marked promoted/recommendation cards. Unmarked recommendations cannot be reliably identified. This is not a guarantee about Reddit's feed selection.
- `Show Reddit` restores the original page and controls. The floating `Reading view` button returns to Pureddit. This is also how to load more native content: browse/scroll the original page, then return to the reading view.
- Discussion, profile, inbox, login, settings, wiki, and other non-feed pages remain in Reddit's native interface. Voting, commenting, posting, and Reddit subscription management happen there, not in a simulated Pureddit account.
- The extension popup enables/disables the reader and clears local shortcuts/recents. Shortcut changes do not follow/unfollow a subreddit on Reddit.
- If Reddit has not loaded supported cards, the reader shows an explicit empty/unsupported-layout message and offers the original view. Reddit login gates and access restrictions remain in place.

## Data and migration

There is **no backend, database, OAuth, token exchange, or Reddit API request** in this version. Extension state is limited to enabled status, layout preference, shortcut names, and five recent community names in `storage.local`. It is not transmitted. Reddit text and thumbnails are read from the current page, not persisted by the extension. Links and existing thumbnails can make normal browser requests when displayed or opened; the extension does not proxy or fetch its own feeds.

The retired React web app, account service, API routes, token helpers, manual imports, and their dependencies/tests have been removed. No application database files or database client were present, so no database migration or remote deletion was performed.

The preview stores only its own local settings under `pureddit:preview:v2`; it removes the old `pureddit:v1` and `pureddit:recent:*` demo records while preserving unrelated site data. Preview state is separate from installed extension preferences. Any old Vercel `REDDIT_*` or `SESSION_SECRET` variables are unused and can be removed from Vercel project settings. Old browser cookies, if any, are not used; clear site data to remove them. No credentials are included in the packages.

## Validation and remaining checks

Automated checks cover URL/permission boundaries, storage normalization, promotion markers, malicious post text/URLs, modern/old DOM fixtures, dynamic post updates, original-view restoration, popup interactions with simulated WebExtension storage, mobile overflow, accessibility, and package completeness.

The bundled content/popup scripts run in a **browser harness with simulated extension storage**. This is meaningful behavior testing, not an installed-extension test. This cloud machine's managed Chromium explicitly disallows unpacked-extension loading. The Firefox test-browser download is also blocked by its network policy. Firefox source is checked with Mozilla's `web-ext lint`; an actual Firefox install has not been verified here. Safari/iPhone build, signing, and device validation require macOS/Xcode and have not been performed here. Real Reddit layouts must still be checked on the user's browsers; fixture tests cannot establish live-site compatibility.

The GitHub workflow runs the build, tests, and Firefox validator. On GitHub-hosted runners it can additionally test the preview/harness in the Firefox engine. Optional manual Safari-project generation runs on macOS; that workflow must succeed before claiming an Xcode project has been produced. Store signing/submission and iPhone installation are separate steps requiring the owner's accounts.

Sample photography in the Vercel preview retains its notices in `public/images/`. It is not included in extension packages.
