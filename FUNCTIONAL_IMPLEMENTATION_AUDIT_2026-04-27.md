# Functional Implementation Audit

- Date: `2026-04-27`
- Scope: data-health correctness, HTML attribute safety, import/sync normalization, static-data freshness, service-worker precache diagnostics, storage accounting, docs alignment
- Status: implemented and verified

## Implemented

- Data health now evaluates merged static + local update data when `localUpdates` exist.
- Static `1..N` data plus a future local draw with missing intermediate draws is now classified as `partial`, while allowed missing draw `146` remains exempt.
- Check-tab target cards escape `data-item-key` and rendered metadata before writing HTML attributes/text.
- Imported tickets normalize unsafe external IDs to bounded `[A-Za-z0-9_-]` identifiers while preserving valid IDs.
- Favorites/history import now uses the central stored-number normalization path.
- Import removes decimal, duplicate, and out-of-range numbers at import time.
- Sync payloads accept `draw_no` / `ltEpsd` only when they are integers `>= 1`.
- Storage summary byte accounting now uses UTF-8 byte length instead of JavaScript string length.
- `package.json` now declares `"type": "module"` to remove Node ESM typeless package warnings.
- `data/winning_stats.json` was refreshed through draw `1221`; rows now equal `1220`, with only allowed missing draw `[146]`.
- `assets/sw-precache-manifest.js` was regenerated from `scripts/generate_sw_manifest.mjs`; no content change was required after regeneration.

## New Smoke Regressions

- `merged local-updates gap classification`
- `check target-card attribute escaping`
- `import stored-list strict normalization`
- `sync payload draw integer guard`
- `static data freshness budget`
- `service-worker precache reachability`
- `storage summary byte accounting`

## Verified

- `npm run sync:sw-manifest`
- `npm run build`
- `node scripts/perf/bench.mjs`
- `npm run bench:ai`
- `npm run test:offline`

## Data Check

- Static rows: `1220`
- Draw range: `1..1221`
- Missing draws: `[146]`

## Notes

- The 2026-04-16 audit is retained as historical context.
- `npm install --package-lock-only` was run after adding `"type": "module"`; npm did not require a lockfile content change.
