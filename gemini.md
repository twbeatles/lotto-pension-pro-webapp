# gemini.md

## Purpose

This is the current context note for Gemini-family agents working in `lotto---webapp`.
Use it as the fast-start reference for the current structure and workflow.

- Date: `2026-03-19`
- Static data latest draw: `1209`
- Static data rows: `1208`
- Missing draw: `146`

## Current Snapshot

- App type: no-build SPA
- Entry flow:
  - `index.html`
  - `assets/modules/index.js`
  - `assets/modules/core/LottoApp.js`
- PWA bootstrap:
  - `assets/modules/bootstrap/pwa.js`
- Service worker cache version:
  - `v12`
- Styles:
  - `assets/app.css` is the aggregate entrypoint
  - actual style slices live in `assets/styles/*.css`
- Split core internals:
  - `assets/modules/core/app/`
  - `assets/modules/core/data/`
  - `assets/modules/core/strategy/`
- Split feature internals:
  - `assets/modules/features/ai/`
  - `assets/modules/features/backtest/`
  - `assets/modules/features/dataio/`
  - `assets/modules/features/generator/`
- Smoke layout:
  - `scripts/smoke/helpers/`
  - `scripts/smoke/cases/`
  - `scripts/smoke/smoke.mjs`

## UX Notes

- Storage, proxy, sync, alert, and theme settings are handled from the global settings modal.
- On mobile, the settings modal is intentionally rendered as a single-column sheet.
- The data page is focused on backup/import and list management.
- Data list rendering is aligned with actual search/pagination state again.
- Data list search/page state is persisted in `sessionStorage` and the page also exposes local update summary/cleanup UI.
- Target draw inputs (`genTargetDrawNo`, `campStartDraw`, `aiTargetDrawNo`) auto-follow the next draw until manually edited.
- Each target draw input has a reset action to restore the suggested next draw.
- Latest draw sync defaults to automatic fallback.
- A configured user proxy is preferred only when it matches the official `/proxy/latest` contract.
- Unsupported proxy formats are ignored at runtime and surfaced as warnings in settings.
- If no user proxy is set, the app still attempts runtime sync and falls back to static JSON plus local updates on failure.
- `data/winning_stats.json` is install-precached for offline stability.
- Invalid single-draw payload shapes now emit `SYNC_FETCH_ONE_INVALID_PAYLOAD` and are surfaced via `syncMeta.lastWarningMessage`.
- `refreshCurrentRoute()` applies a stale guard so async refresh work from an old route does not render after a tab switch.
- Leaving the `check` route stops the QR scanner, and clicking the scanner backdrop closes it.

## Key Map

- `index.html`
  - page shell and settings modal markup
- `assets/modules/index.js`
  - app entrypoint
- `assets/modules/bootstrap/pwa.js`
  - service worker registration and update UX
- `assets/modules/core/LottoApp.js`
  - facade, implementation in `core/app`; target-draw auto-management lives here
- `assets/modules/core/DataManager.js`
  - facade, implementation in `core/data`
- `assets/modules/core/app/latestDraw.js`
  - latest draw card refresh + target-draw autofill sync
- `assets/modules/core/app/moduleLoader.js`
  - route stale guard and QR cleanup on route exit
- `assets/modules/core/app/dataLists.js`
  - list rendering + local update summary/clear action
- `assets/modules/core/app/settingsPanel.js`
  - sync warning metadata rendering
- `assets/modules/core/data/sync.js`
  - single-draw payload diagnostics and sync warning tracking
- `assets/modules/core/StrategyEngine.js`
  - facade, implementation in `core/strategy`
- `assets/modules/features/*.js`
  - public entry files kept stable
- `sw.js`
  - app-shell precache and fetch strategy

## Storage / Sync

Main keys:

- `lotto_pro_fav_v2`
- `lotto_pro_hist_v2`
- `lotto_pro_settings_v2`
- `lotto_pro_ticketbook_v1`
- `lotto_pro_campaigns_v1`
- `lotto_pro_alerts_v1`
- `lotto_pro_strategy_presets_v1`
- `lotto_pro_sync_meta_v1`
- `lotto_pro_updates_v2` (`CONFIG.KEYS.LOCAL_UPDATES`)

Proxy priority:

1. `?proxyUrl=` / `?proxy=`
2. legacy `lotto_webapp_settings_v1.proxyLatestUrl`
3. `lotto_pro_settings_v2.customProxy`
4. otherwise automatic fallback sync

Official supported custom proxy shape:

- absolute `http(s)` URL
- path contains `/proxy/latest`
- unsupported shapes (`?url=`, `{url}`, `{draw_no}`) are ignored at runtime
- `syncMeta` also stores recent warning diagnostics for invalid single-draw response shapes

## Quick Commands

```bash
python -m http.server 5173
npm install
npm run lint
node scripts/smoke/smoke.mjs
```

Local URL:

- `http://localhost:5173/`

## Verification Priority

1. `npm run lint`
2. `node scripts/smoke/smoke.mjs`
3. generator / AI / backtest basic flows
4. target draw autofill and reset behavior
5. settings modal state reflection, including sync warning metadata
6. mobile settings modal rendering
7. backup/import behavior
8. proxy unset/set sync policy and invalid payload diagnostics
9. data-page local update cleanup flow
10. service worker update acceptance and reload

## Session Template

```md
### Session Handoff (Gemini)

- Changed files:
- Change goal:
- Data/storage impact:
- Worker contract impact:
- Verification completed:
- Remaining risks:
- Next recommended task:
```
