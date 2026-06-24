# Project Audit

감사 일자: 2026-06-24  
대상: `lotto-pension-pro-webapp` (로또·연금복권 프로)  
방법: `README.md`, `Claude.md` 검토, CodeGraph MCP 구조 분석, 선택적 코드 열람·grep, `node scripts/smoke/smoke.mjs`·`npm run lint` 실행

---

## 1. Executive Summary

이 프로젝트는 **no-build 정적 SPA**로, `DataManager` 중심의 상태·영속화, 기능 모듈 lazy-load, Web Worker 기반 전략 연산, Service Worker PWA 캐시, 광범위한 smoke 회귀(100건 이상)가 잘 갖춰진 **성숙한 코드베이스**입니다. 동기화 가드(`syncInFlightPromise`, `_syncRunId`), 크로스탭 rehydrate 시 dirty flush, 백업 import 한도, CSV 수식 이스케이프 등 핵심 방어 로직이 실제 코드에 존재합니다.

**전체 위험도: Medium** — 치명적 보안 취약점이나 데이터 손실 경로는 smoke/핸드오프 기준으로 대부분 완화되어 있으나, **연금복권 UI 헬퍼의 인코딩 손상**은 사용자에게 즉시 보이는 기능 결함이고, **번호 추천(AI) 모듈의 비동기 취소·재현 UX**는 문서·다른 모듈 대비 약합니다.

| 구분 | 요약 |
|------|------|
| Critical | 0건 (즉시 데이터 유실·원격 코드 실행 수준 이슈 없음) |
| High | 2건 — `pension720/dom.js` 한글 깨짐, AI 추천 stale run·재현 코드 UX 불일치 |
| Medium | 5건 — import proxy 검증, 서드파티 CORS 프록시, debounced save 창, 문서 불일치 등 |
| Low | 3건 — 테스트 공백, 레거시 proxy 우선순위, 소수 innerHTML 일관성 |

**즉시 조치 권장:** `assets/modules/features/pension720/dom.js` 인코딩 복구 및 회귀 테스트 추가.

---

## 2. Project Understanding

### 2.1 프로젝트 목적 (README.md)

동행복권 **로또 6/45**·**연금복권720+** 당첨 통계 분석, 번호 생성·추천·저장·당첨 확인·백테스트·백업/복원을 브라우저 localStorage 기반으로 제공하는 무료 PWA입니다. 기기 간 자동 동기화는 없고 JSON 백업으로 이전합니다.

### 2.2 아키텍처 (Claude.md + CodeGraph)

```
index.html
  └─ assets/modules/index.js
       ├─ bootstrap/pwa.js          (SW 등록·업데이트 UI)
       └─ core/LottoApp.js
            ├─ DataManager           (state, persistence, sync, pension720 data)
            ├─ StrategyWorkerClient  (GENERATE / RECOMMEND worker)
            ├─ UIManager
            └─ features/* (lazy)
                 ├─ Generator, Ai, Stats, Check, Backtest
                 ├─ Pension720 (facade → pension720/*)
                 └─ DataIO (facade → dataio/*)
```

**주요 실행 흐름**

1. **초기화** (`LottoApp.init`): `data.initCrossTabSync()` → `data.load()` → 네비·설정 바인딩 → `route('gen')` → `fetchWinningStats()` / `fetchPension720Stats()` → auto-sync 큐.
2. **영속화** (`persistence/loadSave.js`, `storage.js`): debounced `save()` + dirty key 추적, quota 실패 시 dirty 유지, `BroadcastChannel`/`storage` 이벤트로 타브 rehydrate (`networkLifecycle.js`가 flush 후 `load()`).
3. **동기화** (`sync/orchestrator.js`): 정적 JSON 우선 병합 → `fetchLatestFromAPI` 단일 in-flight, proxy fingerprint 변경 시 abort, runId로 stale run 무시.
4. **전략 연산** (`StrategyWorkerClient`): stats fingerprint 캐시, timeout 재시도, `STRATEGY_WORKER_CACHE_EMPTY` 1회 full stats 재전송.
5. **백업** (`utils/backup.js`, `dataio/*`): schema v5, 32MB import 한도, overwrite 전 silent backup, merge/overwrite preview.

### 2.3 문서·구현 정합성 (확인됨)

| 항목 | 문서 | 구현 | 일치 |
|------|------|------|------|
| SW cache version | `v29` | `sw.js` `CACHE_VERSION = 'v29'` | ✅ |
| Lotto latest draw | 1229 / 1228 rows | `data/winning_stats.json` max draw 1229, 1228 rows | ✅ |
| Pension720 latest | 320회 | `data/pension720_stats.json` draw 320 | ✅ |
| 탭 이름 7개 | README 표 | `index.html` `data-target` | ✅ |
| 백업 v5·32MB | README/Claude | `CONFIG.LIMITS`, `backup.js` | ✅ |
| smoke 회귀 | Claude verification | 100+ PASS (2026-06-24 실행) | ✅ |

### 2.4 CodeGraph blast radius (대표)

- `LottoApp.init` → persistence `load`, cross-tab sync, module routing — **단위 테스트 없음**, smoke/ui·sync 회귀로 보완.
- `flushPendingLocalPersistence` → `networkLifecycle._rehydrateAfterRemotePersistenceSync` 단일 호출 경로 — **전용 단위 테스트 없음**, `persistence-flush regression` 존재.
- `StrategyWorkerClient.post/postOnce` → Generator, Ai, Backtest — implementation·timeout 회귀 존재.
- `pension720/dom.js` `formatTicket` → tickets 복사·표시 — **테스트 없음**, UI contract 회귀는 DOM selector 위주.

---

## 3. High-Risk Issues

### 3.1 연금복권 DOM 헬퍼 한글 인코딩 손상

* **위치:** `assets/modules/features/pension720/dom.js` — `PENSION720_ANALYSIS_PRESETS`, `formatTicket`, `appendDigitBalls`, `getAnalysisPresetLabelFromRequest`
* **문제:** 한글 라벨·단위가 `??`, `?`로 깨져 저장됨. 예: `label: '??'`, `` `${group}조` `` → `` `${group}?` ``, `formatTicket`의 `조` → `?`.
* **영향:** 연금복권 추천 결과의 분석 강도 라벨, 조 표시, 클립보드 복사 문자열이 사용자에게 잘못 표시됨. `index.html` 옵션 텍스트는 정상이라 UI 불일치 발생.
* **근거:** 파일 실측 내용; CodeGraph가 `formatTicket` → `pension720/tickets.js` `copySavedTickets` 호출 경로 확인; smoke `pension720 expanded UI contract regression`은 이 문자열을 검증하지 않음.
* **권장 수정 방향:** UTF-8 원문 복구 (`빠름`/`기본`/`정밀`, `조`). 저장·CI 시 UTF-8 강제. 회귀 테스트에 `formatTicket`·preset label assertion 추가.
* **우선순위:** **High**

### 3.2 번호 추천(AI) 모듈 — stale 비동기 결과·재현 UX 불일치

* **위치:** `assets/modules/features/ai/rendering.js` `run()`, `assets/modules/features/Ai.js`; 대비: `generator/actions.js` `generationToken`, `pension720/recommendations.js` `recommendationToken`
* **문제:**
  1. AI `run()`은 `btn.disabled`만 사용하고 **run token이 없음**. 느린 worker 응답이 뒤늦게 도착하면 최신 요청과 무관한 결과가 `renderResults`에 반영될 수 있음 (Generator·Pension720는 token으로 차단).
  2. README는 “**결과 화면의 재현 코드**”를 안내하나, 구현은 폼 입력 `aiSeed`만 존재하고 **자동 생성된 `runtimeSeed`를 결과에 노출하지 않음** (`runtimeEntropy.js`의 `withRuntimeSeed`).
* **영향:** 연속 추천·설정 변경 중 결과 뒤섞임 가능성; 시드 미입력 사용자는 동일 번호 재현 불가 → README와 체감 기능 불일치.
* **근거:** `generationToken`/`recommendationToken` 패턴과 AI 부재 비교; `index.html` `#aiSeed` 라벨 vs README “결과 화면”; `ai/rendering.js`에 결과 seed 출력 없음.
* **권장 수정 방향:** `recommendationToken` 또는 `runToken` 도입 후 render 전 stale 검사; 결과 카드에 `runtimeSeed` 또는 복사 가능한 재현 코드 표시(시드 미지정 시).
* **우선순위:** **High**

### 3.3 백업 import 시 customProxy 검증 누락

* **위치:** `assets/modules/features/dataio/importFlow.js` `applyPreparedImport`, `importPayload.js` `normalizeImportPayload`
* **문제:** import 시 `customProxy`를 문자열로만 수용·저장. UI 수동 입력은 `validateCustomProxyUrl`로 `/proxy/latest` 형식을 검증하나, **import 경로는 검증 없음**.
* **영향:** 악의적이지 않아도 잘못된 proxy URL이 저장되어 설정 화면에 “무시됨” 상태가 지속; 사용자 혼란. 동기화 자체는 `orchestrator`에서 invalid proxy 무시하므로 데이터 손실 위험은 낮음.
* **근거:** `proxy.js` `validateCustomProxyUrl` vs `importFlow.js` 직접 할당; `settingsPanel.js`는 저장값 검증 표시만 함.
* **권장 수정 방향:** import apply 시 `validateCustomProxyUrl` 호출, invalid면 빈 문자열로 정규화하거나 preview에 경고.
* **우선순위:** **Medium** (기능 혼란; 보안 영향 제한적)

### 3.4 기본 동기화의 서드파티 CORS 프록시 의존

* **위치:** `assets/modules/core/data/sync/providers.js` — `BUILTIN_SYNC_SINGLE_PROVIDERS` (`corsproxy.io`, `api.codetabs.com`)
* **문제:** 공식 API 직접 호출 실패 시 **사용자 브라우저가 제3자 프록시로 동행복권 API URL을 전달**.
* **영향:** 프라이버시·가용성·신뢰 경계 이슈(프록시 장애·정책 변경 시 동기화 실패). 기능상 의도된 fallback이나 문서화 수준은 README proxy 섹션보다 낮음.
* **근거:** `providers.js` URL 빌드 코드; smoke `built-in sync provider regression`은 존재하나 외부 서비스 SLA는 앱 밖.
* **권장 수정 방향:** 설정/동기화 로그에 “서드파티 경유” 명시; 가능하면 자체 Worker proxy 우선 안내 강화.
* **우선순위:** **Medium**

### 3.5 debounced localStorage 저장과 크로스탭 동기화 타이밍

* **위치:** `persistence/loadSave.js` `save()` (300ms debounce + `requestIdleCallback`), `storage.js` `notifyCrossTabStateChange`
* **문제:** dirty flush 전 다른 탭이 `storage` 이벤트를 받으면 **최대 수백 ms 동안 이전 스냅샷**을 rehydrate할 수 있음. `hasPendingLocalPersistence` 가드가 있으나 flush 실패 시 rehydrate 보류.
* **영향:** 드문 다중 탭 편집 시 일시적 UI 불일치; flush 실패·quota 초과 시 dirty 유지는 의도된 동작(Claude.md와 일치).
* **근거:** CodeGraph cross-tab 경로; `networkLifecycle._rehydrateAfterRemotePersistenceSync` flush 로직.
* **권장 수정 방향:** 중요 쓰기 경로는 `save(true)` 확대 검토; 다중 탭 편집 시 안내 토스트.
* **우선순위:** **Medium**

### 3.6 AI 전략 가이드 innerHTML과 catalog HTML

* **위치:** `assets/modules/features/ai/rendering.js` `renderModelGuide`, `renderResults`
* **문제:** `STRATEGY_CATALOG`의 `description`에 `<strong>` 등 HTML 포함 → `innerHTML` 삽입. catalog는 신뢰 소스이나, **사용자 제어 데이터가 섞이면 XSS 표면**.
* **영향:** 현재 catalog만 사용 시 위험 낮음. allowlist 회귀(`innerHTML allowlist regression`)로 파일 단위 관리 중.
* **근거:** `StrategyCatalog.js` description 필드; smoke assets allowlist.
* **권장 수정 방향:** catalog HTML은 `safeHtml` 헬퍼 일원화 유지; 사용자 문자열(memo, preset name)은 계속 `textContent`/`escapeHtml`.
* **우선순위:** **Low**

---

## 4. Potential Functional Gaps

### 확인된 문서 불일치

* **README “결과 화면의 재현 코드”** — 로또 번호 추천 결과 UI에 재현 코드 미표시. 폼의 “같은 번호 다시 만들기 코드”만 존재. (**문서 오류 또는 미구현 기능**)
* **Claude.md “dated one-off audit files may be absent”** — 본 `PROJECT_AUDIT.md`는 사용자 요청으로 신규 생성.

### 추정: 추가하면 좋은 기능

* **추정:** AI·Generator 결과에 `runtimeSeed`/재현 코드 자동 표시 및 복사 버튼 (Pension720 seed UX와 통일).
* **추정:** import merge 모드에서 `history`·`favorites` 상한 사전 preview (티켓·pension720은 import 전 검사 있음; history는 import 후 slice만 수행).
* **추정:** 오프라인 시 연금복권 official cache vs static 우선순위를 설정 화면에서 명시적 표시 (로직은 `pension720/stats.js`에 존재, UX는 부분적).
* **추정:** 다중 탭 동시 편집 시 “다른 탭에서 변경됨” 배너 (rehydrate는 있으나 사용자 메시지는 제한적).
* **추정:** `pension720/dom.js` 인코딩 깨짐은 Windows CRLF/에디터 저장 실수 가능 — pre-commit UTF-8 검사로 재발 방지.

### 테스트 공백 (CodeGraph “no covering tests”)

* `LottoApp`, `flushPendingLocalPersistence`, `formatTicket`, `StrategyWorkerClient` 일부 경로 — smoke·browser test로 간접 커버되나 **단위 테스트는 없음**.
* `pension720/dom.js` 문자열·인코딩 — **회귀 없음** (이번 감사의 주요 발견).

---

## 5. Recommended Fix Plan

### 1단계 — 즉시 수정 (기능 결함·사용자 영향)

1. `pension720/dom.js` 한글 라벨·`조` 단위 복구.
2. 회귀 추가: `formatTicket({group:5,number:'123456'})` → `5조 123456`, preset label `빠름`/`기본`/`정밀`.
3. README 수정: “결과 화면 재현 코드” → “설정의 같은 번호 다시 만들기 코드” 또는 결과 UI에 재현 코드 구현.

### 2단계 — 안정성 개선

1. `AiModule`에 `runToken` 도입 (Generator/Pension720 패턴 정렬); 완료 전 stale render 차단.
2. import 시 `customProxy` `validateCustomProxyUrl` 적용 및 preview 경고.
3. AI 결과에 `runtimeSeed` 표시(시드 미지정 시) 및 복사 UX.
4. 동기화 로그/설정에 서드파티 프록시 사용 여부 노출.

### 3단계 — 구조·품질 개선

1. cross-tab rehydrate 사용자 피드백 강화; 중요 state 변경 시 `save(true)` 정책 문서화.
2. CodeGraph blast radius 상위 심볼(`LottoApp.init`, `DataManager.load`, `importAll`) 최소 단위 테스트 또는 smoke 세분화.
3. innerHTML allowlist 외 영역 `escapeHtml` 감사 자동화(스크립트) 유지·확장.

---

## 6. Test Recommendations

### 신규·보강 회귀 (smoke)

| 테스트 | 검증 내용 |
|--------|-----------|
| `pension720-dom-encoding regression` | `dom.js` preset label, `formatTicket`, `appendDigitBalls` group 접미사 UTF-8 |
| `ai-run-stale-token regression` | 연속 `run()` 호출 시 이전 worker 응답이 DOM/state를 덮어쓰지 않음 |
| `ai-runtime-seed-surface regression` | 시드 미지정 추천 후 결과에 복사 가능한 seed/`runtimeSeed` 노출 (기능 구현 후) |
| `import-proxy-validation regression` | invalid `settings.customProxy` import 시 빈 값 정규화 또는 경고 |
| `import-merge-history-cap regression` | merge 후 `history.length <= MAX_HIST` 및 preview 메시지 |

### 브라우저(E2E) 보강

* `test:happy`에 연금복권 **복사 문자열** assertion (`5조 ######` 형식).
* 다중 탭 시나리오: 탭 A 저장 → 탭 B rehydrate 후 목록 일치 (Playwright 두 context).
* AI 연속 클릭/빠른 전략 변경 후 결과 개수·일관성.

### CI·품질 게이트

* UTF-8 BOM/깨진 한글 검사 스크립트 (`pension720/dom.js`, `utils/strings.js` 등).
* 기존 게이트 유지: `npm run lint`, smoke, `build:release`, data freshness checks (Claude.md verification 목록).

### 이미 양호한 영역 (유지)

* sync guard, proxy abort, worker timeout/cache-empty retry, import size/ticket cap, CSV formula escape, persistence flush on cross-tab, orphan campaign cleanup — smoke에서 PASS 확인 (2026-06-24).

---

## 부록: 감사 시 실행한 검증

```bash
node scripts/smoke/smoke.mjs   # 전체 PASS
npm run lint                   # PASS
```

CodeGraph MCP `codegraph_explore` 질의: `LottoApp initialization`, `import export backup`, `sync race cross tab`, `StrategyWorkerClient`, `cross tab rehydrate`, `pension720 dom encoding`.

---

*본 문서는 코드 수정 없이 감사 결과만 기록합니다. 발견 사항 중 “추정”은 구현 확인 없이 가능성으로 기재한 항목입니다.*

---

## 구현 완료 현황 (2026-06-24 후속 작업)

감사 §5·§6 권장 사항 중 E2E(다중 탭 Playwright)를 제외하고 코드·회귀·CI 반영을 완료했습니다.

| 항목 | 상태 |
|------|------|
| `pension720/dom.js` UTF-8 복구 | ✅ |
| AI `runToken` / stale render 차단 | ✅ |
| 번호 생성·추천·연금복권 재현 코드 UI | ✅ |
| import `customProxy` 검증·merge history preview | ✅ |
| cross-tab rehydrate 토스트 | ✅ |
| `check:utf8-korean`, `check:innerhtml-escape` | ✅ |
| LottoApp.init / DataManager.load / importAll smoke 세분화 | ✅ |
| PWA `CACHE_VERSION` `v30` | ✅ |

검증: `npm run lint`, `npm run check:utf8-korean`, `npm run check:innerhtml-escape`, smoke 116건+ PASS.