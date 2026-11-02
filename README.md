# PUREDDIT

Reddit, with room to breathe. A responsive React and TypeScript prototype of a minimalist Reddit client, inspired by the clarity of old.reddit.com.

## Run locally

Use Node.js 24 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

The development server uses port 5173. To build and serve the production bundle:

```sh
npm run build
npm run preview
```

## Deploy to Vercel

Connect `curlycucumber/PUREDDIT` to a Vercel project with `main` as the production branch and the repository root as the root directory. `vercel.json` configures the Vite framework, `npm ci`, `npm run build`, and the `dist` output directory. Pushes to `main` trigger Vercel's Git integration. No environment variables are required for this prototype.

The deployed app is publicly hosted, but demo votes, comments, and created posts still belong to each visitor's browser. Hosting does not add a shared database or Reddit account integration.

In the Codex cloud workspace, use `npm ci --cache /tmp/pureddit-npm-cache` so npm's cache stays in a writable directory. No credentials, environment variables, backend, or database are required.

## What works

- **Home:** only posts from joined communities, newest first by default. Joining or leaving immediately changes the feed. No suggested posts or advertisements.
- **Popular and News:** separate sample feeds, with New, Hot, and Top sorting. Hot uses a simple local score-and-age formula; it does not recommend communities.
- **Communities:** searchable directory, join/leave controls, individual community feeds, and five unique recent communities ordered by last visit at the top of the sidebar.
- **Posts:** individual post pages, reversible upvotes/downvotes, bookmarks and a saved-post feed, text/link creation, deletion of your own posts, and shareable routes.
- **Discussions:** comments, nested replies, comment voting, and deletion of your own comments. Sample threads display a small selection of illustrative comments; their total counts are sample metadata.
- **Navigation:** search, compact feed view, browser back/forward and direct hash links, mobile menu, keyboard-accessible dialogs, skip link, and `/` to focus search.
- **Persistence:** posts, comments, votes, subscriptions, recent communities, and bookmarks survive reloads using browser local storage. Storage failures display a notice and allow in-memory use.

## Prototype boundaries

This version uses bundled sample data, not Reddit's API. It does not authenticate, read your Reddit subscriptions, or send votes, comments, or posts to Reddit. All account actions use the demo identity `u/you` and stay in this browser. A link to a locally created post does not transfer its content to another browser. Clearing the `pureddit:v1` local-storage key resets demo data.

Real Reddit integration is a separate phase requiring approved Reddit API access and OAuth authorization. That phase should replace the local data layer with authenticated listings, subscriptions, voting, commenting, and submission endpoints, while preserving the Home subscription filter and respecting Reddit's current API terms and rate limits. Never embed a confidential OAuth client secret in the frontend.

## Validation

```sh
npm run build
npm test
```

Playwright automatically starts the dev server or reuses one already running outside CI. It uses `/usr/bin/chromium` when available; otherwise install its browser with `npx playwright install chromium`. An alternative system executable can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

The browser tests cover subscription filtering, feed tabs and sorting, vote toggling and persistence, bookmarks, post creation/deletion, comments and replies, recent-community ordering, search, compact view, link validation, mobile navigation, accessibility, and invalid routes.

## Project structure

- `src/App.tsx`: screens, browser persistence, navigation, and local interactions.
- `src/data.ts`: typed sample communities, posts, and comments.
- `src/styles.css`: responsive layout and visual design.
- `tests/app.spec.ts`: end-to-end checks using Playwright and axe.
- `public/images`: bundled sample photography and source notices.

Fonts and images are served locally so browsing does not depend on third-party asset hosts. DM Sans and Manrope are distributed through Fontsource under the SIL Open Font License; their licenses are included with their installed packages. Lucide icons use the ISC license.
