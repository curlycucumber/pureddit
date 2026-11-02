# Pureddit

Reddit, with room to breathe. A responsive React and TypeScript client with a subscription-only Home feed, separate Popular and News feeds, and a compact interface inspired by old.reddit.com.

## Run locally

Use Node.js 24 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

The development server uses port 5173 and includes the same API handlers used on Vercel. Without OAuth settings, you can explore the separate, browser-local demo. In the Codex cloud workspace use `npm ci --cache /tmp/pureddit-npm-cache` to keep npm's cache writable.

```sh
npm run build
npm run preview
```

Preview also serves the API handlers locally. It does not validate Vercel's deployment infrastructure. For local OAuth testing, register the actual local callback origin/port and set matching values in an ignored `.env.local`; copy the field names from `.env.example`. Local HTTP callbacks are accepted only for localhost or 127.0.0.1. Never use production credentials on untrusted preview URLs.

## Deploy and enable Reddit sign-in

Connect `curlycucumber/PUREDDIT` to Vercel with `main` as the production branch and the repository root as the root directory. `vercel.json` specifies Vite, `npm ci`, `npm run build`, and the `dist` output directory. Vercel deploys the `api/` TypeScript functions alongside the frontend.

1. Obtain the Reddit API access/approval required for your use case and register an OAuth **web app**, not a script app, through Reddit's current developer process. Reddit may restrict app creation and API use; implementing OAuth does not grant approval.
2. Register this exact redirect URI in the Reddit app:

   ```text
   https://pureddit.vercel.app/api/auth/callback
   ```

3. In **Vercel → Project → Settings → Environment Variables**, add the following server-only values to **Production**. Do not put secrets in chat, Git, or any `VITE_` variable.

   | Variable | Value |
   | --- | --- |
   | `REDDIT_CLIENT_ID` | The OAuth web app's client ID |
   | `REDDIT_CLIENT_SECRET` | The OAuth web app's client secret |
   | `REDDIT_REDIRECT_URI` | `https://pureddit.vercel.app/api/auth/callback` |
   | `SESSION_SECRET` | A unique cryptographically random secret, at least 32 bytes; generate with `openssl rand -hex 32` |
   | `REDDIT_USER_AGENT` | A descriptive Reddit API user agent, e.g. `web:pureddit:0.2.0 (by /u/YOUR_REDDIT_USERNAME)` |

4. Redeploy the Vercel project after saving the variables. These are **Vercel runtime settings**; adding variables to a Codex cloud workspace does not configure Vercel.
5. Choose **Sign in with Reddit → Continue to Reddit**, authorize on Reddit's website, and return to Pureddit. Verify your username, communities, Home feed, saved posts, and profile. Check a reversible vote before intentionally posting content. Authorization and account writes could not be verified against a real account during development because credentials were unavailable.

For a custom domain, update both the registered Reddit redirect and `REDDIT_REDIRECT_URI` to the same exact origin and callback path. Preview deployments need a separately registered callback and appropriate preview credentials. Production cookies are host-only, Secure, HttpOnly, and SameSite=Lax.

## Connected account behavior

### Read Only test page

Open `https://pureddit.vercel.app/#/read-only` or choose **Read Only** in the sidebar. This separate page fetches only `r/popular` and `r/news`, with Hot/New/Top sorting and cursor pagination. Titles open the original discussion on Reddit. It makes no session request, sends no account cookies, and has no sign-in, voting, commenting, saving, or submission controls. The dedicated `/api/read-only` endpoint accepts GET only and always uses public JSON listings, even if the visitor is signed into the main app. Reddit can still block or rate-limit these reads; an error and external Reddit link are shown instead of sample posts. The page does not bypass API access requirements. Subreddit following is not part of this initial two-feed experiment.

- **Account:** Reddit OAuth authorization-code flow, profile username/karma/account age, automatic access-token refresh, and sign-out with token revocation. Pureddit never collects your Reddit password.
- **Home:** newest posts by default, filtered on the server against the complete returned subscription list. Empty subscriptions do not fall back to default or recommended communities. Promoted posts are removed.
- **Popular:** Reddit's popular listing. **News:** `r/news`, not Reddit's proprietary News tab. Both pages fetch live listings while signed out through Reddit's public JSON endpoints, and use OAuth when signed in. Public access can be blocked or rate-limited by Reddit; errors are shown without substituting demo posts. Reading public post discussions works without sign-in; account actions still require authorization.
- **Sorting:** Reddit New/Hot/Top (Top uses the past week). No client-side recommendation system. Listing cursors provide a Load more posts button.
- **Communities:** real subscriptions, searchable discovery, join/leave actions, individual feeds, and five unique recently visited communities. Recents are stored separately per account in browser storage; Reddit subscriptions remain on Reddit.
- **Posts:** live discussions, Markdown, reversible votes, save/unsave, text/link submission, deletion of your own posts/comments, your submitted-post listing, and original Reddit share links.
- **Comments:** fetched comment trees and nested replies, live submission and voting. The first returned tree is limited to 100 comments; omitted/continued threads link to the complete Reddit discussion.
- **Errors:** failed writes never silently become local demo actions. Authorization failures and rate limits display meaningful errors. Signed-in content and tokens are not persisted in localStorage.

This is a focused Reddit client, not full feature parity with Reddit's apps. Image/video uploads, inbox/chat, moderation tools, inline editing, saved comments, and expansion of omitted comment trees are not implemented. Use the full Reddit profile/discussion links for those workflows. Listing endpoints follow Reddit's access controls, policies, and rate limits. Very large subscription lists are bounded at 30 pages (up to 3,000 communities) and fail explicitly if they cannot be loaded completely.

## Sessions and security

`api/auth/[action].ts` handles authorization, callback, session status, and logout. `api/reddit.ts` exposes a fixed set of authenticated operations; it cannot proxy arbitrary URLs. Tokens are encrypted with AES-256-GCM in an HttpOnly cookie and are never returned to frontend JavaScript. No separate database is needed: Reddit stores connected account actions. A session lasts at most 30 days and requires reauthorization afterward. Rotating `SESSION_SECRET` invalidates existing encrypted sessions; users must reconnect. Do not log cookies or token responses.

OAuth state is random, encrypted, bound to the browser cookie, and expires in 10 minutes. Writes require a matching configured Origin, a custom request header, and JSON content type. API responses disable caching. Markdown skips raw HTML and uses safe link handling.

Requested scopes: `identity read mysubreddits vote submit edit subscribe save history`. No moderation, private-message, or chat permissions are requested. Sign-out attempts to revoke the Reddit refresh token and always clears the local session when the request succeeds; if Reddit is unavailable, the UI explains how to revoke access from Reddit's app settings.

## Demo mode

Without a connected account, bundled sample posts and the `u/you` identity remain available. Demo votes, posts, subscriptions, comments, and bookmarks stay in `pureddit:v1` in browser local storage and never migrate into Reddit. Clear that key to reset the demo. Sample scores and comment totals are illustrative. A link to a demo-created post cannot transfer its content to another browser. Browser storage failure allows in-memory demo use with a notice.

## Validation

```sh
npm run build
npm test
# Or independently:
npm run test:deployment
npm run test:server
npm run test:browser -- --workers=3
```

The deployment suite compiles API handlers to JavaScript and cold-loads them in native Node without a TypeScript loader, reproducing Vercel’s module resolution. The `rewriteRelativeImportExtensions` compiler setting is required so `.ts` source imports become deployed `.js` imports. Local Vite success alone does not verify this.

The server suite tests OAuth redirects, state rejection, token exchange/refresh/revocation, cookie encryption, session expiry, request-origin checks, bounded API operations, subscription-only Home filtering, and normalized responses. Provider responses are stubbed; tests do not access or change real Reddit accounts.

Playwright tests cover the demo and simulated signed-in workflows, including account screens, pagination, votes, saves, subscriptions, comments/replies, submissions, failed API actions, sign-out, mobile layout, accessibility, and invalid routes. It starts/reuses the development server. It uses `/usr/bin/chromium` when present; otherwise run `npx playwright install chromium`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for another installed Chromium executable.

## Project structure

- `src/App.tsx`: screens, navigation, demo state, and connected interactions.
- `src/reddit.ts`: same-origin API client and account/session state.
- `src/data.ts`: shared view types and sample data.
- `server/`: encrypted session helpers, Reddit HTTP requests, and normalization.
- `api/`: Vercel Node functions, also used by the local Vite middleware.
- `tests/`: backend/security checks and Playwright browser workflows.
- `public/images/`: locally bundled sample photography and source notices.

Demo fonts/images are served locally; live post images come from Reddit-provided HTTPS URLs. DM Sans and Manrope use the SIL Open Font License via Fontsource; licenses ship with the installed packages. Lucide icons use the ISC license.
