# claude.md

## Purpose

This is the current handoff note for Claude-family agents working in `lotto---webapp`.
Use it to restore context quickly and avoid missing the current structure.

- Date: `2026-03-19`
- Static data latest draw: `1209`
- Static data rows: `1208`
- Missing draw: `146` → `CONFIG.LIMITS.MISSING_DRAWS = [146]` 상수로 명시됨

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
- Service worker cache version is `v12`.

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
- Target draw inputs (`genTargetDrawNo`, `campStartDraw`, `aiTargetDrawNo`) are auto-managed.
  - If the user has not manually edited the field, it follows the latest draw and stays on the next draw number.
  - Each field now has a reset button to restore the suggested next draw.
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
- PWA install prompt (`#pwaInstallBtn`) appears in the desktop sidebar when `beforeinstallprompt` fires.
- SW update BroadcastChannel (`lotto-sw-update`): when a user accepts a SW update in one tab, all open tabs receive a reload signal.
- `localStorage.setItem()` failures (e.g. `QuotaExceededError`) now surface a user-facing toast.
  - Storage quota warning toast fires proactively when usage crosses `STORAGE_WARNING_BYTES` or `STORAGE_DANGER_BYTES`.
- Settings modal focus on open now falls back to first focusable element if `#closeSettingsBtn` is unavailable.
- `StrategyWorkerClient` timeout scales by network quality (`navigator.connection.effectiveType`): 2G → ×2.5, 3G → ×1.5.
- The data page now exposes local update summary/cleanup UI.
  - `clearLocalUpdatesBtn` clears runtime-synced draw overrides and rebuilds `winningStats`.
- QR scanner cleanup is stricter.
  - Clicking the scan modal backdrop closes it.
  - Leaving the `check` route stops the active scanner.

## Key Files

- `index.html`
  - page shell, settings modal markup, offline banner (`#offlineBanner`), toast live region (`#toast-live-region`), PWA install button (`#pwaInstallBtn`), target-draw reset buttons, local update cleanup UI
- `assets/modules/index.js`
  - app entrypoint
- `assets/modules/bootstrap/pwa.js`
  - service worker registration, update UX, BroadcastChannel multi-tab reload
- `assets/modules/core/LottoApp.js`
  - facade, implementation in `core/app`; owns `_bindOfflineBanner()`, `_bindPwaInstallPrompt()`, `_loadDataListStateFromSession()`, target-draw auto-management helpers
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
- `assets/modules/core/data/sync.js`
  - single-draw payload diagnostics and sync warning meta updates
- `assets/modules/core/StrategyEngine.js`
  - facade, implementation in `core/strategy`
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
node scripts/smoke/smoke.mjs
```

Local URL:

- `http://localhost:5173/`

## Verification Checklist

Required:

- `npm run lint`
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
9. Mobile settings modal rendering
10. Service worker update acceptance and reload behavior (check all tabs reload)
11. Go offline → verify offline banner appears; go online → verify banner hides and toast fires
12. On supported browser: verify PWA install button appears in sidebar

## Session Template

```md
### Session Handoff

- Changed files:
- Core behavior changes:
- Verification completed:
- Remaining risks:
- Suggested next work:
```
