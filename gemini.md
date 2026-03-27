# gemini.md

## Purpose

This is the current context note for Gemini-family agents working in `lotto---webapp`.
Use it as the fast-start reference for the current structure and workflow.

- Date: `2026-03-27`
- Static data latest draw: `1209`
- Static data rows: `1208`
- Missing draw: `146`
- Current functional review artifact: `FUNCTIONAL_IMPLEMENTATION_REVIEW_2026-03-25.md`

## Current Snapshot

- App type: no-build SPA
- Entry flow:
  - `index.html`
  - `assets/modules/index.js`
  - `assets/modules/core/LottoApp.js`
- PWA bootstrap:
  - `assets/modules/bootstrap/pwa.js`
- Service worker cache version:
  - `v17`
- Recent consistency fixes:
  - immediate settlement for already-drawn tickets
  - generator campaign reset restores target-draw auto-follow metadata
  - merge/overwrite import cleans orphan campaigns and reports cleanup counts
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
- AI strategy additions:
  - richer context + reranking in `assets/modules/core/strategy/`
  - stable additions: `consensus_portfolio`, `bayesian_smooth`, `momentum_recent`, `mean_reversion_cycle`
  - AI-only automatic modes: `auto_recent_top`, `auto_ensemble_top3`

## UX Notes

- Storage, proxy, sync, alert, and theme settings are handled from the global settings modal.
- On mobile, the settings modal is intentionally rendered as a single-column sheet.
- `UIManager` now provides common confirm/prompt modals with focus trap and focus restore.
- The data page is focused on backup/import and list management.
- Data list rendering is aligned with actual search/pagination state again.
- Data list search/page state is persisted in `sessionStorage` and the page also exposes local update summary/cleanup UI.
- Generate/campaign actions now guard against duplicate runs and stale async result overwrites.
- Resetting campaign options restores the target-draw auto-follow metadata rather than only resetting the raw input value.
- Backtest results persist across route re-entry and render mini metric charts.
- Saving a past-draw ticket settles it immediately if the winning draw is already available locally.
- The check tab now uses a card list with search, ticket-status filtering, keyboard navigation, and always-visible scanned results.
- Mobile bottom navigation is now `gen/stats/ai/check/data + more`, and install entry points are mirrored to desktop/settings/mobile more.
- Target draw inputs (`genTargetDrawNo`, `campStartDraw`, `aiTargetDrawNo`) auto-follow the next draw until manually edited.
- Each target draw input has a reset action to restore the suggested next draw.
- Latest draw sync defaults to automatic fallback.
- A configured user proxy is preferred only when it matches the official `/proxy/latest` contract.
- Unsupported proxy formats are ignored at runtime and surfaced as warnings in settings.
- If no user proxy is set, the app still attempts runtime sync and falls back to static JSON plus local updates on failure.
- `data/winning_stats.json` is install-precached for offline stability.
- Invalid single-draw payload shapes now emit `SYNC_FETCH_ONE_INVALID_PAYLOAD` and are surfaced via `syncMeta.lastWarningMessage`.
- Merge/overwrite import prunes orphan campaigns and includes the cleanup count in the completion toast.
- `refreshCurrentRoute()` applies a stale guard so async refresh work from an old route does not render after a tab switch.
- Leaving the `check` route stops the QR scanner, and clicking the scanner backdrop closes it.
- AI recommendations now also:
  - rerank a candidate pool before final selection
  - surface recommendation score / pair synergy / profile fit / gap balance diagnostics
  - use `aiLookbackWindow` as the recent `N` window when automatic AI-only strategies are selected

## Key Map

- `index.html`
  - page shell, settings modal, mobile more sheet, dialog modal
- `assets/modules/index.js`
  - app entrypoint
- `assets/modules/bootstrap/pwa.js`
  - service worker registration and update UX
- `assets/modules/core/LottoApp.js`
  - facade, implementation in `core/app`; target-draw auto-management and mobile more/install sync live here
- `assets/modules/core/UIManager.js`
  - toast + shared dialog modal + focus trap + accessible ball rendering
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
- `assets/modules/core/data/records.js`
  - immediate settlement for past-draw tickets
- `assets/modules/core/data/sync.js`
  - single-draw payload diagnostics and sync warning tracking
- `assets/modules/features/Check.js`
  - card-list based check flow and scanned/ticket filter handling
- `assets/modules/features/backtest/ui.js`
  - persisted state re-render and mini charts
- `assets/modules/features/generator/form.js`
  - campaign reset restores target-draw auto-follow metadata
- `assets/modules/features/dataio/support.js`
  - orphan-campaign pruning helpers
- `assets/modules/features/dataio/importExport.js`
  - import flow and cleanup-count toast
- `assets/modules/utils/strings.js`
  - centralized user-facing strings
- `assets/modules/core/StrategyEngine.js`
  - facade, implementation in `core/strategy`
- `assets/modules/core/strategy/context.js`
  - richer recent-history stats including pair matrices and gap distributions
- `assets/modules/core/strategy/weights.js`
  - base weights and adaptive recent-performance auto-strategy logic
- `assets/modules/core/strategy/generation.js`
  - reranking and diversity-aware candidate selection
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
npm run bench:ai
```

Local URL:

- `http://localhost:5173/`

## Verification Priority

1. `npm run lint`
2. `node scripts/smoke/smoke.mjs`
3. generator / AI / backtest basic flows
4. target draw autofill and reset behavior
5. settings modal state reflection, including sync warning metadata
6. mobile settings modal and mobile more sheet rendering
7. check tab card list, search/filter state, and keyboard navigation
8. backup/import behavior
9. save a past-draw ticket and verify it settles immediately
10. reset campaign options and verify target-draw auto-follow resumes
11. backup/import including orphan-campaign cleanup toast counts
12. proxy unset/set sync policy and invalid payload diagnostics
13. data-page local update cleanup flow
14. common confirm modal flows for destructive actions and preset overwrite/delete
15. service worker update acceptance and reload

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
