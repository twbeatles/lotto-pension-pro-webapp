# 로또·연금복권 프로

동행복권 로또 6/45와 연금복권720+ 데이터를 한 곳에서 확인하고, 통계 기반 번호 생성/추천/저장/백업을 제공하는 정적 SPA입니다.

- 배포 주소: https://twbeatles.github.io/lotto-pension-pro-webapp/
- package/repository slug: `lotto-pension-pro-webapp`
- 기술 구성: static SPA, ES modules, service worker, localStorage/sessionStorage
- 모든 추천은 참고용이며 당첨을 보장하지 않습니다.

## 현재 기준

2026-05-19 기준 문서와 정적 데이터 기준입니다.

- Lotto 6/45 static data: `data/winning_stats.json`
    - latest draw: `1224`
    - rows: `1223`
    - allowed missing draw: `[146]`
- Pension720+ static data: `data/pension720_stats.json`
    - latest draw: `315`
    - latest date: `2026-05-14`
    - latest primary: `2조 537530`
    - latest bonus: `358127`
- Service worker cache version: `v26`

## 3분 사용법

1. **번호 생성:** `번호 생성하기`로 로또 6/45 조합을 만들고, 필요하면 고정수/제외수/연속수 제한을 조정합니다.
2. **번호 추천:** `번호 추천` 탭에서 추천 방식을 고르고 `추천 시작`을 누릅니다. 분석 강도는 처음이면 `기본`을 권장합니다.
3. **연금복권:** `연금복권` 탭에서 전용 전략, 조/자리 필터, 캠페인 옵션을 고르고 연금복권720+ 추천 번호를 만듭니다.
4. **저장:** 로또 6/45는 `내 번호 보관함`, 연금복권720+는 `저장한 연금복권 번호` 목록에 저장합니다.
5. **당첨 확인:** 저장한 로또 6/45 번호는 `당첨 확인`, 저장한 연금복권720+ 번호는 `연금복권` 탭에서 대상 회차 우선 또는 최신 참고 결과로 비교합니다.
6. **백업:** `데이터 관리`의 `전체 데이터 내보내기`로 저장 데이터를 백업합니다.

## 주요 기능

- 번호 생성:
    - 로또 6/45 스마트 생성, 고정수/제외수, 연속수 제한, QR 생성
    - 목표 회차 자동 추적과 캠페인 생성
    - 생성 결과를 즐겨찾기, 히스토리, 내 번호 보관함에 저장
- 번호 추천:
    - 다중 전략, 자동 전략 선택, 후보풀 리랭킹, 유사 조합 분산
    - 추천 근거 신호 표시: 빈도, 최근성, 공백, 페어, 추세, 회귀, 베이즈, 필터
    - 같은 번호 다시 만들기 코드와 분석 강도 프리셋 지원
- 연금복권720+:
    - 공식 연금복권720+ 결과 JSON과 정적 데이터 스냅샷 사용
    - 조별 빈도, 위치별 숫자 빈도, 최근 흐름 요약
    - 혼합 균형, 자리별 강세, 끝자리 적중형, 조 로테이션, 공백 반등, 보너스 흐름, 완전 랜덤 전략
    - 실험 전략으로 숫자 다양성, 연속 패턴 제공
    - 조 선택, 자리 고정/제외, 숫자 합계, 홀수/고숫자, 고유 숫자, 반복 제한 필터
    - 전략 프리셋 저장/불러오기와 시작 회차 기준 다회차 캠페인 생성
    - 같은 6자리의 확장 조 제안, 개별 저장, 확장 조 일괄 저장
    - 저장 번호 복사, CSV 내보내기, target 회차 우선 확인과 최신 회차 참고 비교
- 당첨 확인:
    - 저장된 로또 6/45 번호를 최신 당첨 데이터와 비교
    - 검색, 상태 필터, 키보드 이동, QR 스캔 흐름 지원
- 데이터 관리:
    - 즐겨찾기, 히스토리, 내 번호 보관함, 캠페인, 연금복권 저장 번호 관리
    - 백업 v5 내보내기/가져오기, import 미리보기, 중복 병합
    - 로또 6/45와 연금복권720+ 데이터 source, 최신 회차, 마지막 확인 시각 요약
    - `백업하고 정리하기`로 오래된 히스토리와 정산 끝난 미당첨 번호 정리
- PWA:
    - 홈 화면 설치, 오프라인 기본 자산 캐시, 업데이트 확인/적용
    - 멀티탭 저장소 동기화와 부분 복구 상태 표시

## 데이터와 저장소

- Lotto 6/45는 checked-in static JSON을 우선 사용하고, 런타임 동기화는 공식 API, custom `/proxy/latest`, fallback provider를 사용합니다.
- Pension720+는 공식 `selectPstPt720WnList.do` JSON을 확인합니다. 공식 데이터가 static보다 최신이면 정규화 후 `lotto_pro_pension720_stats_cache_v1`에 저장하고, 다음 로드나 오프라인 상황에서 official cache를 static보다 우선 사용할 수 있습니다.
- 앱 데이터는 localStorage에 저장되고, 기존 `lotto_pro_*` localStorage key는 사용자 데이터 호환성을 위해 유지합니다.
- localStorage 저장 실패가 발생하면 dirty 상태를 유지하고, 마지막 저장 실패 정보를 설정/상태 화면에 경고로 표시합니다.
- 백업 v5에는 즐겨찾기, 히스토리, 로또 티켓, 캠페인, 전략 프리셋, 로컬 업데이트, 연금복권 저장 번호와 연금복권 캠페인이 포함됩니다.
- v4 이하 백업은 계속 가져올 수 있으며, v4의 연금복권 저장 번호는 손실 없이 유지됩니다.
- 기본 백업 파일명 prefix는 `lotto_pension_pro_backup_v5`입니다.
- overwrite import 전 자동 백업 prefix는 `lotto_pension_pro_before_replace`, cleanup 전 자동 백업 prefix는 `lotto_pension_pro_before_cleanup`입니다.
- overwrite import와 cleanup은 자동 백업 다운로드를 시작한 뒤, 사용자가 백업 파일 저장을 확인해야 진행합니다.
- 연금복권720+ 저장 번호 CSV 파일명은 `lotto_pension_pro_pension720_tickets_<timestamp>.csv` 형식입니다.
- 연금복권720+와 시뮬레이션 CSV는 spreadsheet formula로 실행될 수 있는 `=`, `+`, `-`, `@` prefix를 안전하게 escape합니다.
- generated/AI/Pension720 임시 결과는 `lotto_pro_temp_results_state` sessionStorage에만 저장합니다. 이 데이터는 backup v5나 localStorage 영구 저장 대상에 포함하지 않습니다.

## PWA와 릴리스 정책

- `sw.js` cache version은 `v26`입니다.
- `strategy.worker.js`는 service worker cache와 별도로 `STRATEGY_WORKER_ASSET_VERSION` query를 사용하며, 현재 값은 `v21`입니다. worker 실행 계약이 바뀌면 이 값을 함께 올립니다.
- install precache에는 app shell과 `data/winning_stats.json`, `data/pension720_stats.json`이 포함됩니다.
- precache 실패 URL은 service worker가 `__cache-health.json` marker로 기록합니다. 설치는 계속 허용하고, 앱 설정/상태 화면에서 정상/주의 상태와 실패 개수를 표시합니다.
- 일반 `npm run build`는 Lotto static data가 예상 최신 회차보다 1회차 뒤처지는 상황까지 허용합니다.
- 배포 전 `npm run build:release`는 strict freshness를 적용하며, 최신 회차 차이가 0이 아니면 실패합니다.

Precache manifest가 바뀌면 다음 명령으로 생성 파일을 갱신합니다.

```bash
npm run sync:sw-manifest
```

## 개발 명령

```bash
npm install
npm run lint
npm run sync:lotto
npm run check:data-freshness
npm run check:data-freshness:strict
npm run check:pension720
npm run check:pension720:freshness
node scripts/smoke/smoke.mjs
npm run build
npm run build:release
```

데이터 동기화:

```bash
npm run sync:lotto
npm run sync:pension720
```

브라우저/PWA 검증:

```bash
npm run test:browser
npm run test:happy
npm run test:offline
npm run test:pwa-mobile
```

`test:browser`는 happy path, offline, PWA mobile 검증을 순서대로 실행하는 aggregate 명령입니다.
현재 happy path에는 로또 생성/확인, 번호 추천 반영, 백업 merge, Pension720+ 추천/저장/캠페인/확인/CSV 다운로드 플로우가 포함됩니다.

선택 검증:

```bash
npm run test:sync-live
npm run bench:ai
npm run bench:ai:full
npm run format:check
```

현재 `format:check`는 저장소 기존 포맷 기준의 영향을 받을 수 있으므로 코드 변경 검증은 `npm run build`와 변경 파일 범위 Prettier 확인을 우선합니다.

## 프로젝트 구조

```text
lotto-pension-pro-webapp/
├── assets/
│   ├── modules/
│   │   ├── core/
│   │   ├── features/
│   │   └── utils/
│   ├── styles/
│   ├── vendor/
│   └── sw-precache-manifest.js
├── data/
│   ├── pension720_stats.json
│   └── winning_stats.json
├── proxy/
├── scripts/
│   ├── fetch_pension720_stats.mjs
│   ├── sync_lotto_stats.mjs
│   ├── generate_sw_manifest.mjs
│   ├── smoke/
│   └── tests/
├── index.html
├── manifest.json
└── sw.js
```

## 운영 메모

- GitHub repository rename은 코드 변경과 별도 운영 작업입니다. rename 후 GitHub Pages source와 custom settings를 확인해야 합니다.
- app shell, manifest, service worker, data file, style, module을 변경한 뒤에는 `npm run sync:sw-manifest`를 실행합니다.
- 배포 전 기준 명령은 `npm run build:release`입니다.
- 브라우저 릴리스 체크에는 happy path, offline, PWA mobile 검증을 포함합니다.
- 유지 문서는 `README.md`, `claude.md`, `gemini.md`, `deploy_github_pages.md`, `proxy/README.md`입니다. 일회성 리뷰/감사 문서는 삭제될 수 있으며, 삭제된 문서는 사용자가 명시적으로 요청하지 않는 한 복원하지 않습니다.
- `FUNCTIONAL_IMPLEMENTATION_RISK_REVIEW_2026-05-19.md`는 이번 hardening 항목의 구현 결과와 검증 명령을 기록한 현재 repo-local 감사 문서입니다.
