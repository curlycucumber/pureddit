# Publishing Pureddit

The repository produces development packages. No publisher accounts have been registered, and no browser-store or TestFlight release has been published. Do not represent the ZIP downloads as signed or one-click mobile installations.

## Release candidates

Use Node.js 24. Run `npm ci`, `npm test`, `npm run lint:extension`, then `npm run release:prepare`. Versioned browser ZIPs, a review-source ZIP, instructions and SHA-256 checksums are written to `dist/release/`. Source archives use tracked files; include new files in Git before preparing a release. Their generated `SOURCE_FILES.json` permits repackaging from the review ZIP without a Git checkout. The GitHub Actions **Prepare release packages** workflow does these checks and uploads release candidates plus a separate Xcode wrapper source artifact from macOS. It does not publish anything or embed signing credentials.

Before submission, install each browser's package and test on the current signed-in Reddit website. The automated Chromium harness exercises public DOM fixtures and simulated extension storage, not the real Reddit account or an installed Safari extension. Check feed selection, ads, native editing/voting, video preferences, all appearance combinations, new tools, mobile keyboards, and disabling/restoration.

## Chrome Web Store

1. Register a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) and complete its required verification/registration steps.
2. Create an item and upload the Chrome release ZIP. Chrome signs extensions distributed through its store; a locally created CRX is not an equivalent public installation route.
3. Use the draft listing in `docs/STORE-LISTING.md`. Supply actual screenshots of the installed extension and the existing 128px icon. Review Chrome's current asset requirements in the dashboard.
4. Supply the hosted privacy policy at `https://pureddit.vercel.app/privacy.html`. Explain the storage permission and Reddit-only host access. Complete all store data-use disclosures accurately.
5. Submit for review. When approved, record the item ID/store URL, add the real installation link to the preview, and use increasing manifest versions for future uploads. Installed store copies then receive Chrome's normal updates.

## Firefox

1. Register at [Mozilla Add-ons](https://addons.mozilla.org/developers/) and choose listed or unlisted distribution. Both need Mozilla signing for ordinary permanent Firefox installs.
2. For an unlisted signed development release, create AMO API credentials. In this GitHub repository, create an environment named `publishing` and set secrets `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`. Set environment protection rules for your release process. Never commit credentials.
3. Run **Sign Firefox development release** from GitHub Actions. It runs build/tests/lint and requests an **unlisted** signed XPI via `web-ext sign`; download the `pureddit-signed-firefox` artifact if Mozilla completes signing. Mozilla can require review; a pending result is not an installable release.
4. For public discovery and standard store updates, submit the package and review-source ZIP through AMO as a **listed** add-on instead. Use `docs/STORE-LISTING.md` and the privacy policy. Do not assume the unlisted signing workflow publishes an AMO listing or configures automatic self-hosted updates.

The manifest's existing Gecko ID is stable. Preserve it across releases.

## Safari / iPhone / TestFlight

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) and configure App Store Connect. A free personal Xcode team can be useful for device testing but does not provide TestFlight distribution.
2. Register unique app/extension bundle identifiers and an App Store Connect app record. The extension identifier must start with the containing app's identifier.
3. On a Mac with full Xcode and Node.js 24, use `npm run safari:prepare` for a new wrapper, or `npm run safari:sync` to refresh the existing signed/configured wrapper. See `docs/INSTALL.md`. The macOS workflow artifact is wrapper **source**, not an IPA.
4. Open the iOS scheme in Xcode. Set the same signing team and suitable bundle identifiers on the app and extension targets. Check the containing app's icon, instructions, deployment target and entitlements. Set the marketing version to the extension release version and use a new numeric build number for each upload. Preserve any existing signing/native changes.
5. Run on your actual iPhone and verify Safari permissions, current mobile Reddit markup, preferences, native account actions and media. Browser viewport tests are not a substitute for this check.
6. Select a generic iOS device destination, choose **Product → Archive**, then use Organizer → **Distribute App → App Store Connect** to validate/upload with your account. Complete Apple's export-compliance and app metadata questions accurately.
7. Wait for processing, add internal testers, and arrange beta review for external testers as required. Only after an actual TestFlight invitation or public beta link exists should the preview offer it as an installation option.

Apple signing, account verification, paid enrollment, store review and a live TestFlight upload cannot be completed from this Linux environment without the owner's accounts and a validated signed iOS build. No unsigned IPA or Safari ZIP should be sent to users as though it were directly installable.
