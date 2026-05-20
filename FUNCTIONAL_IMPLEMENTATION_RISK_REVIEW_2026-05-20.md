# 기능 구현 리스크 개선 결과 보고서 - 2026-05-20

## 점검 및 개선 범위

- 기준 문서: `README.md`, `claude.md`
- 보조 문서: `gemini.md`, `cladue.md`, `deploy_github_pages.md`, `proxy/README.md`, `THIRD_PARTY_NOTICES.md`
- 구현 표면:
    - `assets/modules/core/`
    - `assets/modules/features/`
    - `assets/strategy.worker.js`
    - `sw.js`
    - `scripts/smoke/`
    - `scripts/tests/`
    - `package.json`

이번 작업은 최초 리스크 점검에서 제안한 F-01~F-06 전체를 코드, 회귀 테스트, 운영 문서에 반영한 후 재검증했습니다.

## 반영 완료 항목

### F-01. 앱 생성 백업의 재가져오기 계약 보강

- 상태: 완료
- 변경:
    - `CONFIG.LIMITS.MAX_IMPORT_BYTES`를 32MB로 상향했습니다.
    - 8MB 이상 backup export에는 크기 경고를 표시합니다.
    - `exportAll()`이 UTF-8 byte 크기와 export method를 반환하도록 했습니다.
    - Lotto 2000개, Pension720+ 1000개, 큰 strategy snapshot을 포함한 앱 생성 backup fixture가 import 한도 안에 들어오는 회귀 테스트를 추가했습니다.
- 관련 파일:
    - `assets/modules/utils/config.js`
    - `assets/modules/features/dataio/support.js`
    - `scripts/smoke/cases/regressions/data.mjs`

### F-02. Lotto 6/45 공식 최신 회차 필드 검증 추가

- 상태: 완료
- 변경:
    - `scripts/check_lotto_official_freshness.mjs`를 추가했습니다.
    - `npm run check:lotto:official`을 추가했습니다.
    - `npm run build:release`가 strict freshness 이후 Lotto 최신 회차의 공식 `date`, `numbers`, `bonus`, 주요 금액 필드를 비교합니다.
    - 비교 함수 회귀 테스트를 smoke suite에 추가했습니다.
- 관련 파일:
    - `scripts/check_lotto_official_freshness.mjs`
    - `package.json`
    - `scripts/smoke/cases/regressions/sync.mjs`

### F-03. Pension720+ official cache 우선순위 보정

- 상태: 완료
- 변경:
    - official cache는 static보다 더 최신 회차일 때만 static을 대체합니다.
    - 같은 회차에서는 보정된 static snapshot이 official cache보다 우선합니다.
    - 데이터 상태 카드에 `official_cache` 상태일 때 cache 삭제 버튼을 표시합니다.
    - 같은 회차 static 보정값이 cache를 이기는 회귀 테스트를 추가했습니다.
- 관련 파일:
    - `assets/modules/core/data/pension720.js`
    - `assets/modules/features/dataio/support.js`
    - `assets/styles/pages.css`
    - `scripts/smoke/cases/regressions/implementation.mjs`

### F-04. 브라우저 live source canary 추가

- 상태: 완료
- 변경:
    - `npm run test:sync-live:browser`를 추가했습니다.
    - 실제 브라우저에서 로또 최신 단일 회차 fetch와 Pension720+ `official`/`official_cache`/명시 fallback source를 확인합니다.
    - `--require-official` 옵션을 붙이면 Pension720+ source가 `official` 또는 `official_cache`가 아닐 때 실패하도록 사용할 수 있습니다.
- 관련 파일:
    - `scripts/tests/live_data_source_playwright.mjs`
    - `package.json`
    - `README.md`
    - `deploy_github_pages.md`

### F-05. destructive backup UX 보강

- 상태: 완료
- 변경:
    - overwrite import와 cleanup 전 backup은 지원 브라우저에서 `showSaveFilePicker()` 기반 파일 쓰기 완료를 먼저 시도합니다.
    - 미지원 브라우저에서는 기존 download 방식으로 fallback하되, 파일명과 크기, 다운로드 차단/실패 시 중단하라는 문구를 명확히 표시합니다.
    - destructive backup helper가 file picker path와 fallback warning을 유지하는 회귀 테스트를 추가했습니다.
- 관련 파일:
    - `assets/modules/features/dataio/support.js`
    - `scripts/smoke/cases/regressions/implementation.mjs`

### F-06. Strategy worker cache-empty 자동 복구

- 상태: 완료
- 변경:
    - worker가 stats cache empty를 `STRATEGY_WORKER_CACHE_EMPTY` 코드로 반환합니다.
    - client는 해당 오류를 받으면 fingerprint를 비우고 full `statsData`로 1회 재시도합니다.
    - worker 실행 계약 변경에 맞춰 `STRATEGY_WORKER_ASSET_VERSION`을 `v22`로 올렸습니다.
    - cache-empty retry 회귀 테스트를 추가했습니다.
- 관련 파일:
    - `assets/strategy.worker.js`
    - `assets/modules/core/StrategyWorkerClient.js`
    - `scripts/smoke/cases/regressions/strategy.mjs`

## PWA 및 문서 계약 변경

- `sw.js` `CACHE_VERSION`: `v26` -> `v27`
- strategy worker asset query version: `v21` -> `v22`
- 유지 문서 갱신:
    - `README.md`
    - `claude.md`
    - `gemini.md`
    - `cladue.md`
    - `deploy_github_pages.md`

## Markdown 및 .gitignore 후속 점검

- `README.md`, `claude.md`, `gemini.md`, `cladue.md`, `deploy_github_pages.md`, `proxy/README.md`, `THIRD_PARTY_NOTICES.md`를 현재 코드 기준으로 재검색했습니다.
- stale 항목으로 남아 있던 `cladue.md`의 worker version과 destructive backup 설명을 `v22`, `v27`, File System Access API 우선 저장 계약으로 갱신했습니다.
- `git check-ignore -v --no-index`로 대표 산출물 ignore coverage를 확인했습니다.
    - `node_modules/`
    - `playwright-report/`
    - `test-results/`
    - `.playwright/`
    - `output/`
    - `reports/`
    - `bench-results/`
    - `perf-results/`
    - `downloads/`
    - `screenshots/`
    - root backup JSON/CSV export 파일명
    - `.wrangler/`, `.vercel/`, `.env`, `backup/`
- 신규 script는 저장소에 포함되어야 하는 source file이고 로컬 산출물을 만들지 않으므로 `.gitignore` 추가 수정은 하지 않았습니다.

## 검증 결과

- `npm run lint`: 통과
- `npm run check:lotto:official`: 통과
    - static latest: `1224`, `2026-05-16`, `9,18,21,27,44,45`, bonus `28`
    - official latest: `1224`, `2026-05-16`, `9,18,21,27,44,45`, bonus `28`
- `node scripts/smoke/smoke.mjs`: 통과
    - 신규 회귀 포함: backup size contract, Lotto official comparison, Pension720 same-draw cache precedence, destructive backup file-picker/fallback policy, strategy worker cache-empty retry
- `npm run build:release`: 통과
    - `lint`
    - Lotto freshness normal/strict
    - Lotto official latest field comparison
    - Pension720+ static and official freshness
    - smoke suite
- `npm run test:browser`: 통과
    - happy path
    - offline/PWA
    - android-like mobile PWA
- `npm run test:sync-live:browser`: 통과
    - Lotto browser fetch: `1224`
    - Pension720+ browser source: `official`, latest `315`
- `git diff --check`: 통과
    - Git의 CRLF 변환 안내만 출력되었고 whitespace error는 없었습니다.

## 남은 운영 리스크

- `check:lotto:official`, `check:pension720:freshness`, `test:sync-live:browser`는 외부 공식 endpoint와 네트워크 상태에 영향을 받습니다. 실패 시 데이터 불일치인지 일시 장애인지 분리해서 봐야 합니다.
- File System Access API는 모든 브라우저에서 지원되지 않으므로, 미지원 환경은 download fallback과 사용자 확인에 의존합니다.
- 32MB import 한도는 현재 앱이 생성할 수 있는 큰 백업을 수용하지만, 장기적으로는 티켓별 strategy snapshot dedupe 또는 압축 backup이 더 나은 구조입니다.
