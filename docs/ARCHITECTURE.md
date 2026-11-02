# Architecture

`shared/model.ts` validates preferences and Reddit URL boundaries. `shared/extract.ts` reads modern/old feed-card DOM. `shared/reader.ts` constructs a shadow-DOM reading view with static chrome and textContent for page-derived text. `shared/theme.css` uses container queries so the same UI adapts to actual browser width and the hosted iPhone-sized frame.

`extension/content.ts` reads feed pages, observes newly loaded cards, and handles native SPA URL changes. It overlays the reader while keeping native Reddit mounted. Original siblings are made inert/aria-hidden and scrolling is temporarily paused; Show Reddit, disabling, or leaving a feed restores the previous values. Native data/actions are not copied into a backend or invoked through an API. Body mutation observation detects changes but only supported feed routes are extracted; discussions/private/account pages never become reader models.

`extension/storage.ts` wraps the common promise-based browser/chrome storage APIs. The popup controls a single validated preference object. The extension requests storage plus permission on Reddit hosts only. It has no background worker, cookies permission, tab enumeration permission, web request interception, remote code, telemetry, or credential collection.

`src/preview.ts` creates sample modern/old DOM fixtures and passes them through the same extraction/renderer code. Its controls resize the preview frame; its links simulate navigation so illustrative post IDs are not represented as real threads. Preference data is separate from the extension. This preview cannot demonstrate extension installation, OS permission prompts, Safari engine behavior, or live Reddit selectors.

`scripts/build-extensions.mjs` bundles a self-contained content script and popup for each browser, adds browser-specific manifest metadata, and generates ZIPs in the Vercel output. Safari's resource bundle is an input to Apple's converter, not a signed iOS application.

## Maintenance boundaries

Reddit's markup, feed selection, and native loading behavior can change. The adapter intentionally supports known card shapes, uses explicit promotion/recommendation markers, and provides a native-view escape path when unsupported. It does not claim to identify all suggested content, force subscribed-only content on an arbitrary native page, or fetch missing pages. Home links to chronological `/new/`; the user's actual Reddit session determines their content.

No shared database exists. Browser-local shortcuts do not modify Reddit subscriptions. Clearing preview data or extension preferences cannot delete Reddit account content. Retiring the old web app does not revoke any historical OAuth grants automatically; those can be managed through Reddit's application settings if they were previously configured.
