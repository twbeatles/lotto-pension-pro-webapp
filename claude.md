# claude.md

## Purpose

This is the current handoff note for Claude-family agents working in `lotto---webapp`.
Use it to restore context quickly and avoid missing the current structure.

- Date: `2026-03-16`
- Static data latest draw: `1209`
- Static data rows: `1208`
- Missing draw: `146`

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
- Service worker cache version is `v11`.

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
- Latest draw sync defaults to automatic fallback.
  - A configured user proxy is preferred.
  - Without a user proxy, the app still attempts runtime sync and stores fetched draws into local updates.

## Key Files

- `index.html`
  - page shell and settings modal markup
- `assets/modules/index.js`
  - app entrypoint
- `assets/modules/bootstrap/pwa.js`
  - service worker registration and update UX
- `assets/modules/core/LottoApp.js`
  - facade, implementation in `core/app`
- `assets/modules/core/DataManager.js`
  - facade, implementation in `core/data`
- `assets/modules/core/StrategyEngine.js`
  - facade, implementation in `core/strategy`
- `assets/modules/features/*.js`
  - original import paths preserved
- `assets/app.css`
  - style aggregate entrypoint
- `sw.js`
  - app shell precache and fetch policy

## Storage / Sync

Main storage keys:

- `lotto_pro_fav_v2`
- `lotto_pro_hist_v2`
- `lotto_pro_settings_v2`
- `lotto_pro_ticketbook_v1`
- `lotto_pro_campaigns_v1`
- `lotto_pro_alerts_v1`
- `lotto_pro_strategy_presets_v1`
- `lotto_pro_sync_meta_v1`
- `lotto_pro_updates_v2`

Proxy resolution order:

1. `?proxyUrl=` / `?proxy=`
2. `lotto_webapp_settings_v1.proxyLatestUrl`
3. `lotto_pro_settings_v2.customProxy`
4. otherwise automatic fallback sync

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
2. Settings modal open/close and state reflection
3. AI recommendation and `requestNumbers` replacement flow
4. Data backup/import
5. Sync button, cancel path, and no-proxy automatic fallback behavior
6. Data list search and pagination
7. Mobile settings modal rendering
8. Service worker update acceptance and reload behavior

## Session Template

```md
### Session Handoff

- Changed files:
- Core behavior changes:
- Verification completed:
- Remaining risks:
- Suggested next work:
```
