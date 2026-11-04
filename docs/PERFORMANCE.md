# Performance checks

Measured on 2026-11-03 in cloud Linux Chromium using the same controlled page fixture: 300 native post elements, 9,000 unrelated layout nodes, five sequential score updates, then 3.2 seconds idle. This exercises the copied compatibility renderer, without a `shreddit-app` host; current-site Modern uses the native feed instead. These are instrumented fixture measurements, not live Reddit load times or a guarantee on another machine.

| Measurement | 0.3.8 baseline | 0.3.9 |
|---|---:|---:|
| Median score-update latency | 477.1 ms | 43.9 ms |
| Unchanged rows retained (of 299) | 0 | 299 |
| Cards parsed across five updates | 1,500 | 5 |
| Full-document scans during updates | 1 | 0 |
| Full-document scans during idle | 2 | 0 |
| Built content script bytes | 128,888 | 109,539 |

The renderer reuses unchanged rows and navigation, caches parsed native metadata in a WeakMap, and invalidates affected entries on attribute/text/subtree changes. Ad, recommendation and hidden-post checks still run before using cached metadata. Native virtualization retains up to 500 previously read posts. New/reordered/hidden cards and sensitive previews remain covered by regression tests.

Root discovery walks added subtrees and polls known shadow-capable hosts to find late shadow attachment; it does not repeat a whole-document selector scan while idle. Detached roots are pruned and their mutation observations/styles released. Visual updates coalesce into a browser frame, with an 80 ms fallback if a frame is delayed; hidden tabs defer scheduled feed work until visible.

Modern on the current Reddit application keeps its actual feed, media, forms, galleries and players in place. No duplicate post feed or replacement player is built. Pureddit does not call play/pause or change autoplay/mute/profile settings. Browser rules and Reddit settings still control playback. The preview uses local illustrative images; link stories keep small side previews and image posts expand beneath their title.

To reproduce after installing dev dependencies and Playwright Chromium:

```sh
npm run build
node scripts/benchmark-extension.mjs /tmp/pureddit-performance.json
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for a custom Chromium installation. To compare releases, run the same script against each release’s built content bundle. Raw samples from this run:

```json
{
  "baseline": {
    "posts": 300,
    "nativeDecorNodes": 9000,
    "updateSamplesMs": [
      456.7000000011176,
      586.4000000003725,
      448.2999999988824,
      564.2000000011176,
      477.09999999962747
    ],
    "medianUpdateMs": 477.09999999962747,
    "unchangedCardsRetained": 0,
    "parsedCards": 1500,
    "fullDocumentScansDuringUpdates": 1,
    "fullDocumentScansDuringIdle": 2,
    "contentBytes": 128888
  },
  "optimized": {
    "posts": 300,
    "nativeDecorNodes": 9000,
    "updateSamplesMs": [
      32.29999999888241,
      47.80000000074506,
      43.90000000037253,
      39.69999999925494,
      56.19999999925494
    ],
    "medianUpdateMs": 43.90000000037253,
    "unchangedCardsRetained": 299,
    "parsedCards": 5,
    "fullDocumentScansDuringUpdates": 0,
    "fullDocumentScansDuringIdle": 0,
    "contentBytes": 109539
  }
}
```


## 0.3.10 follow-up

Controlled native-page regression measurements against 0.3.9:

| Workload | Before | After |
|---|---:|---:|
| Feed selector scans during four native score/text updates | 4 | 0 |
| Subtree selector walks for 100 nested insertions in one mutation batch | 100 | ≤2 |
| Root-discovery selector walks during disabled startup plus a DOM addition | 2 | 0 |

These counts measure avoided work, not a new claim about end-to-end Reddit speed. Modern lets Reddit render its own score/text changes without rescanning the feed. Ad/recommendation markers, hidden state, tab selection, and structural changes still trigger extension updates. Added subtrees are deduplicated against their added ancestors before root discovery. Routine snapshots avoid probing every known shadow host; periodic discovery still detects late shadow attachment. Newly added hosts are probed on the next update, so they do not wait for the periodic pass. Account actions reuse the registry rather than walking the entire document again.

Disabling disconnects mutation observation and releases root/metadata references; enabling starts with fresh discovery and metadata. A regression checks that an updated title appears after re-enable. Native display behavior is preserved so hidden posts remain hidden. Playback and autoplay controls are unchanged.

Version 0.3.11 applies native shadow-component colors using one shared constructed stylesheet on supported browsers, rather than parsing duplicate style text for every component. A style-element fallback is retained for older engines. Native tab relabeling preserves the original controls and ignores its own label mutations to avoid update loops. No direct profile fetch is involved. From 0.3.12, explicit Light/Dark clicks invoke Reddit’s native display-setting UI; Reddit performs its normal save.

## Optional reading tools (0.4.0)

The new controls add no polling interval or MutationObserver. With title filters empty, the reader reuses the original post array and skips title matching; native candidate collection for title filters is also skipped. Enabled filters reuse the existing native feed pass and only make title-text mutations relevant, preserving the score-update no-rescan behavior. Sidebar cleanup returns immediately when its options are all off. Its heading fallback is restricted to sidebars and excludes content, rules and joined-community regions.

Keyboard candidate and visibility collection runs only on a recognized optional shortcut. It is disabled on touch/mobile views and yields to inputs, editors, links' Enter behavior, dialogs and native menus. Community menu rendering is keyed to shortcuts/recents changes; its search is bounded to the existing 50 pins and five recent communities. Native players and account nodes are not cloned or moved. These are implementation/work-count properties verified by fixtures; no live-site timing claim is made.
