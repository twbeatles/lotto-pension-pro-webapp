# gemini.md

## 문서 목적
이 문서는 `lotto---webapp` 저장소에서 Gemini 계열 AI가 다음 세션에서도 일관되게 작업하도록 돕는 실무 가이드입니다.
핵심은 "컨텍스트 복원, 영향 범위 통제, 검증 중심 작업"입니다.

- 기준일: 2026-02-28
- 정적 데이터 최신 회차: `1209` (`2026-01-31`)
- 데이터 파일: `data/winning_stats.json` (1208개, 누락 회차 `146`)

---

## 1) 프로젝트 요약

- 형태: 빌드 없는 단일 페이지 웹앱
- 핵심 스택: HTML + CSS + Vanilla JS(ESM)
- 엔트리: `index.html` → `assets/modules/index.js`
- 주요 탭:
  - 생성(`gen`)
  - 통계(`stats`)
  - AI 예측(`ai`)
  - 백테스트(`bt`)
  - 당첨확인(`check`)
  - 데이터(`data`)
- 오프라인 지원: `sw.js`
- 데이터 원천:
  - 정적: `data/winning_stats.json`
  - 동적 누적: `localStorage.lotto_pro_updates_v2`

중요:
- `package.json` 없음
- 번들러/트랜스파일 단계 없음

---

## 2) 세션 시작 체크리스트 (Gemini용)

1. 필수 문서 읽기
- `README.md`
- `PROJECT_ANALYSIS.md`
- `gemini.md` (이 문서)

2. 빠른 실행
```bash
python -m http.server 5173
```
- `http://localhost:5173/` 접속

3. 범위 고정
- 이번 작업이 영향을 주는 모듈을 먼저 명시
- `core`/`worker`/`storage` 변경 여부를 먼저 구분

4. 검증 계획 선제 수립
- 수정 전에 수동 테스트 시나리오를 최소 3개 정의

---

## 3) 핵심 파일 지도

- `index.html`: 전체 페이지 구조 + 서비스워커 등록
- `assets/app.css`: 스타일
- `assets/modules/core/`
  - `LottoApp.js`: 초기화/라우팅/lazy import
  - `DataManager.js`: 상태/동기화/저장/티켓정산
  - `StrategyCatalog.js`: 전략 목록/기본 요청
  - `StrategyEngine.js`: 전략 연산/세트 생성/시뮬
  - `StrategyFilters.js`: 필터 정규화 및 판정
  - `StrategyWorkerClient.js`: 워커 RPC
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
- `strategyPresets`
- `strategyPrefs` (`generator`, `ai`, `backtest`)
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
- 키 이름을 바꿀 때는 마이그레이션 코드를 함께 작성
- `load()` 정규화/호환 로직을 먼저 확인하고 수정

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

### 핵심 포인트
- `StrategyCatalog`가 기본 전략/별칭 제공
- `StrategyEngine.normalizeRequest()`에서 범위 보정
- `Generator`, `Ai`, `Backtest`는 동일 스키마 사용

주의:
- 필터를 너무 좁히면 fallback 랜덤 생성 비중이 커짐

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
- 동기화 프로파일 적용:
  - `idle`: silent + 토스트/권한 요청 없음
  - `manual/refresh`: 로그/토스트 표시
- `/proxy/range` 우선
- 누락 회차는 fallback 단건 조회(내부 프록시 우선, 외부 CORS는 최후순위)

### 프록시 우선순위
1. URL 파라미터 `proxyUrl/proxy`
2. v1 레거시
3. v2 설정(`customProxy`)
4. 공용 fallback

---

## 7) 워커 메시지 계약

### `strategy.worker.js`
요청:
- `WARMUP`, `GENERATE`, `RECOMMEND`

응답:
- `READY`, `DONE`, `ERROR`

### `backtest.worker.js`
요청:
- `START.payload = { statsData, startDraw, endDraw, qty, payoutMode, strategyRequests | strategyRequest | strategy }`

응답:
- `PROGRESS`, `WINS`, `DONE`, `ERROR`

실무 규칙:
- payload 필드명 변경 시 메인/워커 양쪽을 동일 커밋에서 수정
- 메시지 타입 문자열 하드코딩 오타 주의

---

## 8) PWA/캐시 규칙

`sw.js`:
- 캐시 버전: `v6`
- 데이터 요청: network-first
- 앱 셸: stale-while-revalidate
- precache 목록: 수동 배열(`APP_SHELL_ASSETS`)

변경 규칙:
- 핵심 파일 추가/이동 시 `APP_SHELL_ASSETS` 반영
- 캐시 불일치 이슈가 예상되면 `CACHE_VERSION` 증가

---

## 9) 외부 스크립트 의존

런타임 CDN 로드(`loader.js`):
- QR 코드 생성: `qrcode`
- QR 스캔: `html5-qrcode`
- 결과 이미지 저장: `html2canvas`

주의:
- 첫 오프라인 진입에서는 외부 라이브러리 기능 제한 가능
- 실패 시 UX fallback 유지

---

## 10) 작업 시 실수 많은 지점

1. 전략 스키마 일부만 수정
- 결과: 생성/AI/백테스트 중 일부만 깨짐

2. 로컬 저장 키 임의 변경
- 결과: 기존 사용자 데이터 로드 실패

3. 워커 계약 불일치
- 결과: 버튼 무반응 또는 에러 누락

4. 서비스워커 precache 누락
- 결과: 오프라인/업데이트 후 구버전 로드

5. 대량 생성 성능 미검증
- 결과: 모바일 프리징

---

## 11) 검증 루틴 (최소)

수정 후 최소 확인:

1. 생성 탭
- 전략 선택 + 번호 생성 + 티켓북 저장

2. AI 탭
- 추천 실행 + 결과 카드 렌더 + 티켓 저장

3. 백테스트 탭
- 단일 전략 실행
- 비교 모드(2개 이상) 실행
- 상금 모드(`hybrid_dynamic_first`/`fast_fixed`) 전환 확인
- 실행 중 `중지` 버튼 동작 확인
- CSV 내보내기

4. 데이터 탭
- v3 백업 내보내기(`localUpdates`, `strategyPresets` 포함)
- v1/v2/v3 가져오기(병합/덮어쓰기)

5. 동기화
- `syncDataBtn` 동작
- 프록시 URL 우선순위 확인

6. PWA
- 새로고침/오프라인 상태에서 기본 기능 확인

---

## 12) Gemini 프롬프트 템플릿

### A. 기능 수정 요청 템플릿
```text
1) gemini.md와 README.md를 읽고 관련 모듈 영향 범위를 먼저 정리해.
2) 이번 변경에서 수정할 파일만 선별해 최소 수정으로 구현해.
3) 워커 계약/저장소 키/서비스워커 영향 여부를 명시해.
4) 수정 후 수동 검증 결과와 남은 리스크를 정리해.
```

### B. 버그 수정 요청 템플릿
```text
증상 재현 경로를 먼저 적고,
원인 후보를 2개 이상 제시한 뒤,
가장 작은 수정으로 패치하고,
회귀 테스트 포인트를 체크리스트로 남겨줘.
```

---

## 13) 세션 종료 메모 포맷

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

---

## 14) 현재 작업 우선순위 참고

`FEATURE_SUGGESTIONS.md` 기준 후보:
- 클라우드 동기화
- 당첨 자동 알림 고도화
- 고급 시각화 대시보드

권장 순서:
1. 스키마 영향 적은 UI/분석 고도화
2. 이후 동기화/계정 기능 확장

---

이 문서는 Gemini 세션에서 "반복되는 맥락 설명 비용"을 줄이는 용도입니다.
구조/키/계약이 바뀌면 즉시 업데이트하세요.

---

## 15) 2026-02-28 A+B 반영 요약

- 동기화 정책 프로파일 도입(`idle` 조용한 경로, `manual/refresh` 안내 경로)
- 동기화 코드 로그 추가(`SYNC_RANGE_FAIL`, `SYNC_FALLBACK_EXTERNAL`, `SYNC_FETCH_ONE_FAIL`)
- 백테스트 상금 모드 도입(`payoutMode`)
- 백테스트 실행 중 취소 UX(`중지` 버튼 + worker terminate)
- 전략 워커 동적 타임아웃/1회 재시도/최종 코드 에러(`WORKER_TIMEOUT_FINAL`)
- 백업 v3 확장(`localUpdates`, `strategyPresets`) 및 import 요약 제공
- 자동 스모크 스크립트 추가: `node scripts/smoke/smoke.mjs`
