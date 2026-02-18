# Lotto WebApp 프로젝트 구조 재분석 (2026-02-18)

## 1) 범위
- 대상: `lotto - webapp`
- 목적: 최신 코드 기준 구조/모듈/데이터 흐름 재정리
- 포함: 공통 전략 엔진(`StrategyCatalog/Engine/Filters`) 도입 이후 아키텍처

## 2) 현재 아키텍처 요약
- 형태: 빌드 없는 SPA (Vanilla JS + ES Modules)
- 엔트리: `index.html` -> `assets/modules/index.js` -> `assets/modules/core/LottoApp.js`
- 핵심 계층
  - 앱 오케스트레이션: `assets/modules/core/LottoApp.js`
  - 상태/동기화: `assets/modules/core/DataManager.js`
  - UI 유틸: `assets/modules/core/UIManager.js`
  - 전략 코어: `assets/modules/core/StrategyCatalog.js`, `assets/modules/core/StrategyEngine.js`, `assets/modules/core/StrategyFilters.js`
  - 계산 헬퍼: `assets/modules/core/MonteCarlo.js`
  - 기능 모듈: `assets/modules/features/*.js`
  - 백테스트 워커: `assets/backtest.worker.js`
  - 오프라인: `sw.js`

## 3) 디렉터리 구조 (핵심)
- `index.html`: 단일 페이지 UI/라우팅 대상 섹션
- `assets/app.css`: 전역 스타일 + 전략 패널 UI 스타일
- `assets/modules/core`
  - `LottoApp.js`: 라우트/모듈 지연 로딩/전역 이벤트
  - `DataManager.js`: 로컬 상태, 프록시 동기화, analytics 캐시
  - `UIManager.js`: 토스트, 번호 렌더, QR, 이미지 저장
  - `StrategyCatalog.js`: 전략 메타/등급/기본 파라미터
  - `StrategyFilters.js`: 공통 필터 체인(합계/AC/홀짝/고저/연번/끝수)
  - `StrategyEngine.js`: 전략 요청 정규화, 가중치 계산, 세트 생성, 시뮬레이션
  - `MonteCarlo.js`: 샘플링/통계 헬퍼(전략 조합 책임은 엔진으로 이관)
- `assets/modules/features`
  - `Generator.js`: 생성 탭, 전략 요청 객체 기반 세트 생성
  - `Ai.js`: AI 탭, 전략 시뮬레이션 + 추천 세트 생성
  - `Backtest.js`: 워커 기반 백테스트, 확장 메시지 계약 사용
  - `Stats.js`, `Check.js`, `DataIO.js`, `QrScanner.js`
- `assets/backtest.worker.js`: 공통 전략 엔진으로 회차별 티켓 생성/검증
- `data/winning_stats.json`: 당첨 이력 정적 데이터
- `proxy/worker.js`: 프록시 API 래퍼

## 4) 런타임 흐름
1. 앱 초기화
- `LottoApp.init()`에서 `DataManager.load()` -> 테마 적용 -> 기본 모듈 생성 -> 초기 라우트 렌더
- 이후 `fetchWinningStats()`로 정적 JSON + 로컬 업데이트 병합
- idle 시점 `fetchLatestFromAPI({ silent: true })` 실행

2. 라우팅/모듈 로딩
- `route(target)`에서 섹션 활성화 + 지연 모듈 `ensureModule()`
- `pendingModulePromises`로 중복 import 방지
- `routeToken`으로 stale 비동기 완료 보호

3. 전략 공통 흐름
- UI에서 전략 요청 객체 생성:
  - `strategyId`, `params`, `filters`
- 모듈(`Generator/Ai/Backtest`)은 동일 형식 요청을 `StrategyEngine`에 전달
- `StrategyEngine.normalizeRequest()`가
  - legacy alias 매핑
  - 파라미터 상한(시뮬레이션 1k~20k)
  - 필터 정규화
  를 수행

## 5) 전략 엔진 확장 포인트
- 전략 메타/등급 정책: `StrategyCatalog.js`
  - 기본 탑재 + 실험 전략 분리
  - legacy 값(`ensemble/statistical/balance/cold/hot/random`) 하위호환 매핑
- 필터 체인: `StrategyFilters.js`
  - `passesFilters()` 단일 진입으로 화면/워커 공통 검증
- 계산 엔진: `StrategyEngine.js`
  - `computeWeights()`: 전략별 신호 결합
  - `generateSet()`, `generateMultipleSets()`
  - `simulateWeights()`, `recommendFromSimulation()`

## 6) 상태 모델 및 저장
- `DataManager.state` 주요 필드
  - `winningStats`, `analytics`, `favorites`, `history`, `generated`, `aiResults`
  - `strategyPrefs`
    - `generator`, `ai`, `backtest` 별 전략 요청 기본값 저장
- `lotto_pro_settings_v2`에 `strategyPrefs` 확장 저장
- 기존 `theme`, `customProxy` 저장 로직 유지

## 7) 백테스트 워커 계약 (확장)
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

## 8) UI 구조 변경 요약
- `index.html`
  - Generator/AI/Backtest 모두 전략 프리셋 select + 상세 필터 패널 추가
  - 실험 전략 표시 토글(`*ShowExperimental`) 추가
  - 기존 `aiModelSelect`, `btStrategy` ID 유지(하위호환)
- `assets/app.css`
  - `strategy-panel`, `strategy-advanced-grid`, `range-inputs` 등 전략 UI 전용 스타일 추가
  - 모바일 구간 1열 레이아웃 강제

## 9) 성능/호환성 포인트
- 시뮬레이션 기본값 5,000회, 상한 20,000회
- 워커 진행률 메시지 간격 단축(5회차 단위) + ETA 제공
- 동일 전략 요청 객체를 메인/워커가 공유해 규칙 불일치 리스크 축소
- 기존 레거시 전략 값은 alias로 유지

## 10) 데이터 품질 관측
- `data/winning_stats.json` 관측값
  - 범위: 1 ~ 1209
  - 총 1208개
  - 누락 회차: 146

## 11) 리스크 및 후속 권장
- 필터를 과도하게 좁히면 유효 조합이 부족해 fallback 비중이 증가할 수 있음
- 전략 품질 평가는 확률적이며 당첨 보장과 무관함
- 권장 후속
  - 전략별 백테스트 벤치 리포트 자동 생성
  - `strategyPrefs` 마이그레이션 버전 태그 도입
  - 전략별 결과 분포 통계(합계/AC/홀짝) 시각화 카드 추가
