# 로또 웹앱 구조 재분석 (2026-02-18)

## 1) 범위
- 대상: `lotto-webapp`
- 목적: 최신 코드 기준으로 구조, 모듈 역할, 데이터 흐름 재정리
- 포함: 공통 전략 엔진(`StrategyCatalog/StrategyEngine/StrategyFilters`) 도입 이후 구조

## 2) 현재 구조 요약
- 형태: 빌드 없는 단일 페이지 앱(바닐라 자바스크립트 + ES 모듈)
- 진입 흐름: `index.html` → `assets/modules/index.js` → `assets/modules/core/LottoApp.js`
- 핵심 계층:
  - 앱 조율: `assets/modules/core/LottoApp.js`
  - 상태/동기화: `assets/modules/core/DataManager.js`
  - 화면 유틸: `assets/modules/core/UIManager.js`
  - 전략 코어: `assets/modules/core/StrategyCatalog.js`, `assets/modules/core/StrategyEngine.js`, `assets/modules/core/StrategyFilters.js`
  - 계산 보조: `assets/modules/core/MonteCarlo.js`
  - 기능 모듈: `assets/modules/features/*.js`
  - 시뮬레이션 워커: `assets/backtest.worker.js`
  - 오프라인 지원: `sw.js`

## 3) 디렉터리 핵심
- `index.html`: 단일 페이지 화면 구성 및 라우팅 대상 섹션
- `assets/app.css`: 전역 스타일 + 전략 패널 스타일
- `assets/modules/core`
  - `LottoApp.js`: 라우팅, 모듈 지연 로딩, 전역 이벤트
  - `DataManager.js`: 로컬 상태, 프록시 동기화, 분석 캐시
  - `UIManager.js`: 토스트, 번호 렌더링, 큐알, 이미지 저장
  - `StrategyCatalog.js`: 전략 메타 정보, 등급, 기본 파라미터
  - `StrategyFilters.js`: 공통 필터 체인(합계/복잡도/홀짝/고저/연속쌍/끝수)
  - `StrategyEngine.js`: 전략 요청 정규화, 가중치 계산, 세트 생성, 시뮬레이션
  - `MonteCarlo.js`: 샘플링/통계 보조
- `assets/modules/features`
  - `Generator.js`: 생성 탭, 전략 요청 기반 번호 생성
  - `Ai.js`: 예측 탭, 전략 시뮬레이션 기반 추천
  - `Backtest.js`: 워커 기반 과거 검증
  - `Stats.js`, `Check.js`, `DataIO.js`, `QrScanner.js`
- `assets/backtest.worker.js`: 공통 전략 엔진으로 회차별 티켓 생성/검증
- `data/winning_stats.json`: 당첨 이력 정적 데이터
- `proxy/worker.js`: 프록시 API 래퍼

## 4) 실행 흐름
1. 앱 초기화
- `LottoApp.init()`에서 `DataManager.load()` 실행
- 테마 적용 후 기본 모듈 생성 및 초기 라우트 렌더
- `fetchWinningStats()`로 정적 데이터 + 로컬 업데이트 병합
- 유휴 시점에 `fetchLatestFromAPI({ silent: true })` 백그라운드 동기화

2. 라우팅/모듈 로딩
- `route(target)`에서 화면 섹션 활성화 및 지연 모듈 로딩
- `pendingModulePromises`로 중복 불러오기 방지
- `routeToken`으로 오래된 비동기 완료를 무시

3. 전략 공통 처리
- 화면에서 전략 요청 객체 생성: `strategyId`, `params`, `filters`
- `Generator/Ai/Backtest` 모두 같은 형식으로 `StrategyEngine` 호출
- `StrategyEngine.normalizeRequest()`가
  - 이전 전략 별칭 매핑
  - 파라미터 범위 보정(시뮬레이션 1,000~20,000)
  - 필터 정규화
  를 수행

## 5) 전략 엔진 확장 지점
- 전략 메타/등급 정책: `StrategyCatalog.js`
  - 기본 전략 + 실험 전략 분리
  - 이전 전략 값(`ensemble/statistical/balance/cold/hot/random`) 하위호환
- 필터 체인: `StrategyFilters.js`
  - `passesFilters()` 단일 진입으로 화면/워커 공통 검증
- 계산 엔진: `StrategyEngine.js`
  - `computeWeights()`: 전략별 신호 결합
  - `generateSet()`, `generateMultipleSets()`
  - `simulateWeights()`, `recommendFromSimulation()`

## 6) 상태 모델 및 저장
- `DataManager.state` 주요 필드:
  - `winningStats`, `analytics`, `favorites`, `history`, `generated`, `aiResults`
  - `strategyPrefs` (`generator`, `ai`, `backtest` 별 기본 전략 요청 저장)
- `lotto_pro_settings_v2`에 `strategyPrefs` 확장 저장
- `theme`, `customProxy` 저장 로직 유지

## 7) 시뮬레이션 워커 메시지 계약
- 요청
```js
START.payload = { statsData, startDraw, endDraw, qty, strategyRequest }
```
- 진행
```js
PROGRESS.payload = { summary, processedDraws, totalDraws, etaMs, strategyId }
```
- 완료
```js
DONE.payload = { summary, diagnostics }
```
- 오류
```js
ERROR.payload = { code, message, strategyId }
```

## 8) 화면 구조 변경 요약
- `index.html`
  - 생성/예측/시뮬레이션 탭 모두 전략 선택 + 상세 필터 패널 제공
  - 실험 전략 표시 토글(`*ShowExperimental`) 추가
  - 기존 `aiModelSelect`, `btStrategy` 식별자는 유지(하위호환)
- `assets/app.css`
  - `strategy-panel`, `strategy-advanced-grid`, `range-inputs` 등 전략 전용 스타일 추가
  - 모바일 구간 1열 레이아웃 강화

## 9) 성능/호환 포인트
- 시뮬레이션 기본값 5,000, 상한 20,000
- 워커 진행 메시지 주기 단축 + 예상 남은 시간 제공
- 메인/워커가 동일 전략 요청 객체를 사용해 규칙 불일치 위험 감소
- 이전 전략 값은 별칭으로 유지

## 10) 데이터 관측
- `data/winning_stats.json` 기준
  - 범위: 1 ~ 1209
  - 총 1208개
  - 누락 회차: 146

## 11) 위험 요소 및 권장 후속
- 필터를 과도하게 좁히면 유효 조합이 부족해 보완 랜덤 비중이 커질 수 있음
- 전략 품질은 확률 기반이며 당첨 보장과 무관함
- 권장 후속:
  - 전략별 시뮬레이션 보고서 자동 생성
  - `strategyPrefs` 마이그레이션 버전 태그 도입
  - 전략별 결과 분포(합계/복잡도/홀짝) 시각화 카드 추가
