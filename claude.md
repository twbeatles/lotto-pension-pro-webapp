# claude.md

## Purpose

This is the current handoff note for Claude-family agents working in `lotto---webapp`.
Use it to restore context quickly and avoid missing the current structure.

- Date: `2026-03-17`
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
- Latest draw sync defaults to automatic fallback.
  - A configured user proxy is preferred only when it matches the official `/proxy/latest` contract.
  - Without a user proxy, the app still attempts runtime sync and stores fetched draws into local updates.
  - Unsupported proxy formats are ignored and surfaced as warnings in settings.
  - `data/winning_stats.json` is install-precached for offline stability.
  - Sync race condition: if the proxy config changes while a sync is in flight, the old request is cancelled and a new one starts.
  - Range fetch responses are Content-Type validated — HTML error pages are rejected before JSON parsing.
- Offline banner (`#offlineBanner`) is shown at the top of the page when `navigator.onLine` is false.
  - Connects/disconnects reactively via `online` / `offline` window events.
- PWA install prompt (`#pwaInstallBtn`) appears in the desktop sidebar when `beforeinstallprompt` fires.
- SW update BroadcastChannel (`lotto-sw-update`): when a user accepts a SW update in one tab, all open tabs receive a reload signal.
- `localStorage.setItem()` failures (e.g. `QuotaExceededError`) now surface a user-facing toast.
  - Storage quota warning toast fires proactively when usage crosses `STORAGE_WARNING_BYTES` or `STORAGE_DANGER_BYTES`.
- Settings modal focus on open now falls back to first focusable element if `#closeSettingsBtn` is unavailable.
- `StrategyWorkerClient` timeout scales by network quality (`navigator.connection.effectiveType`): 2G → ×2.5, 3G → ×1.5.

## Key Files

- `index.html`
  - page shell, settings modal markup, offline banner (`#offlineBanner`), toast live region (`#toast-live-region`), PWA install button (`#pwaInstallBtn`)
- `assets/modules/index.js`
  - app entrypoint
- `assets/modules/bootstrap/pwa.js`
  - service worker registration, update UX, BroadcastChannel multi-tab reload
- `assets/modules/core/LottoApp.js`
  - facade, implementation in `core/app`; owns `_bindOfflineBanner()`, `_bindPwaInstallPrompt()`, `_loadDataListStateFromSession()`
- `assets/modules/core/DataManager.js`
  - facade, implementation in `core/data`
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
- `lotto_pro_updates_v2`

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
6. Data list search and pagination — verify state survives page reload
7. Mobile settings modal rendering
8. Service worker update acceptance and reload behavior (check all tabs reload)
9. Go offline → verify offline banner appears; go online → verify banner hides and toast fires
10. On supported browser: verify PWA install button appears in sidebar

## Session Template

```md
### Session Handoff

- Changed files:
- Core behavior changes:
- Verification completed:
- Remaining risks:
- Suggested next work:
```
