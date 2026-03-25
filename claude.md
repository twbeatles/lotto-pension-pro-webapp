# claude.md

## Purpose

This is the current handoff note for Claude-family agents working in `lotto---webapp`.
Use it to restore context quickly and stay aligned with the current structure and behavior.

- Date: `2026-03-25`
- Static data latest draw: `1209`
- Static data rows: `1208`
- Missing draw: `146` (`CONFIG.LIMITS.MISSING_DRAWS = [146]`)
- Current functional review artifact: `FUNCTIONAL_IMPLEMENTATION_REVIEW_2026-03-25.md`

## Current State

- The app is a no-build SPA.
  - `index.html` -> `assets/modules/index.js` -> `assets/modules/core/LottoApp.js`
- PWA bootstrap lives in `assets/modules/bootstrap/pwa.js`.
- Large files were split into facade entry files plus internal modules:
  - `assets/modules/core/app/`
  - `assets/modules/core/data/`
  - `assets/modules/core/strategy/`
  - `assets/modules/features/ai/`
  - `assets/modules/features/backtest/`
  - `assets/modules/features/dataio/`
  - `assets/modules/features/generator/`
- Styles were split into `assets/styles/*.css`.
  - `assets/app.css` remains the aggregate entrypoint.
- Smoke tests were split into:
  - `scripts/smoke/helpers/`
  - `scripts/smoke/cases/`
  - `scripts/smoke/smoke.mjs`
- Service worker cache version is `v17`.
- Recent functional consistency fixes now include:
  - immediate settlement for already-drawn tickets on save
  - campaign reset restoring target-draw auto-follow metadata
  - orphan-campaign cleanup after merge/overwrite import
- AI strategy stack includes:
  - richer weighting inputs from `core/strategy/context.js`
  - candidate reranking + diversity selection in `core/strategy/generation.js`
  - stable additions: `consensus_portfolio`, `bayesian_smooth`, `momentum_recent`, `mean_reversion_cycle`
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
- The data page is focused on backup/import and list management.
- Data list rendering is aligned with actual search/pagination state again.
- Data list search/page state is persisted to `sessionStorage` (`lotto_pro_datalist_state`) and restored on reload.
- Target draw inputs (`genTargetDrawNo`, `campStartDraw`, `aiTargetDrawNo`) are auto-managed.
  - If the user has not manually edited the field, it follows the latest draw and stays on the next draw number.
  - Each field has a reset button to restore the suggested next draw.
  - Generator campaign reset now also restores the auto-follow metadata, not just the input value.
- Ticket-book behavior:
  - saving a ticket for a draw that already has winning data settles it immediately
  - future-draw tickets remain `pending`
  - routine sync still settles older pending tickets as before
- Import behavior:
  - merge/overwrite import prunes orphan campaigns with no linked tickets
  - import completion toast includes the cleanup count
- Latest draw sync defaults to automatic fallback.
  - A configured user proxy is preferred only when it matches the official `/proxy/latest` contract.
  - Without a user proxy, the app still attempts runtime sync and stores fetched draws into local updates.
  - Unsupported proxy formats are ignored and surfaced as warnings in settings.
  - `data/winning_stats.json` is install-precached for offline stability.
  - If the proxy config changes while a sync is in flight, the old request is cancelled and a new one starts.
  - Range fetch responses are Content-Type validated before JSON parsing.
  - Single-draw fallback sync now logs invalid payload shapes (`SYNC_FETCH_ONE_INVALID_PAYLOAD`) instead of silently swallowing them.
  - `syncMeta` also stores the latest warning message for response-structure diagnostics.
- `refreshCurrentRoute()` applies a stale guard so async refresh work from an old route does not render after a tab switch.
- Offline banner (`#offlineBanner`) is shown at the top of the page when `navigator.onLine` is false.
- PWA install prompt (`#pwaInstallBtn`) appears in the desktop sidebar when `beforeinstallprompt` fires.
- SW update BroadcastChannel (`lotto-sw-update`): when a user accepts a SW update in one tab, all open tabs receive a reload signal.
- `localStorage.setItem()` failures (for example `QuotaExceededError`) now surface a user-facing toast.
- Settings modal focus on open falls back to the first focusable element if `#closeSettingsBtn` is unavailable.
- `StrategyWorkerClient` timeout scales by network quality (`navigator.connection.effectiveType`).
- QR scanner cleanup is stricter.
  - Clicking the scan modal backdrop closes it.
  - Leaving the `check` route stops the active scanner.
- AI strategy notes:
  - `aiLookbackWindow` doubles as the recent-`N` evaluation window for the automatic AI-only strategies.
  - `auto_recent_top` chooses the strongest recent strategy.
  - `auto_ensemble_top3` blends the current weights of the top 3 recent strategies.
  - AI results expose reranking diagnostics and adaptive-strategy selections in the UI.

## Key Files

- `index.html`
  - page shell, settings modal markup, offline banner, toast live region, PWA install button, target-draw reset buttons, local update cleanup UI
- `assets/modules/index.js`
  - app entrypoint
- `assets/modules/bootstrap/pwa.js`
  - service worker registration, update UX, BroadcastChannel multi-tab reload
- `assets/modules/core/LottoApp.js`
  - facade, implementation in `core/app`; owns target-draw auto-management helpers
- `assets/modules/core/app/latestDraw.js`
  - latest draw card + target-draw autofill synchronization
- `assets/modules/core/app/moduleLoader.js`
  - route stale guard in `refreshCurrentRoute()`, QR scanner cleanup on route exit
- `assets/modules/core/app/dataLists.js`
  - list rendering + localUpdates summary/clear action
- `assets/modules/core/app/settingsPanel.js`
  - sync warning meta rendering (`syncMeta.lastWarningMessage`)
- `assets/modules/core/DataManager.js`
  - facade, implementation in `core/data`
- `assets/modules/core/data/sync.js`
  - single-draw payload diagnostics and sync warning meta updates
- `assets/modules/core/data/records.js`
  - ticket add/bulk-add flows, immediate settlement for already-drawn tickets, campaign-linked delete logic
- `assets/modules/features/generator/form.js`
  - generator reset flow, including target-draw auto-follow recovery
- `assets/modules/features/dataio/support.js`
  - import helpers, including orphan-campaign pruning
- `assets/modules/features/dataio/importExport.js`
  - merge/overwrite import flow and cleanup-count toast messaging
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
  - historical findings log; use `FUNCTIONAL_IMPLEMENTATION_REVIEW_2026-03-25.md` for the latest functional follow-up status

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

sessionStorage keys:

- `lotto_pro_datalist_state` for data list search/page state

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

- `CONFIG.LIMITS.MISSING_DRAWS` -> `[146]`
- `CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS` -> `120`
- `CONFIG.LIMITS.MAX_BACKTEST_SPAN` -> `300`
- `CONFIG.KEYS.SESSION_DATA_LIST_STATE` -> sessionStorage key for data list state
- `CONFIG.KEYS.LOCAL_UPDATES` -> local draw override storage key

## Quick Start

```bash
python -m http.server 5173
npm install
npm run lint
node scripts/smoke/smoke.mjs
npm run bench:ai
```

Local URL:

- `http://localhost:5173/`

## Verification Checklist

Required:

- `npm run lint`
- `node scripts/smoke/smoke.mjs`

Recommended manual checks:

1. Generate page load and number generation
2. Save a ticket for an already-closed draw and verify it settles immediately
3. Reset campaign options and verify the target draw follows the next draw again
4. AI recommendation and `requestNumbers` replacement flow
5. Data backup/import, including orphan-campaign cleanup after merge/overwrite
6. Sync button, cancel path, and no-proxy automatic fallback behavior
7. Target draw inputs: verify untouched values auto-follow the latest draw and reset buttons restore the next draw
8. Data list search and pagination: verify state survives page reload
9. Local updates summary / clear flow on the data page
10. Mobile settings modal rendering
11. Service worker update acceptance and reload behavior across tabs
12. Go offline and verify offline banner appears; go online and verify banner hides
13. On supported browser, verify the PWA install button appears in the sidebar

## Session Template

```md
### Session Handoff

- Changed files:
- Core behavior changes:
- Verification completed:
- Remaining risks:
- Suggested next work:
```
