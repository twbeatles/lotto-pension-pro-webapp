# claude.md

## 문서 목적

이 문서는 저장소(`lotto---webapp`)에서 Claude 계열 AI가 다음 세션에도 바로 작업을 이어갈 수 있도록 만든 운영 기준 문서입니다.
핵심은 "빠르게 맥락 복원 -> 안전하게 수정 -> 회귀 없이 검증"입니다.

- 기준일: 2026-03-13
- 정적 당첨 데이터 최신 회차: `1209` (`data/winning_stats.json` 기준)
- 정적 데이터 개수: `1208`, 누락 회차 번호: `146`

---

## 0) 2026-03-05 통합 개선 반영 (리포트 1~9 + A~E)

- 제한 상수 중앙화(`CONFIG.LIMITS`)
  - `MAX_BACKTEST_SPAN=300`
  - `MAX_CAMPAIGN_WEEKS=52`
  - `MAX_CAMPAIGN_SETS_PER_WEEK=20`
  - `MAX_CAMPAIGN_TOTAL_TICKETS=500`
  - `MAX_SYNC_FALLBACK_DRAWS=120`
- 백테스트
  - 메인/워커 양쪽에서 회차 폭 상한 검증
  - `WINS` payload 확장: `matchedCount`, `bonusHit`, `hitText`
  - CSV: `strategy_id`, `strategy_label` 분리
- 캠페인
  - 생성 단계와 저장 정규화 단계 모두 상한 검증
- 동기화
  - in-flight 단일 실행 가드(`syncInFlightPromise`)
  - 수동 동기화 취소(`cancelActiveSync`, `cancelSyncBtn`)
  - fallback 단건 요청 상한(`MAX_SYNC_FALLBACK_DRAWS`)
- 데이터 Import
  - 옵션 패널 기반(`merge/overwrite`, 설정 적용 체크)
  - 기본 정책: `Merge=설정 미적용`, `Overwrite=설정 적용`
- QR 검증 강화
  - 공식 host 화이트리스트: `m.dhlottery.co.kr`, `www.dhlottery.co.kr`
  - 중복 번호 게임 거부
- 서비스워커 캐시 버전: `v9`

---

## 0-1) 2026-03-13 기능/오프라인 자산 통합 반영

- 모바일 하단 탐색을 `gen/stats/ai/bt/check/data` 6탭으로 통일
- `Generator/Ai/Backtest`에 전략 프리셋 CRUD 추가
  - scope별 저장소
  - `prompt()/confirm()` 기반 저장/overwrite/delete
- AI 추천의 `생성 탭으로`는 append가 아니라 기존 생성 결과 교체
- 캠페인 삭제/전체삭제는 연결된 `campaignId` 티켓 cascade 삭제
- 최신 당첨결과 카드는 오프라인/데이터 없음 placeholder를 명시적으로 렌더
- 동기화 성공 직후 현재 라우트와 무관하게 `updateLatestWin()` 실행
- Import 옵션에 `alertPrefs` 적용 체크 추가
  - 기본 정책: `merge=theme/proxy/strategyPrefs/alerts 미적용`
  - 기본 정책: `overwrite=theme/proxy/strategyPrefs/alerts 적용`
- 런타임 외부 자산을 `assets/vendor/`로 로컬화
  - `Pretendard`, `Phosphor`, `qrcode`, `html2canvas`, `html5-qrcode`
- 서비스워커 캐시 버전: `v10`
- 제3자 자산 고지 문서: `THIRD_PARTY_NOTICES.md`

## 1) 프로젝트 한눈에 보기

- 앱 성격: 빌드 없는 SPA (Vanilla JS + ES Modules)
- 엔트리: `index.html` -> `assets/modules/index.js` -> `LottoApp`
- 배포 URL: `https://twbeatles.github.io/lotto---webapp/`
- 핵심 기능:
  - 번호 생성(`Generator`)
  - AI 예측(`Ai`)
  - 전략 백테스트(`Backtest` + Worker)
  - 통계(`Stats`)
  - 당첨 확인(`Check`, QR 스캔)
  - 데이터 백업/복원(`DataIO`)
- 오프라인: `sw.js` 서비스워커 캐시

중요 사실:

- 배포 번들링 파이프라인은 없지만, 개발 도구용 `package.json`과 `eslint.config.mjs`는 존재합니다.
- 기능 검증은 로컬 HTTP 서버 + `npm run lint` + 스모크 점검 조합이 기본입니다.

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
- `file://` 직접 오픈 금지

3. 기본 검증

```bash
npm install
npm run lint
node scripts/smoke/smoke.mjs
```

4. 성능 점검(선택)

```bash
node scripts/perf/bench.mjs
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
- `assets/modules/utils/strategyPresets.js`: 전략 프리셋 공통 컨트롤러
- 워커
  - `assets/strategy.worker.js`
  - `assets/backtest.worker.js`
- 데이터
  - `data/winning_stats.json`
- 로컬 vendor 자산
  - `assets/vendor/`
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
- 초기 라우트(`gen`)
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
- `strategyPrefs`, `strategyPresets`
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
- `lotto_pro_updates_v2`
- 레거시: `lotto_webapp_settings_v1.proxyLatestUrl`, `lotto_webapp_settings_v1`

운영 규칙:

- `strategyPresets`는 scope(`generator/ai/backtest`)별로 분리해 관리
- 캠페인 삭제/전체삭제는 연결 티켓 cascade 삭제가 현재 정책
- 기존 orphan ticket은 자동 정리하지 않음

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
- in-flight 단일 실행 가드: 실행 중 재호출 시 기존 Promise 합류
- 수동 동기화(`trigger=manual`)만 취소 가능
- 우선 `/proxy/range` 청크 호출
- 누락분은 단건 fallback 조회
- fallback 단건 조회는 최근 `120`개로 제한
- 성공분은 `lotto_pro_updates_v2`에 합쳐 저장

### 프록시 URL 우선순위

1. URL 쿼리 `?proxyUrl=` 또는 `?proxy=`
2. v1 레거시 설정
3. v2 설정(`settings.customProxy`)
4. 공용 fallback

---

## 7) 워커 계약

### `strategy.worker.js`

요청 타입: `WARMUP`, `GENERATE`, `RECOMMEND`

응답 타입: `READY`, `DONE`, `ERROR`

### `backtest.worker.js`

요청: `START`

응답: `PROGRESS`, `WINS`, `DONE`, `ERROR`

`WINS` payload(추가 필드 포함):

- `strategyId`, `payoutMode`, `drawNo`, `rank`, `prize`, `nums`
- `matchedCount:number`
- `bonusHit:boolean`
- `hitText:string`

---

## 8) 서비스워커/오프라인

`sw.js` 핵심:

- 캐시 버전: `v10`
- App Shell precache 목록 수동 관리
- 데이터 JSON: `network-first` + timeout
- 기타 정적 자산: `stale-while-revalidate`
- 런타임 라이브러리/font/icon은 `assets/vendor/` same-origin 경로로 캐시

수정 규칙:

- 신규 핵심 JS/CSS/워커 추가 시 `APP_SHELL_ASSETS` 반영
- 캐시 무효화가 필요하면 `CACHE_VERSION` 올리기

---

## 9) 2026-03-01 안정화 이슈 기록

- 증상: "페이지는 뜨는데 기능이 동작하지 않음"
- 원인: 일부 모듈 문자열 리터럴 깨짐으로 ESM 파싱 실패
- 수정 파일:
  - `assets/modules/core/DataManager.js`
  - `assets/modules/features/Ai.js`
  - `assets/modules/features/Backtest.js`
  - `assets/modules/features/Generator.js`
- 추가 조치: `sw.js` `CACHE_VERSION`을 `v8`로 상향

## 9-1) 2026-03-01 인코딩 정리(2차)

- 증상: 기능은 동작하지만 일부 한글 문구가 `理쒖떊`처럼 깨져 보임.
- 조치: `DataManager/Generator/Backtest/Ai`의 사용자 노출 문자열(토스트, 상태 텍스트, 버튼 라벨, 로그 문구, 접근성 라벨) 정규화.
- 운영 참고: 배포 후 같은 증상이 보이면 서비스워커 캐시를 먼저 의심하고 강력 새로고침/스토리지 초기화로 확인.

## 9-2) 2026-03-01 기능 품질 강화(3차)

- 전략 생성 정책:
  - `StrategyEngine.generateSetWithExecution()`은 필터 미충족 시 `null`을 반환하고, 무필터 랜덤 세트로 보완하지 않음.
  - `Generator/Ai`는 요청 수량 대비 실제 생성 수량을 사용자에게 명시.
- 백테스트 정책:
  - `backtest.worker.js`의 무필터 랜덤 대체 제거.
  - 요약에 `requestedTickets`, `generatedTickets`, `fillRate` 포함.
- 데이터/보안:
  - `DataManager.normalizeDrawItem`, `backup.normalizeDrawUpdate`에서 중복 번호/보너스 중복 차단.
  - 데이터 Import 후 `fetchWinningStats -> updateLatestWin -> refreshCurrentRoute -> renderDataLists` 즉시 갱신.
  - 캠페인 렌더링은 `textContent` 기반 DOM 조립으로 변경(XSS 완화).
- 오프라인:
  - `sw.js` precache에 `assets/modules/utils/backup.js` 추가.
- 회귀 테스트:
  - `scripts/smoke/smoke.mjs`에 strict-filter, draw-normalization, post-import-refresh 회귀 케이스 추가.

## 9-3) 2026-03-05 통합 개선(리포트 1~9 + A~E)

- 백테스트 상한/표시 정합성:
  - 범위 상한(300회차) 적용
  - `WINS.hitText` 실제 값 채움
  - CSV 헤더/값 정합성(`strategy_id`, `strategy_label`)
- 캠페인 상한:
  - 생성/저장 경로 동시 검증(52주, 주당 20세트, 총 500티켓)
- QR 검증:
  - host allowlist + 중복 번호 거부
- 동기화 제어:
  - `syncInFlightPromise` 단일 실행
  - 수동 동기화 취소 버튼/AbortController 경로
- Import UX:
  - 옵션 패널 기반 모드/설정 적용 선택
- 기타:
  - dedupe key의 stable stringify 적용
  - 프록시 출처 라벨 깨짐 문자열 복구
  - `sw.js` `CACHE_VERSION` `v9` 상향

---

## 10) 회귀 점검 포인트

0. `npm run lint` 통과 여부
1. 탭 전환(`gen/stats/ai/bt/check/data`)
2. 번호 생성/AI 추천/백테스트 실행 (요청 대비 생성 수량 표시 포함)
3. 동기화 버튼 + 티켓 자동 정산
4. 백업 내보내기/가져오기(v1/v2/v3) 후 즉시 화면 반영
5. 서비스워커 캐시 갱신 후 동작
6. 엄격 필터 조건에서 필터 위반 조합이 출력되지 않는지 확인
7. 수동 동기화 중 `cancelSyncBtn`이 실제 취소 동작하는지 확인
8. Import 옵션(`merge/overwrite`, `theme/proxy/strategyPrefs/alerts`)이 정책대로 동작하는지 확인
9. 모바일 하단 6탭에서 `data` 화면 진입이 가능한지 확인
10. 캠페인 삭제/전체삭제 시 연결 티켓이 함께 제거되는지 확인
11. AI `생성 탭으로`가 기존 생성 결과를 교체하는지 확인
12. 전략 프리셋 저장/불러오기/삭제가 각 scope에서 분리 동작하는지 확인
13. 최신 당첨결과 카드가 오프라인에서도 blank가 아니라 placeholder를 표시하는지 확인
14. 백테스트 상세표 `적중` 컬럼과 CSV `strategy_id/strategy_label` 정합성 확인

## 10-1) 개발 도구 메모

- `package.json`
  - `lint`, `lint:fix`, `format:check`, `format:write`
- `eslint.config.mjs`
  - JS, Worker, Service Worker, Node 스크립트, `index.html`까지 검증
- `.vscode/settings.json`
  - 저장 시 `source.fixAll.eslint` 실행
- HTML lint는 과도한 포맷 강제를 피하도록 구조 규칙 위주로 조정되어 있음

---

## 11) 세션 종료 시 남길 항목

```md
### Session Handoff

- 변경 파일:
- 핵심 변경:
- 검증 완료:
- 남은 이슈:
- 다음 작업 추천:
```
