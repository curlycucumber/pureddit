#!/bin/bash
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo "Safari packaging requires macOS and full Xcode. This script cannot build an iPhone app on Linux." >&2
  exit 1
fi
task_root="$(cd "$(dirname "$0")/.." && pwd)"
task_output="${1:-$task_root/build/safari}"
if [[ ! -f "$task_root/dist/extensions/safari/manifest.json" ]]; then
  echo "Run npm ci and npm run build in the repository first." >&2
  exit 1
fi
xcrun --find safari-web-extension-converter >/dev/null
xcrun safari-web-extension-converter "$task_root/dist/extensions/safari" \
  --project-location "$task_output" --app-name Pureddit \
  --bundle-identifier com.curlycucumber.pureddit --swift --copy-resources --no-open --no-prompt
echo "Open the generated project in Xcode, select the iOS app target, configure your signing team, and build to your iPhone. See docs/INSTALL.md."
