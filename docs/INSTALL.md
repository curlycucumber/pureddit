# Install and test Pureddit

These are unsigned **development packages**, not published store releases. Keep Reddit's normal website available while testing. No Pureddit account, Reddit API approval, or API keys are needed to restyle a page you can already open. The extension does not bypass Reddit login, browser permissions, or site access controls.

## Chrome desktop

1. Download `pureddit-chrome.zip` from the Vercel preview, or run `npm ci && npm run build`.
2. Extract the ZIP into a permanent folder. The selected folder must directly contain `manifest.json`.
3. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select that folder (or `dist/extensions/chrome`).
4. Open `https://www.reddit.com/r/popular/`, `https://www.reddit.com/r/news/`, or `https://www.reddit.com/new/` and allow access to Reddit if requested.
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

On a Mac with full Xcode installed and selected:

```sh
git clone https://github.com/curlycucumber/pureddit.git
cd pureddit
npm ci
npm run build
bash scripts/convert-safari.sh
```

The script runs Apple's `safari-web-extension-converter` to generate a Swift wrapper project under `build/safari`. It does not overwrite an existing generated project. Run with another destination argument for another build. Full Xcode is required; Command Line Tools alone may not supply the converter/iOS SDK.

1. Open the generated Xcode project.
2. Select the iOS app/extension targets. Set a unique bundle identifier and your Apple signing team for both. The repository's example identifier is `com.curlycucumber.pureddit`; use an identifier your Apple account can register.
3. Build/run the iOS containing app on your paired iPhone. Follow Xcode's developer-mode/trust instructions for your device. Use Safari/iOS 16.4 or later.
4. Enable Pureddit in Safari's extension settings (typically Settings → Apps → Safari → Extensions on current iOS). Grant access to Reddit, not all websites.
5. Open a Reddit feed in Safari. Verify the reader, Communities button, Show Reddit, popup toggle, and native discussion navigation.

Apple signing and testing on an actual iPhone remain necessary. Personal development installation is different from TestFlight/App Store distribution, which normally requires Apple Developer Program membership and App Store Connect setup. No Apple account, certificate, signing profile, or paid store submission was created by this task.

The shared Safari source and converter command are prepared here; this Linux workspace cannot execute Xcode or certify iPhone compatibility. A manually dispatched GitHub workflow can generate a wrapper project on a macOS runner, but device signing/testing still belongs to the owner.

## User acceptance checks

- Test both `www.reddit.com` and `old.reddit.com` feeds while signed in and signed out.
- Confirm native Reddit has loaded posts before comparing the reading view.
- Confirm title/thumbnail accuracy, filters, and New/Hot/Top navigation.
- Add/remove a local shortcut and visit six communities; only five recents should remain.
- Choose Show Reddit, use a normal native account control, then return with Reading view.
- Open a post; its discussion should stay native. Navigate back to a feed.
- Toggle the extension off; original content, focusability, and scrolling must be restored.
- Check iPhone portrait/landscape and keyboard behavior. If Reddit changes its DOM, disable Pureddit and report the layout/URL without sharing private page content or credentials.
