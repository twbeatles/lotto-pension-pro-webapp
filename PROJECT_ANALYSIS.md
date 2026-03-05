# 로또 웹앱 구조 재분석 (2026-03-01)

## 1) 범위
- 대상: `lotto---webapp`
- 목적: 최신 코드 기준 구조, 모듈 역할, 데이터 흐름 재정리
- 포함: 전략 공통 엔진(`StrategyCatalog/StrategyEngine/StrategyFilters`), 워커, 동기화 경로

## 2) 현재 구조 요약
- 형태: 빌드 없는 단일 페이지 앱(바닐라 자바스크립트 + ES 모듈)
- 진입 흐름: `index.html` -> `assets/modules/index.js` -> `assets/modules/core/LottoApp.js`
- 핵심 계층:
  - 앱 조율: `LottoApp.js`
  - 상태/동기화: `DataManager.js`
  - UI 유틸: `UIManager.js`
  - 전략 코어: `StrategyCatalog.js`, `StrategyEngine.js`, `StrategyFilters.js`, `MonteCarlo.js`
  - 기능 모듈: `assets/modules/features/*.js`
  - 시뮬레이션 워커: `assets/backtest.worker.js`, `assets/strategy.worker.js`
  - 오프라인 지원: `sw.js`

## 3) 디렉터리 핵심
- `index.html`: 단일 페이지 화면 구성 및 라우팅 대상 섹션
- `assets/app.css`: 전역 스타일 + 전략 패널 스타일
- `assets/modules/core`
  - `LottoApp.js`: 라우팅, 지연 모듈 로딩, 전역 이벤트
  - `DataManager.js`: 로컬 상태, 동기화, 분석 캐시, 백업/복원 연동
  - `UIManager.js`: 토스트, 번호 렌더링, QR/이미지 보조
  - `StrategyCatalog.js`: 전략 메타 정보, 등급, 기본 파라미터
  - `StrategyFilters.js`: 공통 필터 체인(합계/복잡도/홀짝/고저/연속쌍/끝수)
  - `StrategyEngine.js`: 전략 요청 정규화, 가중치 계산, 세트 생성, 시뮬레이션
  - `MonteCarlo.js`: 샘플링/통계 보조
- `assets/modules/features`
  - `Generator.js`, `Ai.js`, `Backtest.js`, `Stats.js`, `Check.js`, `DataIO.js`, `QrScanner.js`
- `data/winning_stats.json`: 당첨 이력 정적 데이터
- `proxy/worker.js`: 프록시 API 래퍼

## 4) 실행 흐름
1. 앱 초기화
- `LottoApp.init()`에서 `DataManager.load()` 실행
- 테마 적용 후 기본 모듈 생성 및 초기 라우트 렌더
- `fetchWinningStats()`로 정적 데이터 + 로컬 업데이트 병합
- 유휴 시점 `fetchLatestFromAPI({ silent: true })` 백그라운드 동기화
- 동기화 중복 실행은 `syncInFlightPromise`로 방지, 수동 실행은 `cancelActiveSync()`로 취소 가능

2. 라우팅/모듈 로딩
- `route(target)`에서 화면 섹션 활성화 및 지연 모듈 로딩
- `pendingModulePromises`로 중복 import 방지
- `routeToken`으로 오래된 비동기 완료 무시

3. 전략 공통 처리
- 화면에서 전략 요청 객체 생성: `strategyId`, `params`, `filters`
- `Generator/Ai/Backtest` 모두 같은 형식으로 `StrategyEngine` 호출
- `StrategyEngine.normalizeRequest()`에서
  - 이전 전략 별칭 매핑
  - 파라미터 범위 보정(예: 시뮬레이션 1000~20000)
  - 필터 정규화 수행

## 5) 전략 엔진 확장 지점
- 전략 메타/등급 정책: `StrategyCatalog.js`
  - 기본 전략 + 실험 전략 분리
  - 이전 전략 값(`ensemble/statistical/balance/cold/hot/random`) 하위호환
- 필터 체인: `StrategyFilters.js`
  - `passesFilters()` 단일 진입으로 화면/워커 공통 검증
- 계산 엔진: `StrategyEngine.js`
  - `computeWeights()`
  - `generateSet()`, `generateMultipleSets()`
  - `simulateWeights()`, `recommendFromSimulation()`

## 6) 상태 모델 및 저장
- `DataManager.state` 주요 필드:
  - `winningStats`, `analytics`, `favorites`, `history`, `generated`, `aiResults`
  - `strategyPresets`, `strategyPrefs`
  - `ticketBook`, `campaigns`, `alertPrefs`, `customProxy`
- 설정 저장 키: `lotto_pro_settings_v2`
- 프리셋 저장 키: `lotto_pro_strategy_presets_v1`
- 로컬 업데이트 저장 키: `lotto_pro_updates_v2`

## 7) 워커 메시지 계약
- `strategy.worker.js`
  - 요청: `WARMUP`, `GENERATE`, `RECOMMEND`
  - 응답: `READY`, `DONE`, `ERROR`
- `backtest.worker.js`
  - 요청: `START`
  - 진행: `PROGRESS`
  - 중간 결과: `WINS` (`matchedCount`, `bonusHit`, `hitText` 포함)
  - 완료: `DONE`
  - 오류: `ERROR`

## 8) 화면 구조 요약
- `index.html`
  - 생성/예측/시뮬레이션 탭 모두 전략 선택 + 상세 필터 패널 제공
  - 실험 전략 표시 토글(`*ShowExperimental`) 제공
- `assets/app.css`
  - `strategy-panel`, `strategy-advanced-grid`, `range-inputs` 등 전략 전용 스타일
  - 모바일 1열 레이아웃 보강

## 9) 성능/호환 포인트
- 시뮬레이션 기본값 5000, 상한 20000
- 백테스트 범위 상한 300회차(`MAX_BACKTEST_SPAN`)
- 캠페인 상한: 52주, 주당 20세트, 총 500티켓
- 워커 진행 메시지와 ETA 기반 진행률 표시
- 메인/워커가 동일 전략 요청 객체를 사용해 규칙 불일치 위험 감소
- 서비스워커 캐시 버전: `sw.js`의 `CACHE_VERSION` (현재 `v9`)

## 10) 데이터 관측(정적 파일 기준)
- `data/winning_stats.json`
  - 범위: 1 ~ 1209
  - 총 1208개
  - 누락 회차: 146

## 11) 위험 요소 및 권장 후속
- 필터를 과도하게 좁히면 생성 수량이 요청보다 적게 반환될 수 있음(엄격 필터 모드)
- 전략 품질은 확률 기반이며 당첨 보장과 무관
- 권장 후속:
  - 전략별 시뮬레이션 보고서 자동 생성
  - `strategyPrefs` 마이그레이션 버전 태그 도입
  - 전략별 결과 분포(합계/복잡도/홀짝) 시각화 카드 추가

## 12) 2026-03-01 안정화 메모
- 증상: 페이지 렌더링은 되지만 기능이 동작하지 않음
- 원인: 일부 모듈 문자열 리터럴 인코딩 손상으로 ESM 파싱 오류 발생
- 조치:
  - `assets/modules/core/DataManager.js`
  - `assets/modules/features/Ai.js`
  - `assets/modules/features/Backtest.js`
  - `assets/modules/features/Generator.js`
  문자열 리터럴 복구
- 추가 조치: 캐시 잔존 대응을 위해 `sw.js` `CACHE_VERSION`을 `v8`로 상향

## 13) 2026-03-01 인코딩 정리 2차
- 증상: 화면은 동작하지만 일부 한국어 문구가 `理쒖떊` 형태로 깨져 보임.
- 범위: 메인 상태 영역, 생성/AI/백테스트 탭의 토스트/라벨/로그/접근성 문구.
- 조치:
  - `assets/modules/core/DataManager.js`
  - `assets/modules/features/Generator.js`
  - `assets/modules/features/Backtest.js`
  - `assets/modules/features/Ai.js`
  내 사용자 노출 문자열을 일괄 정규화.
- 검증: 로컬 스모크 + 실제 브라우저 탭 이동/생성/상태 텍스트 확인.

## 14) 2026-03-01 기능 품질 강화 3차
- 엄격 필터 모드:
  - `StrategyEngine`에서 필터 미충족 시 무필터 랜덤 세트로 보완하지 않음.
  - `Generator/Ai`는 요청 수량 대비 실제 생성 수량을 안내.
- 백테스트 투명성:
  - 워커 결과 요약에 `requestedTickets`, `generatedTickets`, `fillRate` 추가.
  - 무필터 랜덤 fallback 제거.
- 데이터 정합성:
  - 회차 정규화 시 `중복 번호`, `보너스 중복` 차단.
  - Import 이후 즉시 화면/통계 반영(`fetchWinningStats -> updateLatestWin -> refreshCurrentRoute -> renderDataLists`).
- 오프라인 캐시:
  - `APP_SHELL_ASSETS`에 `assets/modules/utils/backup.js` 반영.

## 15) 2026-03-05 통합 개선(리포트 1~9 + A~E)
- 제한 상수 중앙화:
  - `MAX_BACKTEST_SPAN=300`
  - `MAX_CAMPAIGN_WEEKS=52`
  - `MAX_CAMPAIGN_SETS_PER_WEEK=20`
  - `MAX_CAMPAIGN_TOTAL_TICKETS=500`
  - `MAX_SYNC_FALLBACK_DRAWS=120`
- 백테스트:
  - 메인/워커 양쪽 범위 검증
  - CSV 계약 정합화(`strategy_id`, `strategy_label`)
  - `WINS` payload에 적중 근거 필드 추가
- 동기화:
  - in-flight 단일 실행 가드
  - 수동 동기화 취소 버튼(`cancelSyncBtn`) 연동
  - fallback 단건 조회 상한 적용
- Import:
  - `merge/overwrite` + 설정 적용 체크 패널 도입
  - 기본 정책: Merge 미적용, Overwrite 적용
- QR:
  - 공식 host 화이트리스트 검증
  - 중복 번호 게임 거부
- 품질 보강:
  - 티켓 dedupe key stable stringify 적용
  - 스모크 회귀 추가: `campaign-limit`, `qr-validation`, `ticket-dedupe`, `sync-guard`
