# claude.md

## 문서 목적
이 문서는 저장소(`lotto---webapp`)에서 Claude 계열 AI가 다음 세션에도 바로 작업을 이어갈 수 있도록 만든 운영 기준 문서입니다.
핵심은 "빠르게 맥락 복원 -> 안전하게 수정 -> 회귀 없이 검증"입니다.

- 기준일: 2026-03-01
- 정적 당첨 데이터 최신 회차: `1209` (`data/winning_stats.json` 기준)
- 정적 데이터 개수: `1208`, 누락 회차: `146`

---

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
- 이 저장소에는 `package.json`이 없고 빌드 파이프라인도 없습니다.
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
- `file://` 직접 오픈 금지

3. 기본 검증
```bash
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
- 워커
  - `assets/strategy.worker.js`
  - `assets/backtest.worker.js`
- 데이터
  - `data/winning_stats.json`
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
- 누락분은 단건 fallback 조회
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

---

## 8) 서비스워커/오프라인

`sw.js` 핵심:
- 캐시 버전: `v7`
- App Shell precache 목록 수동 관리
- 데이터 JSON: `network-first` + timeout
- 기타 정적 자산: `stale-while-revalidate`

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
- 추가 조치: `sw.js` `CACHE_VERSION`을 `v7`로 상향

## 9-1) 2026-03-01 인코딩 정리(2차)
- 증상: 기능은 동작하지만 일부 한글 문구가 `理쒖떊`처럼 깨져 보임.
- 조치: `DataManager/Generator/Backtest/Ai`의 사용자 노출 문자열(토스트, 상태 텍스트, 버튼 라벨, 로그 문구, 접근성 라벨) 정규화.
- 운영 참고: 배포 후 같은 증상이 보이면 서비스워커 캐시를 먼저 의심하고 강력 새로고침/스토리지 초기화로 확인.

---

## 10) 회귀 점검 포인트

1. 탭 전환(`gen/stats/ai/bt/check/data`)
2. 번호 생성/AI 추천/백테스트 실행
3. 동기화 버튼 + 티켓 자동 정산
4. 백업 내보내기/가져오기(v1/v2/v3)
5. 서비스워커 캐시 갱신 후 동작

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
