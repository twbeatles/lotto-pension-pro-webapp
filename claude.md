# claude.md

## Purpose

Current handoff note for Claude-family agents working on `lotto-pension-pro-webapp`.

- Product name: `로또·연금복권 프로`
- Package/repository slug: `lotto-pension-pro-webapp`
- App type: no-build static SPA
- Primary entry flow: `index.html` -> `assets/modules/index.js` -> `assets/modules/core/LottoApp.js`
- Service worker cache version: `v25`

## Current Data Baseline

- Lotto 6/45 static data:
    - Source: `data/winning_stats.json`
    - Latest draw: `1223`
    - Rows: `1222`
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
- Backup schema is v4 and includes `pension720Tickets`; default export prefix is `lotto_pension_pro_backup_v4`.
- Overwrite imports create a silent pre-replace backup with prefix `lotto_pension_pro_before_replace`; data cleanup uses `lotto_pension_pro_before_cleanup`.
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
- Dated one-off review/audit files may be absent or deleted in the worktree. Do not restore them unless explicitly requested; fold durable conclusions into this handoff, `README.md`, `gemini.md`, or `deploy_github_pages.md`.

## Current Refactor Status

- Performance:
    - CSS is loaded as split app style files with the Pretendard font preloaded from `assets/vendor/`.
    - Strategy workers cache repeated candidate statistics and throttle progress updates to reduce repeated work and main-thread churn.
    - Backtest and AI rendering paths have been tightened to reduce unnecessary recalculation or DOM churn.
- UI/UX:
    - Major feature routes use beginner-friendly three-step overview chips.
    - Task, context, metric, and data cards separate setup, reference state, and results.
    - Mobile layouts are expected to collapse to one column without horizontal overflow.
- PWA:
    - App shell/style changes are represented by `CACHE_VERSION = 'v25'` and regenerated precache manifest output.
- Local artifacts:
    - Browser screenshots and visual verification output should stay out of git via `.gitignore` (`output/`, Playwright reports, test results).

## Sync and Data Health

- Lotto 6/45:
    - Bundled static JSON is loaded first.
    - Runtime sync can use the official API, supported custom `/proxy/latest`, and built-in fallback providers.
    - `npm run check:data-freshness` fails if static data is more than one draw behind the estimated latest draw.
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
npm run check:pension720
npm run check:pension720:freshness
node scripts/smoke/smoke.mjs
npm run build
```

Useful browser checks:

```bash
npm run test:happy
npm run test:offline
npm run test:pwa-mobile
npm run test:sync-live
```

Operational scripts:

```bash
npm run sync:sw-manifest
npm run sync:pension720
npm run bench:ai
npm run bench:ai:full
```

## Deployment Notes

- GitHub Pages URL target: `https://twbeatles.github.io/lotto-pension-pro-webapp/`
- Repository rename itself is an external GitHub operation; docs assume it has been or will be completed.
- After changing app shell, manifest, service worker, data files, styles, or modules, rerun `npm run sync:sw-manifest`.
- If installable app metadata changes, bump `CACHE_VERSION` in `sw.js`.
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
