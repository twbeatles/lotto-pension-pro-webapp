# 기능 구현 리스크 점검 및 개선 반영 보고서 - 2026-05-19

## 점검 기준

- 참조 문서: `README.md`, `claude.md`, `gemini.md`, `deploy_github_pages.md`, `proxy/README.md`
- 주요 구현 표면:
    - `index.html`
    - `assets/modules/core/`
    - `assets/modules/features/`
    - `assets/strategy.worker.js`
    - `sw.js`
    - `scripts/smoke/`
    - `scripts/tests/`
    - `.gitignore`
- 문서상 핵심 계약:
    - 로또 6/45와 연금복권720+ 정적 데이터 기준 유지
    - 백업 v5와 v4 이하 가져오기 호환
    - destructive overwrite/cleanup 전 백업 다운로드 및 사용자 확인
    - Pension720 전략/필터/캠페인/CSV/target-aware 확인
    - PWA service worker cache version `v26` 및 strategy worker asset query `v21`

## 확인된 리스크와 개선 결과

### 1. 로또 생성 개수 상한

- 기존 리스크: UI에는 `max=20`이 있으나 DOM 조작 또는 worker payload 조작 시 실행 경로에서 큰 count가 들어갈 수 있었음.
- 개선:
    - `GeneratorModule.generate()`에서 `setCount`를 `1..CONFIG.LIMITS.MAX_SET(20)`로 정규화.
    - `assets/strategy.worker.js`의 `GENERATE`/`RECOMMEND` entry에서 count를 방어적으로 clamp.
    - `StrategyEngine.generateMultipleSets()`는 backtest/bench 대량 생성을 깨지 않도록 선택적 `options.maxCount`만 추가.
- 검증:
    - `runGeneratorSetCountClampRegression`
    - `runGenerateMultipleSetsMaxCountRegression`

### 2. destructive 백업 확인

- 기존 리스크: `a.click()` 직후 `downloaded: true`를 반환해 실제 사용자 백업 확인과 문서 표현 사이에 차이가 있었음.
- 개선:
    - `ensureBackupBeforeDestructive()`를 async로 변경.
    - 백업 다운로드 트리거 후 `UIManager.confirm()`으로 사용자가 백업 저장을 확인해야 overwrite import/cleanup 진행.
    - overwrite import와 cleanup 호출부를 `await`로 변경.
- 검증:
    - 백업 다운로드 실패 시 overwrite 중단.
    - 백업 확인 취소 시 overwrite 중단.
    - cleanup도 동일 helper를 통해 중단 가능.

### 3. Pension720 target-aware 확인

- 기존 리스크: 저장 번호의 `targetDrawNo`가 있어도 최신 회차 하나로만 평가되어 미래 캠페인 번호가 낙첨처럼 보일 수 있었음.
- 개선:
    - `DataManager.resolvePension720TicketCheck()` 추가.
    - 대상 회차 데이터가 있으면 해당 회차로 평가.
    - 미래 대상 회차는 `대기`.
    - 대상 회차가 과거지만 데이터가 없으면 `데이터 없음`.
    - `targetDrawNo`가 없는 번호는 최신 회차 `참고 비교`.
    - `Pension720Module.runLatestCheck()`와 UI 문구를 target-aware 기준으로 갱신.
- 검증:
    - target draw 평가, 미래 회차 대기, 데이터 없음, 최신 참고 비교 smoke 추가.
    - browser happy path에서 target-aware 결과 문구 확인.

### 4. Pension720 브라우저 E2E

- 기존 리스크: smoke는 넓었지만 실제 브라우저 클릭 흐름은 부족했음.
- 개선:
    - `scripts/tests/happy_playwright.mjs`에 Pension720 플로우 추가.
    - 검증 범위: 탭 진입, 추천, 개별 저장, 확장 저장, 캠페인 생성, 확인, CSV 다운로드.

### 5. worker asset version 정책

- 기존 리스크: service worker cache version과 별도인 strategy worker query version bump를 놓칠 수 있었음.
- 개선:
    - `STRATEGY_WORKER_ASSET_VERSION`을 `v21`로 변경.
    - smoke에서 `v21` 및 URL query 적용 확인.
    - `README.md`, `claude.md`, `gemini.md`, `deploy_github_pages.md`, `cladue.md`에 정책 반영.

### 6. CSV formula injection 방어

- 기존 리스크: CSV 구분자 escaping은 있었지만 spreadsheet formula prefix 방어는 없었음.
- 개선:
    - `assets/modules/utils/csv.js` 공통 helper 추가.
    - `=`, `+`, `-`, `@`로 시작할 수 있는 셀 앞에 `'`를 붙여 spreadsheet formula 실행을 방지.
    - Pension720 저장 번호 CSV와 backtest 전략 비교 CSV에 적용.
- 검증:
    - Pension720 memo `=1+1` escape smoke 추가.
    - `scripts/tests/happy_playwright.mjs`에서 CSV 다운로드 파일명과 내용 확인.

## Markdown 문서 정합성 보강

- `README.md`
    - 기준일을 2026-05-19로 갱신.
    - Pension720 target-aware 확인, backup 확인 단계, CSV formula escape, worker asset `v21`, browser happy path 범위 반영.
- `claude.md`
    - destructive backup 확인 계약과 Pension720 target-aware/CSV/worker version 계약 갱신.
- `gemini.md`
    - feature map, runtime notes, validation notes에 신규 hardening 계약 반영.
- `cladue.md`
    - compatibility alias에도 현재 backup 확인 방식과 worker asset version 반영.
- `deploy_github_pages.md`
    - backup prefix를 v5로 수정.
    - silent backup wording 제거.
    - backtest CSV filename, formula escape, worker `v21`, browser/PWA 검증 항목 반영.
- `proxy/README.md`, `THIRD_PARTY_NOTICES.md`
    - 현재 변경과 직접 충돌하는 stale 문구 없음.

## .gitignore 점검 결과

- 기존 ignore가 이미 다루는 항목:
    - `node_modules/`
    - `.tmp-*`
    - `output/`, `playwright-report/`, `test-results/`, `.playwright/`
    - `reports/`, `bench-results/`, `perf-results/`, `downloads/`
    - app backup JSON과 Pension720 CSV export
- 추가한 항목:
    - `/시뮬레이션_전략비교_*.csv`
- 확인:
    - `git check-ignore -v`로 backup/export/test/report 산출물 ignore 확인.
    - 신규 소스 `assets/modules/utils/csv.js`는 ignore되지 않음.
    - `git clean -ndX` 기준 ignore 산출물은 로컬 `node_modules/`, `.tmp_vendor/` 정도이며 커밋 대상 아님.

## 최종 검증 기록

- `npm run sync:sw-manifest`: 실행
    - 신규 `assets/modules/utils/csv.js`가 precache manifest에 반영됨.
- `npm run build`: 통과
    - lint
    - Lotto data freshness
    - Pension720 static check
    - Pension720 official freshness
    - smoke regression
- `npm run test:browser`: 통과
    - generate -> ticket -> check
    - recommendation -> generator import
    - backup import merge
    - Pension720 recommend -> save -> campaign -> check -> CSV
    - offline/PWA mobile 시나리오
- `npm run check:data-freshness:strict`: 통과
    - Lotto static data latest `1224`, estimated `1224`, behind `0`.
- `npx prettier --check` on changed JS/MD/HTML files: 통과.
- `git diff --check`: 공백 오류 없음.
