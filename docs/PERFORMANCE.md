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
