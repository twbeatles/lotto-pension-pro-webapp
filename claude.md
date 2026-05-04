# claude.md

## Purpose

This is the current handoff note for Claude-family agents working in `lotto---webapp`.
Use it to restore context quickly and avoid missing the current structure.

- Date: `2026-05-04`
- Static data latest draw: `1221`
- Static data rows: `1220`
- Missing draw: `146` → `CONFIG.LIMITS.MISSING_DRAWS = [146]` 상수로 명시됨
- Current functional review artifact: `FUNCTIONAL_GAP_AND_COPY_REVIEW_2026-05-04.md`

## Current State

- The app is a no-build SPA.
    - `index.html` -> `assets/modules/index.js` -> `assets/modules/core/LottoApp.js`
- PWA bootstrap was moved to `assets/modules/bootstrap/pwa.js`.
- Large files were split into facade entry files plus internal modules:
    - `assets/modules/core/app/`
    - `assets/modules/core/app/moduleLoader/`
    - `assets/modules/core/app/dataLists/`
    - `assets/modules/core/data/`
    - `assets/modules/core/data/records/`
    - `assets/modules/core/data/persistence/`
    - `assets/modules/core/data/sync/`
    - `assets/modules/core/ui/`
    - `assets/modules/core/strategy/`
    - `assets/modules/features/ai/`
    - `assets/modules/features/backtest/`
    - `assets/modules/features/check/`
    - `assets/modules/features/dataio/`
    - `assets/modules/features/generator/`
- Styles were split into `assets/styles/*.css`.
    - `assets/app.css` is now the aggregate entrypoint.
- Smoke tests were split into:
    - `scripts/smoke/helpers/`
    - `scripts/smoke/cases/`
    - `scripts/smoke/cases/regressions/`
    - `scripts/smoke/cases/regressions/manifest.mjs`
    - `scripts/smoke/cases/regressions/support.mjs`
    - `scripts/smoke/smoke.mjs`
- Additional facade/barrel safety regressions were added:
    - `runFacadeExportParityRegression()`
    - `runRegressionBarrelExportParityRegression()`
- Service worker cache version is `v20`.
- Service worker precache is generated from `scripts/generate_sw_manifest.mjs` into `assets/sw-precache-manifest.js`.
- Recent functional consistency fixes:
    - proxy setting changes now abort any in-flight sync before queuing the replacement/default sync path
    - draw date normalization now accepts only valid `YYYY-MM-DD` / official `YYYYMMDD` dates
    - latest winning-card metadata escapes draw date text before HTML rendering
    - strategy worker final timeouts terminate the busy worker before main-thread fallback can continue
    - transient static JSON failures preserve already-loaded in-memory winning data unless the caller explicitly disables preservation
    - import safety limits now cap backup file size, projected ticket quantity, and oversized strategy snapshots
    - Cloudflare proxy `/proxy/latest` can default to the estimated latest draw when `draw_no` is omitted
    - opt-in browser happy-path and live sync checks were added: `npm run test:happy`, `npm run test:sync-live`
    - Prettier baseline was made explicit via `.prettierrc.json` / `.prettierignore`
    - generator strategy selection is now driven by the selected strategy request; legacy toggles only behave as quick presets
    - generated-number runtime state now preserves provenance (`numbers`, `strategyRequest`, `createdAt`, `source`) through save/export/request bridge flows
    - sync runs are now internally abortable for both manual and auto paths, while public cancel behavior remains manual-only
    - grouped ticket-book rows now use `quantity` instead of duplicate entries, and physical ticket counts flow through delete/import/campaign summaries
    - import no longer preserves stale sync metadata; it records `local_restore` only when winning data is rebuilt successfully and `local_restore_failed` otherwise
    - `dataHealth` now distinguishes `full` / `partial` / `none` using structural completeness, not just static JSON presence
    - when local updates exist, `dataHealth` now evaluates merged static + local data and can classify `static_local` as `partial` if intermediate draws are missing
    - sync payload draw numbers are accepted only as integers `>= 1`
    - favorites/history import now uses central stored-number normalization; decimal, duplicate, and out-of-range numbers are dropped at import time
    - imported ticket IDs are bounded and normalized to safe `[A-Za-z0-9_-]` characters
    - check-target cards escape `data-item-key` and rendered metadata before writing HTML attributes
    - storage summary accounting uses UTF-8 bytes rather than JavaScript string length
    - `package.json` declares `"type": "module"` to avoid Node ESM typeless package warnings
    - if static JSON fails, runtime data can rebuild `winningStats` from local updates only and expose partial recovery mode
    - `stats`, `ai`, and `bt` are gated when data availability is not `full`, while `gen` and `check` stay usable with warnings
    - multi-tab SW reload now broadcasts only after activation (`controllerchange`), preventing premature reloads in other tabs
    - app-owned localStorage updates now also sync across tabs through `BroadcastChannel('lotto-data-sync')` with `storage` fallback
    - cold start `load()` now prunes orphan campaigns before persisting normalized state
    - `reconcileTicketChecks()` revalidates stored `checked` tickets after sync/import/local-update cleanup
    - future-draw `localUpdates` are dropped by `sanitizeLocalUpdates()` and `syncMeta.lastSuccessDrawNo` is clamped to effective data
    - orphan campaigns are now pruned not only on import, but also after ticket delete / ticket-book clear
    - history is now an actual log and preserves duplicate generated/imported entries by timestamp
    - past-draw tickets still settle immediately after save
    - generator campaign reset still restores target-draw auto-follow metadata
    - Android PWA no-seed generation/recommendation now uses runtime entropy so repeated taps do not reuse a fixed worker result
    - user-facing recommendation copy is `번호 추천`; `내 번호 보관함`, `데이터 연결 주소(고급)`, `같은 번호 다시 만들기 코드`, and `분석 강도` are the current beginner-facing terms
    - settings/latest draw UI now shows `내 데이터 / 예상 최신 / 차이`
    - backup import now has a preview confirm; overwrite mode downloads `lotto_before_replace_*.json` before applying
    - `cleanupStoredRecords({ keepHistory: 200, removeSettledLosses: true })` backs the `백업하고 정리하기` flow
    - `window.lottoPwaUpdate` exposes `check()`, `apply()`, and `getState()` plus `lotto:pwa-update-state`
    - `npm run check:data-freshness` and `npm run test:pwa-mobile` are part of the current verification surface
- AI strategy stack now includes:
    - richer weighting inputs from `core/strategy/context.js`
    - candidate reranking + diversity selection in `core/strategy/generation.js`
    - additional stable strategies: `consensus_portfolio`, `bayesian_smooth`, `momentum_recent`, `mean_reversion_cycle`
    - AI-only automatic strategies: `auto_recent_top`, `auto_ensemble_top3`

## UX Notes

- The generate page no longer exposes storage details directly.
- The global settings modal owns:
    - theme
    - in-app/system alerts
    - data connection URL (advanced custom proxy URL)
    - sync metadata
    - app storage summary
- On mobile, the settings modal is forced into a single-column layout.
- The data page is now focused on backup/import and list management.
- Data list rendering is aligned with actual search/pagination state again.
- Data list search/page state is now persisted to `sessionStorage` (`lotto_pro_datalist_state`) and restored on reload.
- `UIManager` now owns common async confirm/prompt modals.
    - focus trap
    - `Escape` close
    - opener focus restore
- Number balls and key stepper buttons now have explicit accessibility labels.
- Target draw inputs (`genTargetDrawNo`, `campStartDraw`, `aiTargetDrawNo`) are auto-managed.
    - If the user has not manually edited the field, it follows the latest draw and stays on the next draw number.
    - Each field now has a reset button to restore the suggested next draw.
- Resetting campaign options restores the target-draw auto-follow metadata, not just the current visible value.
- Generate/campaign actions now expose busy states and request tokens so stale async results do not overwrite the latest UI.
- Backtest no longer resets on route re-entry.
    - last summary/comparison/win rows are re-rendered
    - summary card includes mini metric charts
- Saving a ticket for an already-drawn round settles it immediately when winning data is available locally.
- The check tab was reworked for mobile and keyboard use.
    - card list instead of native `select`
    - search + source tabs + ticket status filters
    - scanned source is always visible
    - arrow/home/end keyboard navigation
- Mobile bottom navigation is now `gen/stats/ai/check/data + more`.
    - `more` opens a sheet for `bt`, settings, and install
- Latest draw sync defaults to automatic fallback.
    - A configured user proxy is preferred only when it matches the official `/proxy/latest` contract.
    - Without a user proxy, the app still attempts runtime sync and stores fetched draws into local updates.
    - Unsupported proxy formats are ignored and surfaced as warnings in settings.
    - `data/winning_stats.json` is install-precached for offline stability.
    - same-origin reachability probe now uses `/online-check.txt` and is explicitly bypassed by the SW fetch handler.
    - Sync race condition: if the proxy config changes while a sync is in flight, the old request is cancelled and a new one starts.
    - Range fetch responses are Content-Type validated — HTML error pages are rejected before JSON parsing.
    - Single-draw fallback sync now logs invalid payload shapes (`SYNC_FETCH_ONE_INVALID_PAYLOAD`) instead of silently swallowing them.
    - `syncMeta` also stores the latest warning message for response-structure diagnostics.
- `refreshCurrentRoute()` now applies a stale guard so async refresh work from an old route does not render after a tab switch.
- Offline banner (`#offlineBanner`) is shown at the top of the page when `navigator.onLine` is false.
    - Connects/disconnects reactively via `online` / `offline` window events.
- PWA install prompt is mirrored to desktop sidebar, settings modal, and the mobile more sheet when `beforeinstallprompt` fires.
- SW update BroadcastChannel (`lotto-sw-update`) now emits an activation-complete signal only after `controllerchange`.
    - the initiating tab reloads itself after activation
    - remote tabs reload only after the activated-worker signal arrives
- Data health gating:
    - `stats`, `ai`, `bt` require `dataHealth.availability === 'full'`
    - `gen`, `check`, latest draw card, and data-management stay available during partial recovery
- Ticket-book UX:
    - duplicate tickets increase `quantity`
    - list and check views show `xN` badges for grouped tickets
    - delete/count/campaign cleanup messages use physical ticket counts
- `localStorage.setItem()` failures (e.g. `QuotaExceededError`) now surface a user-facing toast.
    - Storage quota warning toast fires proactively when usage crosses `STORAGE_WARNING_BYTES` or `STORAGE_DANGER_BYTES`.
- Settings modal focus on open now falls back to first focusable element if `#closeSettingsBtn` is unavailable.
- `StrategyWorkerClient` timeout scales by network quality (`navigator.connection.effectiveType`): 2G → ×2.5, 3G → ×1.5.
- The data page now exposes local update summary/cleanup UI.
    - `clearLocalUpdatesBtn` clears runtime-synced draw overrides and rebuilds `winningStats`.
- `reconcileTicketChecks()` now also runs after initial winning-stat load, post-import refresh, and local-update cleanup reload.
- `sanitizeLocalUpdates()` centralizes draw normalization, dedupe, sort order, and future-draw rejection (`estimateLatestDrawKST() + 2` ceiling).
- `syncMeta.lastSuccessDrawNo` is clamped to the latest effective draw after `winningStats` rebuild so settings never display an impossible applied draw.
- Ticket delete / clear flows also prune orphan campaigns and append cleanup counts to success toasts.
- History entries are now stored as actual save/import logs instead of number-unique snapshots.
- Merge/overwrite (`합치기/바꾸기`) import still prunes orphan campaigns and now preserves duplicate history entries in date-desc order.
- QR scanner cleanup is stricter.
    - Clicking the scan modal backdrop closes it.
    - Leaving the `check` route stops the active scanner.
- AI strategy notes:
    - `aiLookbackWindow` doubles as the recent-`N` evaluation window for the automatic AI-only strategies.
    - `auto_recent_top` chooses the strongest recent strategy.
    - `auto_ensemble_top3` blends the current weights of the top 3 recent strategies.
    - AI results now expose reranking diagnostics and adaptive-strategy selections in the UI.

## Key Files

- `index.html`
    - page shell, settings modal markup, mobile more sheet, dialog modal, offline banner (`#offlineBanner`), toast live region (`#toast-live-region`), PWA install buttons, target-draw reset buttons, local update cleanup UI
- `assets/modules/index.js`
    - app entrypoint
- `assets/modules/bootstrap/pwa.js`
    - service worker registration, update UX, BroadcastChannel multi-tab reload
- `assets/modules/core/LottoApp.js`
    - facade, implementation in `core/app`; owns `_bindOfflineBanner()`, `_bindPwaInstallPrompt()`, `bindMobileMoreSheet()`, `_loadDataListStateFromSession()`, target-draw auto-management helpers, remote persistence rehydrate entry
- `assets/modules/core/UIManager.js`
    - facade/static state; implementation split into `core/ui/modal.js`, `dialog.js`, `qrModal.js`, `toast.js`, `balls.js`
- `assets/modules/core/DataManager.js`
    - facade, implementation in `core/data`
- `assets/modules/core/app/moduleLoader.js`
    - barrel for route/data-health/request bridge logic in `core/app/moduleLoader/`
- `assets/modules/core/app/latestDraw.js`
    - latest draw card + target-draw autofill synchronization
- `assets/modules/core/app/dataLists.js`
    - barrel for list state/render/pagination/events in `core/app/dataLists/`
- `assets/modules/core/app/settingsPanel.js`
    - sync warning meta rendering (`syncMeta.lastWarningMessage`) and `local_restore_failed` state badge/warning
- `assets/modules/core/data/records.js`
    - barrel for generated/ticket/campaign/saved-list record methods in `core/data/records/`
- `assets/modules/core/data/analytics.js`
    - `reconcileTicketChecks()` for full ticket settlement revalidation and quantity-aware settlement counts
- `assets/modules/core/data/persistence.js`
    - barrel for proxy/storage/local-update/load-save helpers in `core/data/persistence/`
- `assets/modules/core/data/persistence/storage.js`
    - app-owned storage broadcasting, `BroadcastChannel` setup, and same-tab suppression
- `assets/modules/core/data/persistence/loadSave.js`
    - cold-start orphan campaign cleanup before persist
- `assets/modules/core/data/sync.js`
    - barrel for sync health/http/payload/provider/range/orchestrator helpers in `core/data/sync/`
- `assets/modules/core/data/sync/health.js`
    - structural completeness check for static winning stats (`CONFIG.LIMITS.MISSING_DRAWS` aware)
- `assets/modules/core/app/moduleLoader.js`
    - route stale guard, route data gates, and partial-recovery banners
- `assets/modules/features/Check.js`
    - facade; implementation split into `features/check/events.js`, `list.js`, `results.js`
- `assets/modules/features/backtest/ui.js`
    - barrel for `features/backtest/events.js`, `rendering.js`, `strategyForm.js`
- `scripts/smoke/cases/regressions/manifest.mjs`
    - ordered regression execution plan and barrel export list used by `smoke.mjs` and parity checks
- `scripts/smoke/cases/regressions/support.mjs`
    - shared smoke-only imports/utilities reused by domain regression modules
- `assets/modules/features/generator/form.js`
    - campaign reset restores target-draw auto-follow metadata
- `assets/modules/features/dataio/support.js`
    - orphan-campaign pruning helpers
- `assets/modules/features/dataio/importExport.js`
    - merge/overwrite import flow and cleanup-count toast
- `assets/modules/utils/strings.js`
    - centralized user-facing UI copy
- `assets/modules/core/StrategyEngine.js`
    - facade, implementation in `core/strategy`
- `assets/modules/core/strategy/context.js`
    - recent pair matrix, pending/average gap, sum/AC distribution stats
- `assets/modules/core/strategy/weights.js`
    - base strategy weighting plus adaptive recent-performance strategy selection
- `assets/modules/core/strategy/generation.js`
    - candidate pool reranking and diversity picking
- `assets/modules/core/strategy/evaluation.js`
    - set-level recommendation scoring and explain metadata
- `assets/modules/core/StrategyWorkerClient.js`
    - WebWorker client; network-adaptive timeouts via `getNetworkSlowFactor()`
- `assets/modules/features/*.js`
    - original import paths preserved
- `assets/app.css`
    - style aggregate entrypoint
- `sw.js`
    - generated precache manifest import, online-check bypass, and fetch policy
- `scripts/generate_sw_manifest.mjs`
    - generates repo-tracked `assets/sw-precache-manifest.js`
- `scripts/tests/offline_playwright.mjs`
    - opt-in browser check for offline gate behavior and cross-tab state sync
- `scripts/tests/happy_playwright.mjs`
    - opt-in browser happy path for generate -> ticket -> check, recommendation import, and backup import
- `scripts/tests/sync_live.mjs`
    - opt-in live official draw payload check through the built-in sync path
- `FUNCTIONAL_IMPLEMENTATION_AUDIT_2026-04-30.md`
    - current functional implementation audit and follow-up fix log

## Storage / Sync

Main localStorage keys:

- `lotto_pro_fav_v2`
- `lotto_pro_hist_v2`
- `lotto_pro_settings_v2`
- `lotto_pro_ticketbook_v1`
- `lotto_pro_campaigns_v1`
- `lotto_pro_alerts_v1`
- `lotto_pro_strategy_presets_v1`
- `lotto_pro_sync_meta_v1`
- `lotto_pro_updates_v2` (`CONFIG.KEYS.LOCAL_UPDATES`)

Runtime-only data health:

- `availability` — `full | partial | none`
- `source` — `static | static_local | local_only | none`
- `latestDrawNo`
- `message`
- `static_local` can still be `partial` when merged local updates create intermediate draw gaps

Important sync modes:

- `local_restore`
- `local_restore_failed`

sessionStorage keys:

- `lotto_pro_datalist_state` — data list search/page state, restored on reload

Proxy resolution order:

1. `?proxyUrl=` / `?proxy=`
2. `lotto_webapp_settings_v1.proxyLatestUrl`
3. `lotto_pro_settings_v2.customProxy`
4. otherwise automatic fallback sync

Official supported custom proxy shape:

- absolute `http(s)` URL
- path contains `/proxy/latest`
- unsupported shapes (`?url=`, `{url}`, `{draw_no}`) are ignored at runtime

## Config Constants (`assets/modules/utils/config.js`)

- `CONFIG.LIMITS.MISSING_DRAWS` — `[146]` : draws absent from static JSON
- `CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS` — `120`
- `CONFIG.LIMITS.MAX_BACKTEST_SPAN` — `300`
- `CONFIG.LIMITS.MAX_IMPORT_BYTES` — `2MB`
- `CONFIG.LIMITS.MAX_IMPORT_TICKETS` — `2000`
- `CONFIG.LIMITS.MAX_STRATEGY_REQUEST_BYTES` — `8000`
- `CONFIG.LIMITS.MAX_SERIALIZABLE_DEPTH` / `MAX_SERIALIZABLE_KEYS` / `MAX_SERIALIZABLE_ARRAY_ITEMS` — import strategy snapshot complexity guards
- `CONFIG.KEYS.SESSION_DATA_LIST_STATE` — sessionStorage key for data list state
- `CONFIG.KEYS.LOCAL_UPDATES` — local draw override storage key

## Static Winning Data

- Source file: `data/winning_stats.json`
- Current max draw: `1221`
- Current rows: `1220`
- Allowed missing draw: `[146]`
- Freshness is guarded by the `static data freshness budget` smoke regression.

## Quick Start

```bash
python -m http.server 5173
npm install
npm run sync:sw-manifest
npm run lint
npm run build
node scripts/smoke/smoke.mjs
npm run bench:ai
npm run bench:ai:full
npm run test:happy
npm run test:offline
npm run test:sync-live
```

- `npm run test:offline` requires a local `Chrome`/`Edge` channel or a Playwright-installed Chromium (`npx playwright install chromium`).
- `npm run test:happy` uses the same browser availability requirement and covers generate -> ticket -> check, recommendation -> generator import, and backup import merge.
- `npm run test:sync-live` is an opt-in network check for the current/latest official draw payload.

Local URL:

- `http://localhost:5173/`

## Verification Checklist

Required:

- `npm run lint`
- `npm run build`
- `node scripts/smoke/smoke.mjs`

Recommended manual checks:

1. Generate page load and number generation
2. Settings modal open/close and state reflection (focus lands on close button)
3. AI recommendation and `requestNumbers` replacement flow
4. Data backup/import
5. Sync button, cancel path, and no-proxy automatic fallback behavior
6. Target draw inputs — verify untouched values auto-follow the latest draw and reset buttons restore the next draw
7. Data list search and pagination — verify state survives page reload
8. Local updates summary / clear flow on the data page
9. Mobile settings modal and mobile more sheet rendering
10. Check tab card list, search/filter state, and keyboard navigation
11. Destructive actions and preset overwrite/delete paths open the common confirm modal correctly
12. Service worker update acceptance and reload behavior
13. Partial recovery mode: verify `stats/ai/bt` gate while `gen/check/data` remain usable
14. Import after backup restore: verify success path records `syncMeta.mode = local_restore`
15. Simulate restore failure and verify `syncMeta.mode = local_restore_failed` with failure message
16. Grouped ticket quantity behavior (`xN`, delete counts, campaign counts)
17. Go offline → verify offline banner appears; go online → verify banner hides and toast fires
18. On supported browser: verify PWA install buttons appear in sidebar/settings/mobile more
19. Save a past-draw ticket and verify it settles immediately without waiting for another sync
20. Reset generator campaign options and verify target-draw auto-follow resumes on the next latest-draw change
21. Run merge/overwrite import with orphan campaigns and verify cleanup count appears in the completion toast
22. Clear local updates and verify stale checked tickets return to pending while the applied draw in settings clamps down to the effective latest draw
23. Delete the last ticket linked to a campaign and verify the orphan campaign disappears immediately
24. Save the same number set multiple times and verify history keeps separate log entries
25. With two tabs open, change tickets/settings in one tab and verify the other tab rehydrates automatically
26. Verify merged local-update gaps classify data as partial instead of full
27. Verify import strict normalization, sync draw integer guard, check-card escaping, storage byte accounting, and precache reachability smoke cases

## Session Template

```md
### Session Handoff

- Changed files:
- Core behavior changes:
- Verification completed:
- Remaining risks:
- Suggested next work:
```
