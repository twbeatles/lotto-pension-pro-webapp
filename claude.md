# Claude Handoff

## Purpose

Current handoff note for agents working on `lotto-pension-pro-webapp`.

- Product name: `로또·연금복권 프로`
- Package/repository slug: `lotto-pension-pro-webapp`
- App type: no-build static SPA
- Primary entry flow: `index.html` -> `assets/modules/index.js` -> `assets/modules/core/LottoApp.js`
- Service worker cache version: `v26`

## Current Data Baseline

- Lotto 6/45 static data:
    - Source: `data/winning_stats.json`
    - Latest draw: `1224`
    - Rows: `1223`
    - Allowed missing draw: `[146]`
- Pension720+ static data:
    - Source: `data/pension720_stats.json`
    - Latest draw: `315`
    - Latest date: `2026-05-14`
    - Latest primary: `2조 537530`
    - Latest bonus: `358127`
- Both data files are included in the generated service-worker precache manifest.

## Runtime Shape

- Core app state and persistence live under `assets/modules/core/`.
- Feature modules live under `assets/modules/features/`.
- Lotto 6/45 recommendation logic remains under the existing strategy stack.
- Pension720+ logic is split across:
    - `assets/modules/core/Pension720Engine.js`
    - `assets/modules/core/data/pension720.js`
    - `assets/modules/features/Pension720.js`
- Storage keys under `CONFIG.KEYS` intentionally keep existing `lotto_pro_*` names for user data compatibility.
- Pension720+ official cache uses `lotto_pro_pension720_stats_cache_v1`.
- Generated/AI/Pension720 temporary results use `lotto_pro_temp_results_state` in sessionStorage only.
- Backup schema is v4 and includes `pension720Tickets`; default export prefix is `lotto_pension_pro_backup_v4`.
- Overwrite imports create a silent pre-replace backup with prefix `lotto_pension_pro_before_replace`; data cleanup uses `lotto_pension_pro_before_cleanup`.
- Destructive overwrite/cleanup flows abort if the silent backup download is not confirmed.
- Pension720+ saved tickets support copy, CSV export, and latest-draw reference checking.
- Pension720+ CSV exports use `lotto_pension_pro_pension720_tickets_<timestamp>.csv`.

## Product/Copy Contract

- Use `로또·연금복권 프로` for app title, manifest name, Open Graph title, and current docs.
- Use `lotto-pension-pro-webapp` for package name, repository slug, and Pages URL.
- Keep feature tabs concise:
    - `번호 생성`
    - `당첨 통계`
    - `번호 추천`
    - `연금복권`
    - `시뮬레이션`
    - `당첨 확인`
    - `데이터 관리`
- Avoid reviving legacy user-facing names such as older AI-prediction wording.
- Dated one-off review/audit files may be absent or deleted in the worktree. Do not restore them unless explicitly requested; fold durable conclusions into this handoff, `README.md`, `gemini.md`, or deployment docs.

## Current Implementation Status

- Lotto static data can be refreshed with `npm run sync:lotto`.
- Normal freshness check allows one missing draw; strict release freshness requires zero missing draws.
- localStorage write failures keep dirty state and are surfaced in storage health.
- Destructive import overwrite and cleanup require confirmed silent backup download.
- Service worker precache failures are recorded in `__cache-health.json`; install is allowed and the app shows a warning state.
- Pension720+ official data is cached when it is at least as fresh as static data, and `official_cache` is shown as a distinct source.
- Auto-sync availability is computed from recent failure state, last success time, and available sync path instead of being hard-coded.
- DOM selector contract and focused implementation regressions live in the smoke suite.

## Sync and Data Health

- Lotto 6/45:
    - Bundled static JSON is loaded first.
    - Runtime sync can use the official API, supported custom `/proxy/latest`, and built-in fallback providers.
    - `npm run check:data-freshness` fails if static data is more than one draw behind the estimated latest draw.
    - `npm run check:data-freshness:strict` fails if static data is not at the estimated latest draw.
- Pension720+:
    - `scripts/fetch_pension720_stats.mjs` fetches official `selectPstPt720WnList.do`.
    - `npm run sync:pension720` refreshes `data/pension720_stats.json`.
    - `npm run check:pension720` validates the checked-in snapshot.
    - `npm run check:pension720:freshness` compares checked-in data with the official endpoint and is part of `npm run build`.
- Data health can be `full`, `partial`, or `none`; partial data gates stats/recommendation/backtest routes but keeps generation/check/data flows usable.

## Verification

Run these before considering a change complete:

```bash
npm run lint
npm run check:data-freshness
npm run check:data-freshness:strict
npm run check:pension720
npm run check:pension720:freshness
node scripts/smoke/smoke.mjs
npm run build
npm run build:release
```

Useful browser checks:

```bash
npm run test:browser
npm run test:happy
npm run test:offline
npm run test:pwa-mobile
npm run test:sync-live
```

Operational scripts:

```bash
npm run sync:sw-manifest
npm run sync:lotto
npm run sync:pension720
npm run bench:ai
npm run bench:ai:full
```

## Deployment Notes

- GitHub Pages URL target: `https://twbeatles.github.io/lotto-pension-pro-webapp/`
- Repository rename itself is an external GitHub operation; docs assume it has been or will be completed.
- After changing app shell, manifest, service worker, data files, styles, or modules, rerun `npm run sync:sw-manifest`.
- If installable app metadata changes, bump `CACHE_VERSION` in `sw.js`.
- Release baseline is `npm run build:release`.
- Browser release checks should include happy path, offline, and PWA mobile validation.
- Use `git diff --check` before publishing. CRLF warnings from Git are not the same as whitespace errors.

## Session Handoff Template

```md
### Session Handoff

- Goal:
- Changed surfaces:
- Data/storage impact:
- PWA/cache impact:
- Verification completed:
- Remaining risks:
```
