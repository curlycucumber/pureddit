# Extension readiness audit

This is a development build. Automated fixture/harness checks cannot certify live Reddit or installed-browser compatibility.

## Fixed in this audit

| Gap | Result |
| --- | --- |
| Chronological `/new/` was being used as Home | Home defaults to Reddit's real Following tab; For You/Suggested is selectable on the same URL. No Home posts are shown until native tab selection is confirmed. |
| Overlay covered native account controls | Top-bar Create post, Notifications, Account, and the navigation/subscriptions action restore Reddit and activate native controls. Native menus stay usable until the user returns to the reader. |
| Recommendations and ads were always treated identically | For You includes recommendations; ads stay excluded. Other feed modes exclude recognized recommendations. |
| Native feed ads could remain visible in Show Reddit | Scoped cosmetic ad CSS applies to supported native feed pages and public shadow roots, and is removed on disable or leaving a feed. |
| Virtualized cards and late promotion labels | A bounded in-memory cache retains loaded cards and evicts content that later acquires an excluded marker. Native open-root updates are observed. |
| No explicit continuation control | Load more delegates to Reddit's own scrolling/old Next link. No backend feed request is added. |
| Generated Safari resources became stale | `npm run safari:sync` refreshes copied extension resources while preserving native project/signing files; unrelated targets are rejected. |
| Missing Xcode first-launch components caused converter crashes | The Mac helper checks first-launch status, iOS SDK, and CoreSimulator and reports recovery steps before conversion. |
| Appearance controls were easy to mistake for preview-only features | Modern/Old and Light/Dark controls are shared in a bar beneath the installed reader's header, with persisted preferences and four layout/theme combinations. |
| Vercel favicon used the retired logo | The preview now serves the exact orange/white p PNG used by the extension. |

## Still requires live validation

- Install on personal Chrome and Firefox desktop and signed Safari on an actual iPhone. The cloud Chromium policy prevents an installed-extension test here; its browser harness simulates WebExtension storage. Firefox engine download is blocked here. Safari signing/device testing cannot run on Linux.
- Test signed-in Home with the real Following/For You controls. Their URLs can be identical. Public tab labels and selected states must match the adapter; if Reddit changes its DOM or hides controls in closed roots, the reader must fail closed and allow native browsing.
- Check known promoted cards on all feeds against current Reddit markup. Cosmetic DOM filtering does not prevent advertising network requests and cannot guarantee detection of future unmarked ads.
- Verify live Create post, notifications, account menu/login/logout, and navigation/subscriptions. These use native UI; where selectors are unavailable, account/navigation actions reveal Reddit's original controls rather than fabricate menus. Create/notification actions have native-page fallbacks.
- Check real native loaders, mobile scroll containers, orientation, keyboard, permission prompts, SPA navigation, and Back/Forward. Load more may need Show Reddit for loaders that require additional user interaction; it is not a separate Reddit-fetch service or a guarantee of automatic infinite scrolling.
- Rebuild/reinstall the containing iOS app after syncing extension resources. An already installed wrapper does not update merely because GitHub/Vercel source changed.
- Verify the linked Vercel deployment and GitHub workflow results separately. The preview contains sample content and does not prove signed-in behavior.

Full browser-store distribution is separate: Chrome/Firefox publication/signing and Apple signing/TestFlight/App Store setup have not been completed here. Local development installation remains available as documented in INSTALL.md.

The Ko-fi link is deferred at the owner's request until their destination URL is available. No placeholder donation destination is shipped.
