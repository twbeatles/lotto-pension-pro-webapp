# Lotto Webapp Structure Notes (2026-04-14)

## Summary

- Repository: `lotto---webapp`
- App shape: no-build SPA using `index.html`, Vanilla JS ESM, and CSS
- Static draw dataset:
  - latest draw: `1209`
  - total rows: `1208`
  - missing draw: `146`
- Current direction:
  - generator strategy execution is now bound to the selected request, and generated results preserve provenance metadata
  - sync is internally abortable across manual/auto paths while public cancel remains manual-only
  - settings and operational state are managed from a global settings modal
  - modal, destructive action, and prompt UX are now centralized in `UIManager`
  - large files were split into facade entry files plus internal modules
  - smoke regressions now use domain modules plus a shared `manifest.mjs` execution plan and `support.mjs` dependency layer
  - AI strategy selection now includes richer weighting, reranking, and adaptive recent-performance-based auto strategies
  - latest draw sync now uses automatic fallback by default and prefers a user proxy only when it matches the official `/proxy/latest` contract
  - target draw defaults now follow the next draw automatically unless the user overrides them
  - sync diagnostics and local update cleanup were added to make runtime data issues observable
  - ticket-book duplicates now merge by `quantity` and all user-facing counts follow physical ticket totals
  - import reconstructs sync metadata as `local_restore` instead of persisting stale sync state
  - runtime `dataHealth` now distinguishes `full` / `partial` / `none`
  - if static JSON is unavailable, runtime can rebuild recent draws from local updates only and expose partial recovery mode
  - `stats`, `ai`, and `bt` are gated behind full-data availability, while `gen` and `check` keep running with warnings
  - service-worker update propagation across tabs now waits for activation (`controllerchange`) before broadcasting reload
  - `reconcileTicketChecks()` now revalidates stored `checked` tickets after sync/import/local-update cleanup
  - future local updates are sanitized centrally, and `syncMeta.lastSuccessDrawNo` is clamped to effective data
  - past-draw tickets settle immediately after save/import refresh, ticket delete/clear now also prune orphan campaigns, and history keeps actual-log duplicates
  - mobile navigation now uses `5탭 + 더보기`, and the check tab uses a card-list flow instead of native select
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
- Notable implementation files:
  - `assets/modules/core/app/moduleLoader.js`
    - barrel, with implementation split into `core/app/moduleLoader/`
  - `assets/modules/core/app/dataLists.js`
    - barrel, with implementation split into `core/app/dataLists/`
  - `assets/modules/core/UIManager.js`
    - facade/static container, with implementation split into `core/ui/`
  - `assets/modules/core/data/records.js`
    - barrel for generated/ticket/campaign/saved-list record helpers
  - `assets/modules/core/data/analytics.js`
    - full-ticket `checked` reconciliation against current winning stats, with quantity-aware settlement counts
  - `assets/modules/core/data/persistence.js`
    - barrel for proxy/storage/local-update/load-save helpers
  - `assets/modules/core/data/sync.js`
    - barrel for health/http/payload/provider/range/orchestrator helpers
  - `assets/modules/features/generator/form.js`
    - campaign reset restores target-draw auto-follow metadata
  - `assets/modules/features/dataio/support.js`
    - orphan-campaign pruning helpers
  - `assets/modules/features/dataio/importExport.js`
    - merge/overwrite import flow and cleanup-count toast
- Styles:
  - `assets/app.css` is the aggregate entrypoint
  - actual slices live in `assets/styles/`
- Smoke tests:
  - `scripts/smoke/smoke.mjs` stays as the entrypoint
  - shared helpers live in `scripts/smoke/helpers/`
  - regression cases live in `scripts/smoke/cases/`
  - domain regression modules live in `scripts/smoke/cases/regressions/`
  - `manifest.mjs` defines regression order / labels / export parity expectations
  - `support.mjs` centralizes common smoke imports/utilities

## UX Notes

- The generate page no longer exposes raw storage or `localStorage` details.
- The global settings modal owns:
  - theme
  - in-app/system alerts
  - custom proxy URL
  - sync metadata
  - app storage usage summary
- `UIManager` now owns:
  - common confirm/prompt dialogs
  - modal focus trap and focus restore
  - accessible number-ball rendering
- On mobile, the settings modal is intentionally single-column to avoid horizontal overflow.
- Mobile bottom navigation is now `gen/stats/ai/check/data + more`.
- The mobile more sheet routes to `bt`, settings, and install actions.
- The data page is focused on:
  - backup export/import
  - favorites/history/tickets/campaign lists
  - search and pagination
- The data page also exposes runtime local update summary and cleanup.
- The check tab now uses:
  - card list selection
  - search
  - ticket status filtering
  - keyboard navigation
  - always-visible scanned results
- Backtest results persist on route re-entry and include mini metric charts.
- Target draw inputs auto-follow the next draw until the user edits them, and each field can be reset to the suggested next draw.
- Resetting generator campaign options restores target-draw auto-follow metadata rather than only replacing the visible input value.
- Saving a past-draw ticket settles it immediately if the winning draw already exists locally.
- Merge/overwrite import prunes orphan campaigns and reports the cleanup count in the completion toast.
- `refreshCurrentRoute()` now uses a stale guard so async refresh work does not render after a tab switch.
- QR scanning is cleaned up more aggressively when leaving the `check` route.
- AI recommendations now:
  - support expanded strategies such as consensus, Bayesian smoothing, momentum, and mean-reversion
  - expose AI-only auto strategies that evaluate recent `N` draws and either pick the best single strategy or blend the top 3
  - rerank a candidate pool and surface recommendation diagnostics in the UI

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
- `lotto_pro_updates_v2` (`CONFIG.KEYS.LOCAL_UPDATES`)
- legacy proxy keys:
  - `lotto_webapp_settings_v1.proxyLatestUrl`
  - `lotto_webapp_settings_v1`

Operational rules:

- latest draw sync defaults to automatic fallback
- a configured custom proxy is preferred over built-in fallback providers only when it matches the official `/proxy/latest` contract
- unsupported proxy formats are ignored at runtime and surfaced as warnings in settings
- if automatic sync providers fail, the app stays on static JSON plus local updates
- proxy resolution order is `query -> v1 legacy -> v2 settings`
- invalid single-draw payload shapes log `SYNC_FETCH_ONE_INVALID_PAYLOAD` and update `syncMeta.lastWarningMessage`
- settings surface the latest response-structure warning to aid proxy/fallback troubleshooting
- favorites, tickets, campaigns, alerts, and presets save immediately
- `pagehide` and hidden `visibilitychange` force a flush save

## Service Worker and Deploy

- Service worker file: `sw.js`
- Cache version: `v17`
- App shell precache now includes the split core/feature modules and `assets/styles/*.css`
- Core data precache now includes `data/winning_stats.json`
- Reload after update only happens after explicit user acceptance
- Multi-tab reload is broadcast only after the new service worker is actually activated
- Production URL:
  - `https://twbeatles.github.io/lotto---webapp/`

## Verification

Base checks:

```bash
npm install
npm run lint
npm run build
node scripts/smoke/smoke.mjs
```

Optional:

```bash
node scripts/perf/bench.mjs
npm run bench:ai
python -m http.server 5173
```

Important regression areas:

- generator / AI / backtest flows
- AI adaptive strategy selection and recommendation diagnostics
- campaign caps and cascade delete
- single-flight sync / cancel / automatic fallback behavior
- target draw autofill / reset behavior
- immediate ticket settlement for past-draw tickets
- stale checked-ticket reconciliation after sync/import/local-update cleanup
- future local-update rejection and sync-meta clamping
- campaign reset autofill recovery
- stale async route refresh handling
- invalid single-draw payload diagnostics
- QR route-exit cleanup
- lazy-loaded tab routing for `ai`, `bt`, `check`
- import option handling, orphan-campaign cleanup, and actual-log history merge
- settings modal rendering, especially on mobile
- data list search and pagination
- local update summary / clear flow
- service-worker update acceptance and reload policy

## Notes

- Lint and smoke are the main automated safety net in this repo.
- Node still emits `MODULE_TYPELESS_PACKAGE_JSON` because `package.json` does not set `"type": "module"`.
- `FUNCTIONAL_IMPLEMENTATION_AUDIT_2026-04-14.md` should be treated as the current functional review artifact for the latest consistency + refactor pass.
- Other ad hoc review artifacts are not guaranteed to be versioned in-repo unless explicitly committed for the session.
