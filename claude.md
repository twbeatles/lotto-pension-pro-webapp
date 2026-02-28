# claude.md

## 문서 목적
이 문서는 이 저장소(`lotto---webapp`)에서 Claude 계열 AI가 **다음 세션에도 바로 작업을 이어갈 수 있도록** 만든 운영 기준 문서입니다.
핵심은 "빠르게 맥락 복원 → 안전하게 수정 → 회귀 없이 검증"입니다.

- 기준일: 2026-02-28
- 정적 당첨 데이터 최신 회차: `1209` (`2026-01-31`)
- 데이터 파일: `data/winning_stats.json` (총 1208건, 누락 회차 `146`)

---

## 1) 프로젝트 한눈에 보기

- 앱 성격: 빌드 없는 SPA (Vanilla JS + ES Modules)
- 엔트리: `index.html` → `assets/modules/index.js` → `LottoApp`
- 핵심 기능:
  - 번호 생성(`Generator`)
  - AI 예측(`Ai`)
  - 전략 백테스트(`Backtest` + Worker)
  - 통계(`Stats`)
  - 당첨 확인(`Check`, QR 스캔 포함)
  - 데이터 백업/복원(`DataIO`)
- 배포 형태: 정적 파일 배포 (GitHub Pages 호환 구조)
- 오프라인: `sw.js` 서비스워커 캐시

중요 사실:
- 이 저장소에는 `package.json`이 없고, 빌드 파이프라인도 없습니다.
- 기능 검증은 로컬 HTTP 서버 + 수동 점검이 기본입니다.

---

## 2) 빠른 시작 (세션 시작 루틴)

1. 문서 확인
- `README.md`
- `PROJECT_ANALYSIS.md`
- `claude.md` (이 문서)

2. 로컬 실행
```bash
python -m http.server 5173
```
- 접속: `http://localhost:5173/`
- `file://` 직접 오픈 금지 (모듈/워커/서비스워커 이슈)

3. 성능 점검(선택)
```bash
node scripts/perf/bench.mjs
```

4. 디버그 퍼포먼스 로그(선택)
브라우저 콘솔에서:
```js
window.__LOTTO_PERF_DEBUG__ = true
```

---

## 3) 디렉터리/모듈 맵

- `index.html`: 전체 UI 구조 + SW 등록 코드
- `assets/app.css`: 전체 스타일
- `assets/modules/core/`
  - `LottoApp.js`: 앱 초기화, 라우팅, 모듈 lazy-load, 전역 이벤트
  - `DataManager.js`: 상태/저장소/동기화/통계 캐시
  - `StrategyEngine.js`: 전략 계산 코어
  - `StrategyCatalog.js`: 전략 목록/기본 파라미터/별칭
  - `StrategyFilters.js`: 공통 필터 체인
  - `StrategyWorkerClient.js`: 전략 워커 클라이언트
  - `MonteCarlo.js`, `UIManager.js`
- `assets/modules/features/`
  - `Generator.js`, `Ai.js`, `Backtest.js`, `Stats.js`, `Check.js`, `DataIO.js`, `QrScanner.js`
- 워커
  - `assets/strategy.worker.js`: 생성/추천 오프로드
  - `assets/backtest.worker.js`: 백테스트 오프로드
- 데이터
  - `data/winning_stats.json`
- PWA
  - `sw.js`, `manifest.json`
- 프록시 예시
  - `proxy/worker.js`

라우트 키(`page-*`): `gen`, `stats`, `ai`, `bt`, `check`, `data`

---

## 4) 런타임 흐름 핵심

### 앱 초기화
`LottoApp.init()`에서 수행:
- `data.load()`
- 테마 적용
- Generator eager 생성
- 라우트 초기 진입(`gen`)
- `fetchWinningStats()`로 정적 데이터 + 로컬 업데이트 병합
- idle 시점 `fetchLatestFromAPI({ silent: true })`

### 모듈 로딩
- Generator만 즉시 생성
- 나머지는 `ensureModule()`로 지연 import
- `pendingModulePromises`로 중복 로딩 방지
- `routeToken`으로 stale async 결과 무시

### 전략 처리 공통화
`Generator/Ai/Backtest` 모두 strategy request 포맷 공유:
```js
{
  strategyId,
  params: {
    simulationCount,
    lookbackWindow,
    wheelPoolSize,
    wheelGuarantee,
    seed,
    payoutMode
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

---

## 5) 상태/저장소 스키마

`DataManager.state` 주요 필드:
- `theme`, `favorites`, `history`
- `winningStats`, `analytics`
- `generated`, `aiResults`
- `strategyPrefs` (`generator`/`ai`/`backtest`)
- `strategyPresets`
- `ticketBook`, `campaigns`, `alertPrefs`
- `customProxy`

### localStorage 키
`assets/modules/utils/config.js` 기준:
- `lotto_pro_fav_v2`
- `lotto_pro_hist_v2`
- `lotto_pro_settings_v2`
- `lotto_pro_ticketbook_v1`
- `lotto_pro_campaigns_v1`
- `lotto_pro_alerts_v1`
- `lotto_pro_strategy_presets_v1`
- `lotto_pro_updates_v2` (코드 상수 직접 사용)
- 레거시: `lotto_webapp_settings_v1.proxyLatestUrl`, `lotto_webapp_settings_v1`

주의:
- 키 변경은 마이그레이션 없으면 사용자 데이터 유실로 직결됩니다.
- `save()`는 debounce(약 300ms + idle)라 즉시 저장이 필요하면 흐름 검토 필요.

---

## 6) 데이터 동기화 규칙

### 기본 병합
`fetchWinningStats()`:
1. `data/winning_stats.json` 로드
2. `lotto_pro_updates_v2` 병합
3. `draw_no` 기준 dedupe
4. 최신순 정렬
5. analytics 재계산 + 티켓 자동 정산

### 최신 회차 동기화
`fetchLatestFromAPI()`:
- 추정 최신 회차: `estimateLatestDrawKST()`
- 우선 `/proxy/range` 청크 호출
- 누락분은 draw 단건 fallback 조회
- 성공분은 `lotto_pro_updates_v2`에 합쳐 저장

### 프록시 URL 우선순위
1. URL 쿼리 `?proxyUrl=` 또는 `?proxy=`
2. v1 레거시 설정
3. v2 설정(`settings.customProxy`)
4. 공용 fallback

---

## 7) 티켓/캠페인 동작 요약

- 티켓 dedupe 키:
  - `targetDrawNo|source|numbers|strategyRequest(JSON)`
- 동일 번호라도 전략 스냅샷이 다르면 별도 티켓으로 저장될 수 있음
- `settlePendingTickets()`는 최신 당첨 데이터 기준으로 미정산 티켓 자동 판정
- 당첨 알림은 `alertPrefs` + 중복 알림 키(`latestDrawNo:settled:wins`)로 제어

---

## 8) 워커 계약(변경 시 반드시 동기화)

### `strategy.worker.js`
요청 타입:
- `WARMUP`
- `GENERATE`
- `RECOMMEND`

응답 타입:
- `READY`
- `DONE`
- `ERROR`

### `backtest.worker.js`
요청:
- `START` with `{ statsData, startDraw, endDraw, qty, strategyRequest | strategyRequests }`

응답:
- `PROGRESS`
- `WINS`
- `DONE`
- `ERROR`

주의:
- 메인/워커 payload 스키마가 조금만 어긋나도 조용히 실패하거나 UI가 멈춘 것처럼 보입니다.

---

## 9) 서비스워커/오프라인

`sw.js` 핵심:
- 캐시 버전: `v6`
- App Shell precache 목록 수동 관리
- 데이터 JSON: `network-first` + timeout
- 기타 정적 자산: `stale-while-revalidate`

수정 규칙:
- 신규 핵심 JS/CSS/워커 추가 시 `APP_SHELL_ASSETS` 반영
- 캐시 무효화가 필요하면 `CACHE_VERSION` 올리기

---

## 10) 외부 의존 (런타임 CDN 로드)

`loader.js` 기준:
- QR 생성: `qrcode`
- QR 스캔: `html5-qrcode`
- 이미지 저장: `html2canvas`
- 아이콘 CSS: phosphor

주의:
- 오프라인 첫 실행에서는 CDN 의존 기능이 제한될 수 있음
- 실패 시 반드시 graceful fallback 유지

---

## 11) 변경 시 회귀 포인트

1. 전략 요청 스키마
- `StrategyCatalog`/`StrategyEngine`/각 feature/worker 모두 동시 검토

2. localStorage 스키마
- 키/필드 수정 시 `load()` 정규화 경로 점검

3. 데이터 정렬 방향
- 앱 로딩 후 내부는 최신순 사용 (`draw_no desc`)
- 원본 JSON은 과거→현재 순

4. 서비스워커 캐시
- 파일 추가 후 precache 누락되면 오프라인/업데이트 이슈 발생

5. 백테스트 성능
- 대량 생성 로직 수정 시 `scripts/perf/bench.mjs`로 최소 확인

---

## 12) Claude에게 권장 작업 방식

세션 시작 프롬프트 예시:
```text
먼저 claude.md와 README.md를 읽고 현재 아키텍처/저장소 키/워커 계약을 요약해줘.
그 다음 변경 영향 범위를 먼저 제시하고, 최소 수정으로 구현해줘.
수정 후에는 수동 검증 체크리스트와 잔여 리스크를 정리해줘.
```

작업 원칙:
- 작은 단위로 수정하고 즉시 검증
- 리팩터링보다 기능 안전성 우선
- UI 변경 시 관련 라우트(`gen/ai/bt/check/data/stats`) 실제 클릭 경로 기준으로 확인

---

## 13) 세션 종료 시 남길 체크포인트

다음 세션 AI를 위해 아래를 갱신:
- 무엇을 바꿨는지 (파일 단위)
- 데이터 스키마/키 변경 여부
- 워커 메시지 계약 변경 여부
- 수동 테스트 결과
- 미해결 리스크

권장 포맷:
```md
### Session Handoff
- 변경 파일:
- 핵심 변경:
- 검증 완료:
- 남은 이슈:
- 다음 작업 추천:
```

---

## 14) 현재 우선 과제(문서 기준)

`FEATURE_SUGGESTIONS.md` 기준 주요 후보:
- 클라우드 동기화
- 당첨 자동 알림 고도화
- 고급 시각화 대시보드

실행 시 우선순위:
1. 저장소 스키마 영향 작은 기능부터
2. 워커/전략 코어 영향 큰 변경은 별도 단계로 분리

---

이 문서는 "Claude가 다음 세션에서 바로 실무 맥락을 복원"하는 것을 목표로 유지합니다.
변경이 생기면 반드시 최신 상태로 갱신하세요.


---

## 15) 2026-02-28 A+B 반영 요약

- 동기화 정책 프로파일 도입: `idle`은 완전 조용한 경로, `manual/refresh`는 안내/토스트 허용
- 동기화 관측성 코드 로그 추가: `SYNC_RANGE_FAIL`, `SYNC_FALLBACK_EXTERNAL`, `SYNC_FETCH_ONE_FAIL` 등
- 백테스트 상금 모드 도입: `params.payoutMode` (`hybrid_dynamic_first`, `fast_fixed`)
- 백테스트 UI 보강: 모드 선택, 실행 중 `중지` 버튼, 결과 패널 모드 안내
- 전략 워커 안정화: 동적 타임아웃, 타임아웃 1회 재시도, `WORKER_TIMEOUT_FINAL` 코드 에러
- 백업 포맷 v3 확장: `localUpdates`, `strategyPresets` 포함 + v1/v2/v3 import 지원
- 로컬 스모크 테스트 스크립트 추가: `node scripts/smoke/smoke.mjs`

다음 세션에서는 `claude.md`를 기준 문서로 사용하고, `cladue.md`는 호환 안내용 별칭으로만 취급합니다.
