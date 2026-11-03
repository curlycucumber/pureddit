# Install and test Pureddit

These are unsigned **development packages**, not published store releases. Keep Reddit's normal website available while testing. No Pureddit account, Reddit API approval, or API keys are needed to restyle a page you can already open. The extension does not bypass Reddit login, browser permissions, or site access controls.

## Chrome desktop

1. Download `pureddit-chrome.zip` from the Vercel preview, or run `npm ci && npm run build`.
2. Extract the ZIP into a permanent folder. The selected folder must directly contain `manifest.json`.
3. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select that folder (or `dist/extensions/chrome`).
4. Open `https://www.reddit.com/r/popular/`, `https://www.reddit.com/r/news/`, or `https://www.reddit.com/` and allow access to Reddit if requested.
5. Use the toolbar popup to enable/disable the reader. Refresh existing Reddit tabs after installing/updating. Do not grant access to unrelated websites.

Managed Chrome installations can prohibit unpacked extensions. That is an administrator restriction; use an authorized personal/development browser or an approved published distribution rather than changing managed policy.

## Firefox desktop

1. Download/extract `pureddit-firefox.zip`, or use `dist/extensions/firefox` after building.
2. In Firefox 142 or later, open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on**, then select the extracted `manifest.json`.
4. Open the Reddit feed URLs above. Test the popup, native-view toggle, and shortcuts.

Temporary add-ons are removed when Firefox closes. Permanent standard-Firefox distribution requires Mozilla signing/AMO publication. A ZIP from Vercel is not a signed XPI and must not be advertised as a permanent one-click installation.

## Safari on iPhone

The Safari ZIP contains WebExtension resources. **An iPhone cannot install that ZIP directly**, and the Vercel iPhone preview is not an installed Safari extension.

On a Mac with full Xcode installed and selected, install Node.js 24 if `node -v` is missing or shows a different major version. The [official Node.js download](https://nodejs.org/en/download) provides macOS installers. Xcode needs a local build checkout; GitHub remains the source of truth.

For a new checkout, run:

```sh
git clone https://github.com/curlycucumber/pureddit.git
cd pureddit
npm ci
npm run safari:prepare
open build/safari
```

If the repository is already on your Mac, use that checkout and update it with `git pull --ff-only` before running the npm commands. Preserve any local changes; do not clone over an existing directory.

`safari:prepare` builds the extension, checks that full Xcode and the iOS SDK are available, and runs Apple's `safari-web-extension-converter` to generate a Swift wrapper project under `build/safari`. Finder opens the generated folder with the final command; open the `.xcodeproj` inside it. Full Xcode is required; Command Line Tools alone do not supply the required tools.

The converter refuses to overwrite an existing generated project, preserving any signing/native changes. To generate a separate wrapper after rebuilding, run `bash scripts/convert-safari.sh build/safari-another`. Its copied extension resources reflect the build at conversion time; a subsequent web-source build does not update the existing Xcode project's copied resources automatically.

After source updates, refresh the resources in your existing wrapper without replacing signing settings:

```sh
git pull --ff-only
npm ci
npm run safari:sync
```

For a custom wrapper location use `npm run safari:sync -- build/safari-another`. The sync requires a generated Xcode project with matching Pureddit resource manifests and updates only extension resources. Then rebuild/run the iOS app in Xcode and refresh existing Reddit tabs on your iPhone. Do not run the converter over a signed/configured project merely to update its JavaScript.

To choose your own identifier before generating the project, run `PUREDDIT_BUNDLE_ID=com.yourname.pureddit npm run safari:prepare`, replacing `yourname` with your own identifier component.

1. Open the generated Xcode project. Choose the **iOS app scheme**, not the macOS scheme, from the toolbar.
2. Add your Apple account in **Xcode → Settings → Accounts**. Under **Signing & Capabilities** select your team and enable automatic signing for **both the iOS app and Safari extension targets**. Set unique bundle identifiers your team can register; the extension identifier must start with the containing app's identifier (for example, `com.yourname.pureddit` and `com.yourname.pureddit.extension`). The repository's default is an example, not a registered identifier for your account.
3. Connect and trust your iPhone, then select it as the run destination and choose **Product → Run**. Follow Xcode's developer-mode/trust instructions for your device; on supported iOS versions Developer Mode is under **Settings → Privacy & Security**. Use Safari/iOS 16.4 or later. If a device's newer iOS is unsupported by Xcode, update Xcode before trying again. A simulator run can help check the wrapper but does not establish device signing or live Reddit compatibility.
4. Enable Pureddit in Safari's extension settings (typically Settings → Apps → Safari → Extensions on current iOS). Grant access to Reddit, not all websites.
5. Open a Reddit feed in Safari. Verify the reader, Communities button, Show Reddit, popup toggle, and native discussion navigation.

Apple signing and testing on an actual iPhone remain necessary. Personal development installation is different from TestFlight/App Store distribution, which normally requires Apple Developer Program membership and App Store Connect setup. No Apple account, certificate, signing profile, or paid store submission was created by this task.

### Missing CoreSimulator or first-launch components

If the converter reports `IDESimulatorFoundation`, `CoreSimulator.framework`, or a required plug-in failing to load, quit Xcode and complete Apple's first-launch setup:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
xcrun simctl list devices
```

After those finish without errors, retry `npm run safari:prepare`. The script checks first-launch status and simulator support before invoking the converter. A missing `build/safari` folder after a converter crash means generation did not finish. If first-launch setup or `simctl` still fails, complete the platform/component setup in Xcode or repair/reinstall Xcode; changing the extension's JavaScript will not repair missing Apple frameworks. Keep any existing generated project and signing changes.

The shared Safari source and converter command are prepared here; this Linux workspace cannot execute Xcode or certify iPhone compatibility. A manually dispatched GitHub workflow can generate a wrapper project on a macOS runner, but device signing/testing still belongs to the owner.

## User acceptance checks

- Test both `www.reddit.com` and `old.reddit.com` feeds while signed in and signed out.
- Confirm native Reddit has loaded posts before comparing the reading view.
- Confirm title/thumbnail accuracy, filters, and New/Hot/Top navigation.
- On signed-in modern Reddit Home, confirm Following is actually selected in Reddit, switch For You and back, and verify the URL can stay the same. Home must not display posts under Following if the native tab cannot be verified. Signed-out and old Reddit Home may require opening modern Reddit/signing in first.
- Check recognized ads remain hidden on Home/Popular/News and when Show Reddit is active. Disable the extension and confirm its injected styles and interaction restrictions are removed.
- Check the hamburger dropdown and its native navigation/subscriptions action, Create post, Notifications, and Account. Native account controls must remain usable until you choose Reading view again; no popup should display invented account information.
- Use Load more posts; check the native feed adds cards, or use Show Reddit if its loader requires another action. Scroll long feeds to check native virtualization does not erase the entire reading view.
- Use Modern/Old and Light/Dark in the shared control bar below the header. Check all four combinations, compact classic rows/right sidebar on desktop, mobile Communities access, and persistence after refreshing. The same controls are present inside the Vercel preview.
- Add/remove a local shortcut and visit six communities; only five recents should remain.
- Choose Show Reddit, use a normal native account control, then return with Reading view.
- Open a post, profile, notifications, and the post composer; their controls and content stay native, with Pureddit colors and a persistent Pureddit header with appearance controls and feed links. Modern/Old on these pages adjusts typography and spacing, rather than replacing Reddit’s editor or comment tree. Confirm native posting, editing, voting, and menus still work, then navigate back to a feed.
- Toggle the extension off; original content, focusability, and scrolling must be restored.
- Check iPhone portrait/landscape and keyboard behavior. If Reddit changes its DOM, disable Pureddit and report the layout/URL without sharing private page content or credentials.

### Updating Chrome to 0.3.9

Download and extract the new Chrome ZIP into your existing extension folder (preserve its path). At `chrome://extensions`, click Pureddit’s reload button, then refresh Reddit tabs. Confirm version **0.3.9** is shown. GitHub/Vercel updates do not automatically update an unpacked extension.

Version 0.3.4 adds native-page appearance on discussions, profiles, notifications and post composers, recognizes Reddit’s `faceplate-tab-selected` / `tab-selected` Home tabs, and avoids rebuilding unchanged feed cards. Home still requires explicit native tab selection and updated content; if your Reddit variant is not recognized, report the Following tab markup rather than treating suggested posts as followed content.

Version 0.3.5 keeps the header and Home/Popular/News links visible during native post/account interactions, attaches before Reddit finishes loading, and shows navigation progress instead of leaving old cards on screen. Test feed switching, native menus, post navigation and browser Back/Forward. The URL remains on reddit.com: Pureddit is an extension running on that site.

If a non-Home feed has no readable cards after six seconds, Pureddit exposes Reddit’s live feed/loading/retry interface beneath its header. The reading layer returns automatically when native posts arrive. Show Reddit removes the shell; Reading view restores it without replacing native editors.

Version 0.3.6 dispatches navigation through Reddit’s native links/router instead of forcing `location.assign` for every feed/post. A normal browser navigation is the fallback when Reddit does not handle the link. Root discovery is cached across unrelated mutations; hover classes outside posts/tabs no longer trigger extraction. Route transitions exclude unchanged cards from the preceding feed. Post styling also overrides Reddit’s nested theme classes, keeping native editors and votes intact. These changes are tested against controlled native-router fixtures; live signed-in Reddit compatibility still requires checking on your browser.

Version 0.3.7 labels the Home tabs **Your Feed** and **Suggested Feed**, mapped respectively to native Reddit **Following** and **For You**. Your Feed is always the startup/Home default. Test loading with Reddit initially on For You, choosing Suggested Feed, clicking Home again on the same URL, and reloading. None should make Suggested Feed the default. Native selection must be confirmed before displaying Your Feed; unrecognized native controls show an explanation instead of relabeling suggestions.

Version 0.3.8 fixes cancellation of stalled navigation, redirected destinations with canonical query parameters, stale tab CSS overriding explicit deselection, and native-hidden cards remaining in the cache. Disabling the extension also cancels pending navigation immediately. Regression cases were reproduced before the fixes and pass afterward.

Version 0.3.9 changes current-site Modern feeds to native Reddit content with Pureddit theming and a header. Image and video posts use Reddit’s full media component beneath the title; external article links keep Reddit’s link preview treatment. No player is cloned/reparented, and Pureddit never changes autoplay, mute, playback or profile preferences. Reddit and the browser determine playback. Old and unsupported/legacy app shells retain the compact/compatibility reader.

Test autoplay with your Reddit profile setting both enabled and disabled, media controls, galleries, sensitive-content gates, scrolling/infinite loading, and native voting/commenting. Confirm Your Feed remains default and ads/marked recommendations stay hidden. Switch Modern → Old → Modern and verify settings and native controls survive. The Vercel image preview is illustrative and does not connect to Reddit settings or play real Reddit videos.
