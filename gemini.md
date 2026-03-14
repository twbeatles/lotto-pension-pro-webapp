# gemini.md

## 문서 목적

이 문서는 `lotto---webapp` 저장소에서 Gemini 계열 AI가 다음 세션에도 일관되게 작업하도록 돕는 실무 가이드입니다.
핵심은 "컨텍스트 복원, 영향 범위 통제, 검증 중심 작업"입니다.

- 기준일: 2026-03-14
- 정적 데이터 최신 회차: `1209` (`data/winning_stats.json` 기준)
- 정적 데이터 개수: `1208`, 누락 회차 번호: `146`

---

## 1) 프로젝트 요약

- 형태: 빌드 없는 단일 페이지 웹앱
- 핵심 스택: HTML + CSS + Vanilla JS(ESM)
- 엔트리: `index.html` -> `assets/modules/index.js`
- 배포 URL: `https://twbeatles.github.io/lotto---webapp/`
- 주요 탭: `gen`, `stats`, `ai`, `bt`, `check`, `data`
- 오프라인 지원: `sw.js` (`CACHE_VERSION: v10`)
- 데이터 원천:
  - 정적: `data/winning_stats.json`
  - 동적 누적: `localStorage.lotto_pro_updates_v2`

중요:

- 번들러/트랜스파일 단계는 없음
- 대신 개발 도구용 `package.json`, `eslint.config.mjs`가 존재함
- 기본 검증 루틴에 `npm run lint`를 포함해야 함

## 1-1) 2026-03-13 반영 메모

- 모바일 하단 탐색은 6탭(`gen/stats/ai/bt/check/data`) 기준
- `Generator/Ai/Backtest`에 전략 프리셋 CRUD 추가
- AI 추천의 `생성 탭으로`는 기존 생성 결과 교체
- 캠페인 삭제/전체삭제는 연결 티켓 cascade 삭제
- Import 옵션에 `alertPrefs` 적용 체크 추가
- 런타임 외부 자산은 `assets/vendor/` same-origin 경로로 로컬화
- 제3자 자산 고지 문서: `THIRD_PARTY_NOTICES.md`

## 1-2) 2026-03-14 반영 메모

- 최신 회차 동기화는 `프록시 옵트인` 정책으로 전환
  - 프록시 미설정 시 정적 JSON만 사용
  - `/proxy/latest`, `api.allorigins.win`, `corsproxy.io` 기본 fallback 제거
- 동기화 메타 저장소 `lotto_pro_sync_meta_v1` 추가
  - `mode`, `currentSource`, `lastSuccessAt`, `lastSuccessDrawNo`, `lastFailureAt`, `lastFailureMessage`
- 데이터 탭에 검색/페이지네이션/저장 상태 요약/동기화 메타/알림 권한 배지 추가
- 시스템 알림은 토글 on 시 즉시 권한 요청, 테스트 알림 버튼 제공
- `pagehide`, `visibilitychange(hidden)`에서 `save(true)` flush 수행
- 서비스워커는 사용자가 업데이트를 수락한 경우에만 reload

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
npm install
npm run lint
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
- `assets/modules/utils/strategyPresets.js`: 전략 프리셋 공통 컨트롤러
- 워커:
  - `assets/strategy.worker.js`
  - `assets/backtest.worker.js`
- vendor 자산:
  - `assets/vendor/`
- 프록시 예시:
  - `proxy/worker.js`

---

## 4) 데이터/저장소 규칙

### State 골격 (`DataManager.state`)

- `winningStats`, `analytics`
- `staticLatestDrawNo`, `syncMeta`
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
- `lotto_pro_sync_meta_v1`
- `lotto_pro_updates_v2`
- 레거시 프록시: `lotto_webapp_settings_v1.proxyLatestUrl`

원칙:

- 키 변경 시 마이그레이션 코드 동반
- `load()` 정규화/호환 로직 우선 확인
- 캠페인 삭제 정책은 현재 cascade delete
- 기존 orphan ticket은 자동 정리하지 않음

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
- `staticLatestDrawNo`와 동기화 메타 갱신

### 최신 데이터 동기화

`fetchLatestFromAPI()`:

- `estimateLatestDrawKST()`로 최신 회차 추정
- in-flight 단일 실행 가드: 실행 중 재호출은 기존 Promise에 합류
- 동기화 프로파일:
  - `idle`: silent
  - `manual/refresh`: 로그/토스트
- 수동 동기화(`manual`)만 취소 가능(`cancelActiveSync`)
- 프록시 미설정 시 네트워크 호출 없이 종료하고 안내 메시지만 표시
- `/proxy/range` 우선
- 누락 회차는 단건 fallback 조회
- 단건 fallback도 사용자 프록시 URL만 사용
- fallback 단건 조회 상한: 최근 120개(`MAX_SYNC_FALLBACK_DRAWS`)
- 성공/실패 정보는 `lotto_pro_sync_meta_v1`에 저장

### 프록시 우선순위

1. URL 파라미터 `proxyUrl/proxy`
2. v1 레거시
3. v2 설정(`customProxy`)
4. 그 외는 정적 JSON 전용 모드

---

## 7) 워커 메시지 계약

### `strategy.worker.js`

요청: `WARMUP`, `GENERATE`, `RECOMMEND`

응답: `READY`, `DONE`, `ERROR`

### `backtest.worker.js`

요청: `START`

응답: `PROGRESS`, `WINS`, `DONE`, `ERROR`

`WINS` payload 주요 필드:

- `strategyId`, `payoutMode`, `drawNo`, `rank`, `prize`, `nums`
- `matchedCount:number`
- `bonusHit:boolean`
- `hitText:string`

---

## 8) PWA/캐시 규칙

`sw.js`:

- 캐시 버전: `v10`
- 데이터 요청: network-first
- 앱 셸: stale-while-revalidate
- precache 목록: `APP_SHELL_ASSETS`
- 런타임 라이브러리/font/icon은 `assets/vendor/` same-origin 경로 사용
- `controllerchange` reload은 사용자가 업데이트를 수락했을 때만 수행

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
- 추가 대응: 서비스워커 캐시 버전 `v8` 상향

## 9-1) 2026-03-01 인코딩 정리(2차)

- 증상: 일부 한국어 UI 문구가 깨진 글자(`理쒖떊`)로 표시됨.
- 조치: `DataManager/Generator/Backtest/Ai`에서 사용자 노출 문자열을 정리하고 탭별 실제 렌더로 검증.
- 배포 확인: 동일 증상 재발 시 SW 캐시 초기화 후 재검증.

## 9-2) 2026-03-01 기능 품질 강화(3차)

- 전략 생성은 `엄격 필터` 기준으로 동작하며, 필터 미충족 시 무필터 랜덤으로 보완하지 않음.
- 백테스트 요약은 `requestedTickets`, `generatedTickets`, `fillRate`를 포함.
- Import 후 즉시 `fetchWinningStats -> updateLatestWin -> refreshCurrentRoute -> renderDataLists` 순서로 UI 반영.
- draw 정규화에서 중복 번호/보너스 중복 차단.
- `smoke`에 strict-filter/draw-normalization/post-import-refresh 회귀 테스트 포함.

## 9-3) 2026-03-05 통합 개선(리포트 1~9 + A~E)

- 제한 상수 중앙화(`CONFIG.LIMITS`)
  - `MAX_BACKTEST_SPAN=300`
  - `MAX_CAMPAIGN_WEEKS=52`
  - `MAX_CAMPAIGN_SETS_PER_WEEK=20`
  - `MAX_CAMPAIGN_TOTAL_TICKETS=500`
  - `MAX_SYNC_FALLBACK_DRAWS=120`
- 백테스트:
  - 메인/워커 회차 범위 검증 강화
  - `WINS` payload 확장(`matchedCount`, `bonusHit`, `hitText`)
  - CSV 헤더 정합화(`strategy_id`, `strategy_label`)
- 캠페인/저장 정합성:
  - 생성 단계 + `normalizeCampaignEntry` 상한 검증
- 동기화 제어:
  - `syncInFlightPromise` 단일 실행
  - 수동 취소 버튼(`cancelSyncBtn`) 및 abort 경로
- Import UX:
  - 옵션 패널 기반(`merge/overwrite`, 설정 적용 체크)
  - 기본 정책: `Merge=미적용`, `Overwrite=적용`
- QR 검증:
  - host allowlist + 중복 번호 게임 거부
- 기타:
  - ticket dedupe stable stringify
  - 프록시 출처 라벨 인코딩 복구
  - `sw.js` 캐시 버전 `v9`

## 9-4) 2026-03-13 기능/오프라인 자산 통합

- 모바일 `data` 탭 추가
- 전략 프리셋 CRUD 및 backup 연동 유지
- `requestNumbers()` replace semantics 적용
- Import alerts 옵션 및 기본값 정렬
- 최신 당첨결과 placeholder 렌더링 추가
- `sw.js` 캐시 버전 `v10`, 로컬 vendor 자산 precache

---

## 10) 최소 검증 루틴

0. `npm run lint`
1. 생성 탭: 전략 선택 + 번호 생성 + 티켓 저장
2. AI 탭: 추천 실행 + 결과 렌더 + 티켓 저장
3. 캠페인 삭제/전체삭제 시 연결 티켓 cascade 확인
4. Import 옵션(`theme/proxy/strategyPrefs/alerts`) 정책 확인
5. 모바일 하단 6탭과 `data` 진입 확인
6. 전략 프리셋 저장/불러오기/삭제 확인
3. 백테스트 탭: 단일/비교 실행, 모드 전환, CSV 내보내기
4. 데이터 탭: v3 백업 내보내기/가져오기
5. 동기화: 단일 실행 가드, `cancelSyncBtn` 취소 동작 확인
6. Import: `merge/overwrite`와 설정 체크 반영 확인
7. PWA: 새로고침/오프라인 기본 기능 확인
8. 프록시 미설정 상태에서 최신 동기화가 네트워크 호출 없이 종료되는지 확인
9. 데이터 탭 검색/페이지네이션/저장 상태 요약/알림 권한 배지 확인

## 10-1) 개발 도구 메모

- `package.json`
  - `lint`, `lint:fix`, `format:check`, `format:write`
- `eslint.config.mjs`
  - `index.html` inline script까지 lint 대상
- `.vscode/settings.json`
  - 저장 시 ESLint auto-fix 설정 포함

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

### Session Handoff (Gemini - 2026-03-02)

- 변경 파일: `assets/app.css`, `assets/modules/core/LottoApp.js`, `index.html` (일부 속성 변경)
- 변경 목적: 전반적인 UI/UX 프리미엄 리팩토링 (가독성 향상, Glassmorphism 보강, Empty State 컨테이너 디자인 통일, 마이크로 애니메이션 강화, 모바일 네비게이션 인디케이터 도입)
- 데이터 스키마 영향: 없음 (디자인 레이어 변경에 국한)
- 워커 계약 영향: 없음
- 검증 완료 항목: CSS 반영 확인 완료, `scripts/smoke/smoke.mjs` 기능 이상 없음 확인, 즐겨찾기/티켓 등 리스트 비어있을 때 아이콘 포함 Empty State 렌더링 확인 완료.
- 미해결 리스크: 다양한 해상도의 모바일 브라우저에서 스크롤 여백(Safe Area) 반응성 검토 필요.
- 다음 세션 우선 작업: (당시 기준) 캐시 클리어 후 PWA 구동 테스트, 실제 아이폰/안드로이드 뷰포트에서 토스트 메시지 겹침 여부 등 사용성 잔상 체크.
