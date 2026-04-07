# claude.md

## Purpose

This is the current handoff note for Claude-family agents working in `lotto---webapp`.
Use it to restore context quickly and avoid missing the current structure.

- Date: `2026-04-07`
- Static data latest draw: `1209`
- Static data rows: `1208`
- Missing draw: `146` → `CONFIG.LIMITS.MISSING_DRAWS = [146]` 상수로 명시됨
- Current functional review artifact: `FUNCTIONAL_IMPLEMENTATION_REVIEW_2026-04-07.md`

## Current State

- The app is a no-build SPA.
  - `index.html` -> `assets/modules/index.js` -> `assets/modules/core/LottoApp.js`
- PWA bootstrap was moved to `assets/modules/bootstrap/pwa.js`.
- Large files were split into facade entry files plus internal modules:
  - `assets/modules/core/app/`
  - `assets/modules/core/data/`
  - `assets/modules/core/strategy/`
  - `assets/modules/features/ai/`
  - `assets/modules/features/backtest/`
  - `assets/modules/features/dataio/`
  - `assets/modules/features/generator/`
- Styles were split into `assets/styles/*.css`.
  - `assets/app.css` is now the aggregate entrypoint.
- Smoke tests were split into:
  - `scripts/smoke/helpers/`
  - `scripts/smoke/cases/`
  - `scripts/smoke/smoke.mjs`
- Service worker cache version is `v17`.
- Recent functional consistency fixes:
  - grouped ticket-book rows now use `quantity` instead of duplicate entries, and physical ticket counts flow through delete/import/campaign summaries
  - import no longer preserves stale sync metadata; it reconstructs `syncMeta` as `local_restore` from the effective winning dataset
  - `dataHealth` now distinguishes `full` / `partial` / `none`
  - if static JSON fails, runtime data can rebuild `winningStats` from local updates only and expose partial recovery mode
  - `stats`, `ai`, and `bt` are gated when data availability is not `full`, while `gen` and `check` stay usable with warnings
  - multi-tab SW reload now broadcasts only after activation (`controllerchange`), preventing premature reloads in other tabs
  - `reconcileTicketChecks()` revalidates stored `checked` tickets after sync/import/local-update cleanup
  - future-draw `localUpdates` are dropped by `sanitizeLocalUpdates()` and `syncMeta.lastSuccessDrawNo` is clamped to effective data
  - orphan campaigns are now pruned not only on import, but also after ticket delete / ticket-book clear
  - history is now an actual log and preserves duplicate generated/imported entries by timestamp
  - past-draw tickets still settle immediately after save
  - generator campaign reset still restores target-draw auto-follow metadata
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
  - custom proxy URL
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
- Merge/overwrite import still prunes orphan campaigns and now preserves duplicate history entries in date-desc order.
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
  - facade, implementation in `core/app`; owns `_bindOfflineBanner()`, `_bindPwaInstallPrompt()`, `bindMobileMoreSheet()`, `_loadDataListStateFromSession()`, target-draw auto-management helpers
- `assets/modules/core/UIManager.js`
  - toast, QR modal, common dialog modal, focus trap, `renderBalls()` accessibility labels
- `assets/modules/core/DataManager.js`
  - facade, implementation in `core/data`
- `assets/modules/core/app/moduleLoader.js`
  - route stale guard in `refreshCurrentRoute()`, QR scanner cleanup on route exit
- `assets/modules/core/app/latestDraw.js`
  - latest draw card + target-draw autofill synchronization
- `assets/modules/core/app/dataLists.js`
  - list rendering + localUpdates summary/clear action
- `assets/modules/core/app/settingsPanel.js`
  - sync warning meta rendering (`syncMeta.lastWarningMessage`)
- `assets/modules/core/data/records.js`
  - ticket `quantity` grouping, history actual-log merge, and orphan-campaign pruning shared by delete/import flows
- `assets/modules/core/data/analytics.js`
  - `reconcileTicketChecks()` for full ticket settlement revalidation and quantity-aware settlement counts
- `assets/modules/core/data/persistence.js`
  - `sanitizeLocalUpdates()`, `local_restore` sync-meta helpers, and `syncMeta` clamp helpers
- `assets/modules/core/data/sync.js`
  - data-health classification, partial recovery, single-draw payload diagnostics, sync warning meta updates, and post-refresh ticket reconciliation
- `assets/modules/core/app/moduleLoader.js`
  - route stale guard, route data gates, and partial-recovery banners
- `assets/modules/features/Check.js`
  - card-list based check UI, search/filter/selection state, scanned source handling
- `assets/modules/features/backtest/ui.js`
  - persisted backtest state re-render + mini metric charts
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
  - app shell precache and fetch policy
- `ISSUES.md`
  - static analysis findings log (all items from 2026-03-17 session are resolved)

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
- `CONFIG.KEYS.SESSION_DATA_LIST_STATE` — sessionStorage key for data list state
- `CONFIG.KEYS.LOCAL_UPDATES` — local draw override storage key

## Quick Start

```bash
python -m http.server 5173
npm install
npm run lint
npm run build
node scripts/smoke/smoke.mjs
npm run bench:ai
```

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
14. Import after backup restore: verify `syncMeta.mode = local_restore`
15. Grouped ticket quantity behavior (`xN`, delete counts, campaign counts)
16. Go offline → verify offline banner appears; go online → verify banner hides and toast fires
17. On supported browser: verify PWA install buttons appear in sidebar/settings/mobile more
18. Save a past-draw ticket and verify it settles immediately without waiting for another sync
19. Reset generator campaign options and verify target-draw auto-follow resumes on the next latest-draw change
20. Run merge/overwrite import with orphan campaigns and verify cleanup count appears in the completion toast
21. Clear local updates and verify stale checked tickets return to pending while the applied draw in settings clamps down to the effective latest draw
22. Delete the last ticket linked to a campaign and verify the orphan campaign disappears immediately
23. Save the same number set multiple times and verify history keeps separate log entries

## Session Template

```md
### Session Handoff

- Changed files:
- Core behavior changes:
- Verification completed:
- Remaining risks:
- Suggested next work:
```
