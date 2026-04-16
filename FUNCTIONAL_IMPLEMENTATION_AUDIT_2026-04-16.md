# Functional Implementation Audit

- Date: `2026-04-16`
- Scope: offline behavior, winning-data integrity, import recovery metadata, multi-tab state sync, verification/docs alignment
- Status: implemented in codebase and documented

## Implemented

- Offline reachability probe now uses `online-check.txt` instead of a precached asset.
- `sw.js` now consumes generated precache metadata from `assets/sw-precache-manifest.js`.
- Static winning-data health now checks structural completeness and honors `CONFIG.LIMITS.MISSING_DRAWS = [146]`.
- Import restore now records `syncMeta.mode = local_restore` only on successful rebuild and `local_restore_failed` on failure.
- App-owned persisted state changes now propagate across tabs through `BroadcastChannel('lotto-data-sync')` with `storage` fallback.
- Cold-start `load()` now prunes orphan campaigns before persisting normalized state.
- Smoke regressions were expanded for static holes, allowed missing draws, import restore failure, orphan cleanup migration, and service-worker manifest parity.
- `npm run test:offline` was added for browser-based offline and multi-tab scenarios.
- `npm run bench:ai` now uses a quick preset and `npm run bench:ai:full` keeps the heavier range.

## Verified

- `npm run build`
- `npm run bench:ai`
- `npm run test:offline`

## Remaining Risk

- `node scripts/perf/bench.mjs` is still above its current `recommend.avgMs` threshold in this environment.
- Node emits `MODULE_TYPELESS_PACKAGE_JSON` warnings because the repo uses ESM files without `"type": "module"` in `package.json`.

## Follow-up

- Rebaseline or optimize `scripts/perf/bench.mjs` recommend-path threshold if the current 35ms target is no longer realistic.
- Decide whether to add `"type": "module"` or keep the current warning as an accepted tradeoff.
