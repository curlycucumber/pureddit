#!/bin/bash
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo "Safari packaging requires macOS and full Xcode. This script cannot build an iPhone app on Linux." >&2
  exit 1
fi
if ! xcodebuild -version >/dev/null 2>&1; then
  echo "Full Xcode is not ready or selected. Open Xcode and complete setup, then run:" >&2
  echo "  sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi
if ! xcrun --sdk iphoneos --show-sdk-path >/dev/null 2>&1; then
  echo "The iOS SDK is unavailable. Complete Xcode's iOS platform/component setup before continuing." >&2
  exit 1
fi
task_root="$(cd "$(dirname "$0")/.." && pwd)"
task_output="${1:-$task_root/build/safari}"
task_bundle_id="${PUREDDIT_BUNDLE_ID:-com.curlycucumber.pureddit}"
if [[ -e "$task_output" ]]; then
  echo "Destination already exists: $task_output" >&2
  echo "Keep your existing project/signing settings. To generate another wrapper, pass a new destination as the script's first argument." >&2
  exit 1
fi
if [[ ! -f "$task_root/dist/extensions/safari/manifest.json" ]]; then
  echo "Run npm ci and npm run build in the repository first." >&2
  exit 1
fi
if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "Apple's Safari WebExtension converter is unavailable. Check that full Xcode is selected." >&2
  exit 1
fi
xcrun safari-web-extension-converter "$task_root/dist/extensions/safari" \
  --project-location "$task_output" --app-name Pureddit \
  --bundle-identifier "$task_bundle_id" --swift --copy-resources --no-open --no-prompt
echo "Safari wrapper generated under: $task_output"
echo "Open its .xcodeproj in Xcode and select the iOS app scheme."
echo "Set your Apple signing team on BOTH the iOS app and extension targets, connect your iPhone, then choose Product > Run."
echo "Enable Pureddit in your iPhone's Safari extension settings and allow access to Reddit. See docs/INSTALL.md."
