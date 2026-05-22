# 기능 구현 리스크 개선 결과 보고서 - 2026-05-22

## 기준과 범위

- 참조 문서: `README.md`, `claude.md`
- 보조 문서: `gemini.md`, `cladue.md`, `deploy_github_pages.md`, `proxy/README.md`, `THIRD_PARTY_NOTICES.md`
- 구현 표면:
    - `data/pension720_stats.json`
    - `sw.js`
    - `package.json`
    - `.github/workflows/data-freshness.yml`
    - `scripts/fetch_pension720_stats.mjs`
    - `scripts/smoke/cases/regressions/`
    - `.gitignore`

이번 작업은 2026-05-22 리스크 점검에서 제안한 F-01~F-05 전체를 구현, 문서, 회귀 테스트, 운영 workflow에 반영하는 범위입니다. 추가로 2026-05-22 후속 문서/ignore 감사에서 maintained Markdown과 `.gitignore`가 실제 코드베이스 산출물과 맞는지 재확인했습니다.

## 반영 완료 항목

### F-01. Pension720+ checked-in static data 최신화

- 상태: 완료
- 변경:
    - `npm run sync:pension720`로 `data/pension720_stats.json`을 316회차까지 갱신했습니다.
    - 최신 정적 기준은 `316`, `2026-05-21`, `3조 331818`, 보너스 `449298`입니다.
    - `scripts/fetch_pension720_stats.mjs`가 기존 데이터 파일 스타일처럼 숫자 배열을 한 줄로 렌더링하도록 보강해, 향후 sync에서 불필요한 전체 JSON 포맷 churn이 생기지 않게 했습니다.
    - `README.md`, `claude.md`, `gemini.md`, `cladue.md`, `deploy_github_pages.md`의 기준 회차와 운영 설명을 갱신했습니다.

### F-02. 데이터 최신성 유지 scheduled check 추가

- 상태: 완료
- 변경:
    - `.github/workflows/data-freshness.yml`을 추가했습니다.
    - workflow는 수동 실행과 매일 UTC 22:20 scheduled 실행을 지원합니다.
    - `npm ci`, `check:data-freshness:strict`, `check:lotto:official`, `check:pension720:freshness`, `build:release`를 실행합니다.
    - 자동 데이터 커밋이나 PR 생성은 하지 않습니다.

### F-03. 브라우저 live canary 엄격 모드 노출

- 상태: 완료
- 변경:
    - `npm run test:sync-live:browser:official`을 추가했습니다.
    - `npm run build:release:browser`를 추가해 release gate 이후 공식 source browser canary까지 실행할 수 있게 했습니다.
    - 릴리스/운영 문서에 기본 live canary와 엄격 official canary의 차이를 반영했습니다.

### F-04. PWA data cache 최신성 정책 보강

- 상태: 완료
- 변경:
    - `sw.js`의 `data/*.json` fetch 정책을 `staleWhileRevalidate`에서 `networkFirstWithTimeout(..., CACHE_DATA, 3500, { fallbackOnErrorStatus: true })`로 변경했습니다.
    - 네트워크 성공 시 새 data response가 cache를 갱신하고, 네트워크 실패나 오류 응답 시 기존 data cache로 fallback합니다.
    - service worker cache version을 `v28`로 올렸습니다.
    - smoke에 data network-first 동작과 오류 응답 fallback 회귀를 추가했습니다.

### F-05. smoke 최신성 역할 명확화

- 상태: 완료
- 변경:
    - Pension720+ static smoke 메시지를 "최소 fixture 회귀"로 명확히 했습니다.
    - 최신성 검증은 `npm run check:pension720:freshness`와 release gate가 담당한다는 설명을 문서에 반영했습니다.

## 현재 데이터 기준

- Lotto 6/45 static data:
    - latest draw: `1224`
    - rows: `1223`
    - allowed missing draw: `[146]`
- Pension720+ static data:
    - latest draw: `316`
    - latest date: `2026-05-21`
    - latest primary: `3조 331818`
    - latest bonus: `449298`
- Service worker cache version: `v28`
- Strategy worker asset query version: `v22`

## 문서 정합성 점검 결과

- `README.md`: 현재 데이터 기준, PWA cache version, release/browser canary, scheduled freshness workflow, 현재 감사 문서 경로를 코드 기준과 맞췄습니다.
- `claude.md`, `gemini.md`: agent handoff 기준 데이터, service worker data cache 정책, release/browser 검증 명령, scheduled workflow 설명을 맞췄습니다.
- `cladue.md`: compatibility alias 문서에도 service worker version, release/browser gate, doc/ignore 감사 기준을 반영했습니다.
- `deploy_github_pages.md`: 배포 전 검증, 데이터 기준, PWA cache 이름, browser canary, `.gitignore` 적용 대상 설명을 맞췄습니다.
- `proxy/README.md`: 프록시는 Lotto 6/45 고급 연결 전용이고 Pension720+ 공식 최신성 검증은 별도 endpoint를 사용한다는 범위를 명확히 했습니다.
- `THIRD_PARTY_NOTICES.md`: 새 runtime vendor dependency가 추가되지 않아 변경이 필요하지 않았습니다.

## `.gitignore` 점검 결과

- 상태: 변경 불필요
- 확인한 ignore 범위:
    - app backup/export: `lotto_pension_pro_backup_v*.json`, `lotto_pension_pro_before_replace_*.json`, `lotto_pension_pro_before_cleanup_*.json`
    - Pension720+/simulation CSV: `lotto_pension_pro_pension720_tickets_*.csv`, `시뮬레이션_전략비교_*.csv`
    - browser/test outputs: `playwright-report/`, `test-results/`, `.playwright/`, `output/`, `downloads/`, `screenshots/`
    - report/perf outputs: `reports/`, `bench-results/`, `perf-results/`
    - local traces/media/logs: `*.trace`, `*.har`, `*.webm`, `*.log`
    - dependency/temp/build outputs: `node_modules/`, `.cache/`, `.tmp_vendor/`, `dist/`, `build/`
- `git check-ignore -v`로 위 대표 경로들이 실제 규칙에 매칭되는 것을 확인했습니다.
- `git clean -ndX` 결과 현재 ignored cleanup 후보는 `.tmp_vendor/`, `node_modules/`뿐이었습니다.
- `.github/workflows/data-freshness.yml`은 운영 workflow이므로 ignore 대상이 아니며 이번 변경에 포함합니다.

## 검증 결과

| 명령 | 결과 | 핵심 내용 |
| --- | --- | --- |
| `npm run sync:pension720` | 통과 | Pension720+ latest `316` 반영 |
| `npm run sync:lotto` | 통과 | Lotto `winning_stats.json`은 이미 1224회차 기준 완료 |
| `npm run sync:sw-manifest` | 통과 | app shell `126`, data `2`; manifest asset 목록 추가 diff 없음 |
| `npm run lint` | 통과 | ESLint 검증 완료 |
| `npm run check:data-freshness:strict` | 통과 | Lotto static latest `1224`, estimated `1224`, behind `0` |
| `npm run check:lotto:official` | 통과 | static/official latest `1224` 일치 |
| `npm run check:pension720` | 통과 | static count `316`, latest `316` 확인 |
| `npm run check:pension720:freshness` | 통과 | static/official latest `316` 일치 |
| `node scripts/smoke/smoke.mjs` | 통과 | 신규 PWA data network-first 회귀 포함 smoke 전체 통과 |
| `npm run build` | 통과 | lint, freshness, Pension720 check, smoke 포함 통과 |
| `npm run build:release` | 통과 | build, strict freshness, official Lotto check 통과 |
| `npm run test:sync-live:browser:official` | 통과 | browser canary에서 Pension720 official source/full availability 확인 |
| `npm run build:release:browser` | 통과 | release gate 이후 official browser canary 통합 실행 통과 |
| `git check-ignore -v ...` | 통과 | 대표 local 산출물 ignore 규칙 매칭 확인 |
| `git clean -ndX` | 확인 | 현재 ignored cleanup 후보는 `.tmp_vendor/`, `node_modules/` |
| `git diff --check` | 통과 | whitespace error 없음; 기존 CRLF 변환 warning만 표시 |
| `git status --short` | 확인 | `2026-05-20` 보고서 삭제 상태 유지, `2026-05-22` 보고서와 workflow 추가 |

## 남은 운영 리스크

- official endpoint 의존 검증은 네트워크나 동행복권 endpoint 장애 시 실패할 수 있습니다. 실패 시 데이터 불일치와 일시 장애를 분리해 봐야 합니다.
- scheduled check는 stale data를 자동으로 고치지 않고 실패로 알려주는 정책입니다. 데이터 갱신은 별도 수동 작업 또는 후속 Auto PR workflow가 필요합니다.
- PWA data request는 network-first로 바뀌었지만, 완전 오프라인 환경은 기존 cached data 품질에 의존합니다.
