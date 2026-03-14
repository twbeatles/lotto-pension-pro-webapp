# 로또 웹앱 구조 재분석 (2026-03-14)

## 1) 범위

- 대상: `lotto---webapp`
- 목적: 최신 코드 기준 구조, 모듈 역할, 데이터 흐름, 운영 규칙 재정리
- 포함: 전략 엔진, 워커, 동기화 경로, 서비스워커, 데이터 관리 UX, 정적 검증 도구

## 2) 현재 구조 요약

- 형태: 빌드 없는 단일 페이지 앱(HTML + CSS + Vanilla JS ES Modules)
- 진입 흐름: `index.html` -> `assets/modules/index.js` -> `assets/modules/core/LottoApp.js`
- 개발 도구: `package.json` 기반 ESLint/Prettier, 배포 번들링 단계는 없음
- 핵심 계층:
  - 앱 조율: `assets/modules/core/LottoApp.js`
  - 상태/저장/동기화: `assets/modules/core/DataManager.js`
  - UI 보조: `assets/modules/core/UIManager.js`
  - 전략 코어: `StrategyCatalog.js`, `StrategyEngine.js`, `StrategyFilters.js`, `MonteCarlo.js`
  - 기능 모듈: `assets/modules/features/*.js`
  - 워커: `assets/strategy.worker.js`, `assets/backtest.worker.js`
  - 오프라인/PWA: `sw.js`

## 3) 디렉터리 핵심

- `index.html`: 단일 페이지 구조, 데이터 탭 UI, 서비스워커 등록/업데이트 토스트
- `assets/app.css`: 전역 스타일, 데이터 탭 검색/페이지네이션/상태 카드 스타일
- `assets/modules/core`
  - `LottoApp.js`: 초기화, 라우팅, 전역 이벤트, 데이터 탭 렌더링
  - `DataManager.js`: 상태, localStorage, 동기화, 티켓 정산, 최신성 계산
  - `StrategyCatalog.js`, `StrategyEngine.js`, `StrategyFilters.js`: 전략 메타/계산/필터
  - `StrategyWorkerClient.js`: 생성/추천 워커 래퍼
- `assets/modules/features`
  - `Generator.js`, `Ai.js`, `Backtest.js`, `Stats.js`, `Check.js`, `DataIO.js`, `QrScanner.js`
- `assets/modules/utils/strategyPresets.js`: 전략 프리셋 공통 컨트롤러
- `assets/vendor/`: same-origin 런타임 vendor 자산
- `data/winning_stats.json`: 정적 당첨 이력
- `proxy/worker.js`: 선택형 최신 회차 프록시 예시

## 4) 실행 흐름

1. 앱 초기화

- `LottoApp.init()`에서 `data.load()` 수행
- 테마 적용 후 Generator eager 생성
- 초기 라우트 렌더 후 `fetchWinningStats()`로 정적 JSON + 로컬 업데이트 병합
- 유휴 시점에는 프록시가 설정된 경우에만 `fetchLatestFromAPI({ silent: true, trigger: 'idle' })` 실행
- `pagehide`, `visibilitychange(hidden)`에서 `save(true)`로 즉시 flush

2. 라우팅/모듈 로딩

- `route(target)`에서 섹션 활성화 + 필요한 기능 모듈 지연 로딩
- `pendingModulePromises`로 중복 import 방지
- `routeToken`으로 stale async 결과 무시

3. 데이터 탭 렌더링

- 즐겨찾기/히스토리/티켓/캠페인을 각각 검색 + 페이지네이션으로 렌더
- 페이지 크기: `20`
- 저장 상태 요약, 동기화 메타, 시스템 알림 권한 상태를 함께 노출

## 5) 전략 엔진 확장 지점

- 전략 메타/등급 정책: `StrategyCatalog.js`
- 공통 필터 체인: `StrategyFilters.js`
- 계산 엔진: `StrategyEngine.js`
  - `normalizeRequest()`
  - `generateSet()`, `generateMultipleSets()`
  - `simulateWeights()`, `recommendFromSimulation()`
- 현재 정책:
  - 엄격 필터 모드
  - 필터 미충족 시 무필터 랜덤 세트로 보완하지 않음

## 6) 상태 모델 및 저장

`DataManager.state` 주요 필드:

- `theme`, `favorites`, `history`
- `winningStats`, `staticLatestDrawNo`, `analytics`
- `generated`, `aiResults`
- `strategyPrefs`, `strategyPresets`
- `ticketBook`, `campaigns`, `alertPrefs`
- `customProxy`, `syncMeta`

주요 localStorage 키:

- `lotto_pro_fav_v2`
- `lotto_pro_hist_v2`
- `lotto_pro_settings_v2`
- `lotto_pro_ticketbook_v1`
- `lotto_pro_campaigns_v1`
- `lotto_pro_alerts_v1`
- `lotto_pro_strategy_presets_v1`
- `lotto_pro_sync_meta_v1`
- `lotto_pro_updates_v2`
- 레거시 프록시: `lotto_webapp_settings_v1.proxyLatestUrl`

운영 규칙:

- 즐겨찾기/티켓/캠페인/알림/전략 프리셋 CRUD는 즉시 저장
- 프록시 URL 입력처럼 잦은 입력은 debounce 저장 유지
- 백업 스키마는 그대로 유지하고 `syncMeta`는 백업 대상에 포함하지 않음

## 7) 동기화/프록시 정책

`fetchWinningStats()`:

- `data/winning_stats.json` 로드
- `lotto_pro_updates_v2` 병합
- `draw_no` 기준 dedupe
- `staticLatestDrawNo`와 최신성 계산 기반 상태 갱신
- 티켓 자동 정산

`fetchLatestFromAPI()`:

- 추정 최신 회차: `estimateLatestDrawKST()`
- in-flight 단일 실행 가드
- 수동 동기화(`manual`)만 취소 가능
- 프록시 미설정 시 네트워크 호출 없이 종료하고 안내 메시지만 표시
- 프록시 설정 시 `/proxy/range` 우선, 누락분은 사용자 프록시로 단건 조회
- 성공/실패/모드/소스는 `lotto_pro_sync_meta_v1`에 기록

프록시 해석 우선순위:

1. URL 파라미터 `proxyUrl` / `proxy`
2. v1 레거시 저장 키
3. v2 설정(`customProxy`)
4. 그 외는 정적 JSON 전용 모드

## 8) 워커 메시지 계약

- `strategy.worker.js`
  - 요청: `WARMUP`, `GENERATE`, `RECOMMEND`
  - 응답: `READY`, `DONE`, `ERROR`
- `backtest.worker.js`
  - 요청: `START`
  - 응답: `PROGRESS`, `WINS`, `DONE`, `ERROR`
  - `WINS` payload: `matchedCount`, `bonusHit`, `hitText` 포함

## 9) 서비스워커/오프라인

- 캐시 버전: `v10`
- 앱 셸: precache + stale-while-revalidate
- 데이터 JSON: network-first + timeout
- 런타임 vendor 자산은 `assets/vendor/` same-origin 경로 사용
- 첫 설치에서는 `controllerchange`로 자동 reload 하지 않음
- 사용자가 업데이트 토스트에서 `skipWaiting`을 수락한 경우에만 reload

## 10) 데이터 관리 UX 요약

- 리스트: 즐겨찾기, 히스토리, 티켓, 캠페인
- 기능:
  - 검색
  - 페이지네이션
  - 티켓 상태 필터
  - 저장 상태 요약
  - 동기화 메타 카드
  - 시스템 알림 권한 배지/테스트 버튼
- 장기 사용 정책:
  - 자동 삭제 없음
  - 경고 + 백업/수동 정리 유도

## 11) 검증 도구

기본 루틴:

```bash
npm install
npm run lint
node scripts/smoke/smoke.mjs
```

추가 성능 점검:

```bash
node scripts/perf/bench.mjs
```

현재 `smoke`에는 아래 유형의 회귀가 포함됩니다.

- 전략/필터/정규화
- 캠페인/티켓 cascade 및 dedupe
- 동기화 가드/프록시 옵트인/최신 카드 갱신
- 저장 flush
- 알림 권한 토글
- 데이터 탭 페이지네이션
- 서비스워커 reload 정책

## 12) 데이터 관측(정적 파일 기준)

- `data/winning_stats.json`
  - 최신 회차: `1209`
  - 총 데이터 수: `1208`
  - 누락 회차: `146`

## 13) 후속 관심사

- 실제 브라우저/배포 환경에서 서비스워커 업데이트 UX 수동 확인
- 장기 사용 시 localStorage 사용량 경고 기준 보정
- `package.json`에 `"type": "module"` 도입 여부 검토
