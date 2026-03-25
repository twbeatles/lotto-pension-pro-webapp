# gemini.md

## Purpose

This is the current context note for Gemini-family agents working in `lotto---webapp`.
Use it as a fast-start reference for the current structure, behavior, and validation flow.

- Date: `2026-03-25`
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
- Recent consistency fixes:
  - immediate settlement for already-drawn tickets
  - campaign reset restores target-draw auto-follow metadata
  - merge/overwrite import cleans orphan campaigns
- AI strategy additions:
  - richer context + reranking in `assets/modules/core/strategy/`
  - stable additions: `consensus_portfolio`, `bayesian_smooth`, `momentum_recent`, `mean_reversion_cycle`
  - AI-only automatic modes: `auto_recent_top`, `auto_ensemble_top3`

## UX Notes

- Storage, proxy, sync, alert, and theme settings are handled from the global settings modal.
- On mobile, the settings modal is intentionally rendered as a single-column sheet.
- The data page is focused on backup/import and list management.
- Data list search/page state is persisted in `sessionStorage`, and the page exposes local update summary/cleanup UI.
- Target draw inputs (`genTargetDrawNo`, `campStartDraw`, `aiTargetDrawNo`) auto-follow the next draw until manually edited.
- Generator campaign reset now restores the target-draw auto-follow metadata as well as the visible input values.
- Saving a ticket for a draw that already has winning data settles it immediately instead of waiting for a later sync.
- Merge/overwrite import prunes orphan campaigns and includes the cleanup count in the completion toast.
- Latest draw sync defaults to automatic fallback.
- A configured user proxy is preferred only when it matches the official `/proxy/latest` contract.
- Unsupported proxy formats are ignored at runtime and surfaced as warnings in settings.
- If no user proxy is set, the app still attempts runtime sync and falls back to static JSON plus local updates on failure.
- `data/winning_stats.json` is install-precached for offline stability.
- Invalid single-draw payload shapes emit `SYNC_FETCH_ONE_INVALID_PAYLOAD` and are surfaced via `syncMeta.lastWarningMessage`.
- `refreshCurrentRoute()` applies a stale guard so async refresh work from an old route does not render after a tab switch.
- Leaving the `check` route stops the QR scanner, and clicking the scanner backdrop closes it.
- AI recommendations rerank a candidate pool before final selection and surface recommendation diagnostics in the UI.

## Key Map

- `index.html`
  - page shell and settings modal markup
- `assets/modules/index.js`
  - app entrypoint
- `assets/modules/bootstrap/pwa.js`
  - service worker registration and update UX
- `assets/modules/core/LottoApp.js`
  - facade, implementation in `core/app`; target-draw auto-management lives here
- `assets/modules/core/app/latestDraw.js`
  - latest draw card refresh + target-draw autofill sync
- `assets/modules/core/app/moduleLoader.js`
  - route stale guard and QR cleanup on route exit
- `assets/modules/core/app/dataLists.js`
  - list rendering + local update summary/clear action
- `assets/modules/core/app/settingsPanel.js`
  - sync warning metadata rendering
- `assets/modules/core/data/records.js`
  - ticket add/bulk-add logic and immediate settlement
- `assets/modules/features/generator/form.js`
  - generator reset logic and campaign-default restore flow
- `assets/modules/features/dataio/support.js`
  - import helper utilities including orphan-campaign pruning
- `assets/modules/features/dataio/importExport.js`
  - merge/overwrite import orchestration
- `assets/modules/core/data/sync.js`
  - single-draw payload diagnostics and sync warning tracking
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
3. save a past-draw ticket and verify immediate settlement
4. reset campaign options and verify next-draw auto-follow resumes
5. backup/import behavior, including orphan-campaign cleanup
6. generator / AI / backtest basic flows
7. settings modal state reflection, including sync warning metadata
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
