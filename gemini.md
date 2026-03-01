# gemini.md

## 문서 목적
이 문서는 `lotto---webapp` 저장소에서 Gemini 계열 AI가 다음 세션에도 일관되게 작업하도록 돕는 실무 가이드입니다.
핵심은 "컨텍스트 복원, 영향 범위 통제, 검증 중심 작업"입니다.

- 기준일: 2026-03-01
- 정적 데이터 최신 회차: `1209` (`data/winning_stats.json` 기준)
- 정적 데이터 개수: `1208`, 누락 회차: `146`

---

## 1) 프로젝트 요약
- 형태: 빌드 없는 단일 페이지 웹앱
- 핵심 스택: HTML + CSS + Vanilla JS(ESM)
- 엔트리: `index.html` -> `assets/modules/index.js`
- 배포 URL: `https://twbeatles.github.io/lotto---webapp/`
- 주요 탭: `gen`, `stats`, `ai`, `bt`, `check`, `data`
- 오프라인 지원: `sw.js` (`CACHE_VERSION: v7`)
- 데이터 원천:
  - 정적: `data/winning_stats.json`
  - 동적 누적: `localStorage.lotto_pro_updates_v2`

중요:
- `package.json` 없음
- 번들러/트랜스파일 단계 없음

---

## 2) 세션 시작 체크리스트

1. 문서 읽기
- `README.md`
- `PROJECT_ANALYSIS.md`
- `gemini.md`

2. 로컬 실행
```bash
python -m http.server 5173
```
- `http://localhost:5173/`

3. 기본 검증
```bash
node scripts/smoke/smoke.mjs
```

4. 성능 검증(선택)
```bash
node scripts/perf/bench.mjs
```

---

## 3) 핵심 파일 지도
- `index.html`: 전체 페이지 구조 + 서비스워커 등록
- `assets/app.css`: 스타일
- `assets/modules/core/`
  - `LottoApp.js`: 초기화/라우팅/lazy import
  - `DataManager.js`: 상태/동기화/저장/티켓 정산
  - `StrategyCatalog.js`, `StrategyEngine.js`, `StrategyFilters.js`
  - `StrategyWorkerClient.js`, `UIManager.js`, `MonteCarlo.js`
- `assets/modules/features/`
  - `Generator.js`, `Ai.js`, `Backtest.js`, `Stats.js`, `Check.js`, `DataIO.js`, `QrScanner.js`
- 워커:
  - `assets/strategy.worker.js`
  - `assets/backtest.worker.js`
- 프록시 예시:
  - `proxy/worker.js`

---

## 4) 데이터/저장소 규칙

### State 골격 (`DataManager.state`)
- `winningStats`, `analytics`
- `favorites`, `history`
- `ticketBook`, `campaigns`
- `strategyPresets`, `strategyPrefs`
- `alertPrefs`, `customProxy`, `theme`

### localStorage 키
- `lotto_pro_fav_v2`
- `lotto_pro_hist_v2`
- `lotto_pro_settings_v2`
- `lotto_pro_ticketbook_v1`
- `lotto_pro_campaigns_v1`
- `lotto_pro_alerts_v1`
- `lotto_pro_strategy_presets_v1`
- `lotto_pro_updates_v2`
- 레거시 프록시: `lotto_webapp_settings_v1.proxyLatestUrl`

원칙:
- 키 변경 시 마이그레이션 코드 동반
- `load()` 정규화/호환 로직 우선 확인

---

## 5) 전략 시스템 요약

### 표준 Strategy Request
```js
{
  strategyId,
  params: {
    simulationCount: 1000~20000,
    lookbackWindow: 5~120,
    wheelPoolSize,
    wheelGuarantee,
    seed,
    payoutMode: 'hybrid_dynamic_first' | 'fast_fixed'
  },
  filters: {
    oddEven,
    highLow,
    sumRange,
    acRange,
    maxConsecutivePairs,
    endDigitUniqueMin
  }
}
```

핵심:
- `StrategyCatalog`가 전략 메타/별칭 제공
- `StrategyEngine.normalizeRequest()`가 범위 보정
- `Generator`, `Ai`, `Backtest`가 동일 스키마 사용

---

## 6) 동기화/프록시 흐름

### 당첨 데이터 구성
`fetchWinningStats()`:
- 정적 JSON 로드
- `lotto_pro_updates_v2` 병합
- `draw_no` 기준 dedupe
- 최신순 정렬
- 티켓 미정산 자동 정산

### 최신 데이터 동기화
`fetchLatestFromAPI()`:
- `estimateLatestDrawKST()`로 최신 회차 추정
- 동기화 프로파일:
  - `idle`: silent
  - `manual/refresh`: 로그/토스트
- `/proxy/range` 우선
- 누락 회차는 단건 fallback 조회

### 프록시 우선순위
1. URL 파라미터 `proxyUrl/proxy`
2. v1 레거시
3. v2 설정(`customProxy`)
4. 공용 fallback

---

## 7) 워커 메시지 계약

### `strategy.worker.js`
요청: `WARMUP`, `GENERATE`, `RECOMMEND`

응답: `READY`, `DONE`, `ERROR`

### `backtest.worker.js`
요청: `START`

응답: `PROGRESS`, `WINS`, `DONE`, `ERROR`

---

## 8) PWA/캐시 규칙

`sw.js`:
- 캐시 버전: `v7`
- 데이터 요청: network-first
- 앱 셸: stale-while-revalidate
- precache 목록: `APP_SHELL_ASSETS`

변경 규칙:
- 핵심 파일 추가/이동 시 `APP_SHELL_ASSETS` 반영
- 캐시 불일치 이슈가 예상되면 `CACHE_VERSION` 증가

---

## 9) 2026-03-01 안정화 기록

- 증상: 화면은 로드되나 기능 동작 중단
- 원인: 모듈 문자열 리터럴 깨짐으로 ESM 파싱 실패
- 수정 파일:
  - `assets/modules/core/DataManager.js`
  - `assets/modules/features/Ai.js`
  - `assets/modules/features/Backtest.js`
  - `assets/modules/features/Generator.js`
- 추가 대응: 서비스워커 캐시 버전 `v7` 상향

## 9-1) 2026-03-01 인코딩 정리(2차)
- 증상: 일부 한국어 UI 문구가 깨진 글자(`理쒖떊`)로 표시됨.
- 조치: `DataManager/Generator/Backtest/Ai`에서 사용자 노출 문자열을 정리하고 탭별 실제 렌더로 검증.
- 배포 확인: 동일 증상 재발 시 SW 캐시 초기화 후 재검증.

---

## 10) 최소 검증 루틴

1. 생성 탭: 전략 선택 + 번호 생성 + 티켓 저장
2. AI 탭: 추천 실행 + 결과 렌더 + 티켓 저장
3. 백테스트 탭: 단일/비교 실행, 모드 전환, CSV 내보내기
4. 데이터 탭: v3 백업 내보내기/가져오기
5. 동기화: `syncDataBtn` 동작 및 프록시 우선순위 확인
6. PWA: 새로고침/오프라인 기본 기능 확인

---

## 11) 세션 종료 메모 포맷

```md
### Session Handoff (Gemini)
- 변경 파일:
- 변경 목적:
- 데이터 스키마 영향:
- 워커 계약 영향:
- 검증 완료 항목:
- 미해결 리스크:
- 다음 세션 우선 작업:
```
