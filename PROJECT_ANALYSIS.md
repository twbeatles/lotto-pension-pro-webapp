# Lotto Webapp Structure Notes (2026-03-16)

## Summary

- Repository: `lotto---webapp`
- App shape: no-build SPA using `index.html`, Vanilla JS ESM, and CSS
- Static draw dataset:
  - latest draw: `1209`
  - total rows: `1208`
  - missing draw: `146`
- Current direction:
  - settings and operational state are managed from a global settings modal
  - large files were split into facade entry files plus internal modules
  - latest draw sync now uses automatic fallback by default and prefers a user proxy when configured
  - deployment target is GitHub Pages

## Current Layout

- Entry flow:
  - `index.html`
  - `assets/modules/index.js`
  - `assets/modules/bootstrap/pwa.js`
  - `assets/modules/core/LottoApp.js`
- Core facades:
  - `assets/modules/core/LottoApp.js`
    - implementation split into `assets/modules/core/app/`
  - `assets/modules/core/DataManager.js`
    - implementation split into `assets/modules/core/data/`
  - `assets/modules/core/StrategyEngine.js`
    - implementation split into `assets/modules/core/strategy/`
- Feature facades:
  - `assets/modules/features/Generator.js`
  - `assets/modules/features/Ai.js`
  - `assets/modules/features/Backtest.js`
  - `assets/modules/features/DataIO.js`
  - internal logic lives in feature-specific subdirectories
- Styles:
  - `assets/app.css` is the aggregate entrypoint
  - actual slices live in `assets/styles/`
- Smoke tests:
  - `scripts/smoke/smoke.mjs` stays as the entrypoint
  - shared helpers live in `scripts/smoke/helpers/`
  - regression cases live in `scripts/smoke/cases/`

## UX Notes

- The generate page no longer exposes raw storage or `localStorage` details.
- The global settings modal owns:
  - theme
  - in-app/system alerts
  - custom proxy URL
  - sync metadata
  - app storage usage summary
- On mobile, the settings modal is intentionally single-column to avoid horizontal overflow.
- The data page is focused on:
  - backup export/import
  - favorites/history/tickets/campaign lists
  - search and pagination

## Data and Storage

Main `DataManager.state` fields:

- `theme`, `favorites`, `history`
- `winningStats`, `staticLatestDrawNo`, `analytics`
- `generated`, `aiResults`
- `ticketBook`, `campaigns`
- `strategyPrefs`, `strategyPresets`
- `alertPrefs`, `customProxy`, `syncMeta`

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
- legacy proxy keys:
  - `lotto_webapp_settings_v1.proxyLatestUrl`
  - `lotto_webapp_settings_v1`

Operational rules:

- latest draw sync defaults to automatic fallback
- a configured custom proxy is preferred over built-in fallback providers
- if automatic sync providers fail, the app stays on static JSON plus local updates
- proxy resolution order is `query -> v1 legacy -> v2 settings`
- favorites, tickets, campaigns, alerts, and presets save immediately
- `pagehide` and hidden `visibilitychange` force a flush save

## Service Worker and Deploy

- Service worker file: `sw.js`
- Cache version: `v11`
- App shell precache now includes the split core/feature modules and `assets/styles/*.css`
- Reload after update only happens after explicit user acceptance
- Production URL:
  - `https://twbeatles.github.io/lotto---webapp/`

## Verification

Base checks:

```bash
npm install
npm run lint
node scripts/smoke/smoke.mjs
```

Optional:

```bash
node scripts/perf/bench.mjs
python -m http.server 5173
```

Important regression areas:

- generator / AI / backtest flows
- campaign caps and cascade delete
- single-flight sync / cancel / automatic fallback behavior
- lazy-loaded tab routing for `ai`, `bt`, `check`
- import option handling
- settings modal rendering, especially on mobile
- data list search and pagination
- service-worker update acceptance and reload policy

## Notes

- Lint and smoke are the main automated safety net in this repo.
- Node still emits `MODULE_TYPELESS_PACKAGE_JSON` because `package.json` does not set `"type": "module"`.
- `FUNCTIONAL_IMPLEMENTATION_REVIEW_2026-03-14.md` remains in the repo as the historical review, with a 2026-03-16 consistency addendum.
