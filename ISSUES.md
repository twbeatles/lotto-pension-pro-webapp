# 잠재적 이슈 & 개선 필요 항목

> 최초 작성: 2026-03-16
> 최종 갱신: 2026-04-14 — 구조 분할 리팩토링 및 문서 동기화 반영
> 기준 커밋: `a474ce8` (분석 기준) → 현재 main (처리 완료)
> 참조: `claude.md`, `README.md`, `PROJECT_ANALYSIS.md`, 전체 소스 정적 분석

---

## 1. 심각도 기준

| 레벨 | 기준 |
|------|------|
| 🔴 HIGH | 데이터 유실 또는 런타임 크래시 가능 |
| 🟠 MEDIUM | 사용자 혼란 또는 잘못된 데이터 표시 |
| 🟡 LOW | 접근성·성능·UX 미흡 |
| 🟢 GOOD | 현재 잘 동작하는 것 (참고용) |
| ✅ DONE | 처리 완료 |

---

## 2. 기능 구현 버그 / 잠재적 문제

### ✅ [HIGH → DONE] stale `checked` 티켓이 최신 당첨 데이터 기준으로 재검증되지 않음

**파일:** `assets/modules/core/data/analytics.js`, `assets/modules/core/data/sync.js`, `assets/modules/features/dataio/postImportRefresh.js`

`reconcileTicketChecks()` 를 추가해 현재 `winningStats` 기준으로 티켓 전체를 다시 평가하도록 수정.
해당 회차 결과가 아직 없거나 최신 회차가 티켓 회차에 도달하지 않았으면 `checked` 를 제거하고 `pending` 으로 되돌림.
이 재정합성은 앱 초기 로드, sync 직후, Import 후 post-refresh, 로컬 업데이트 정리 후 재적재 경로에서 공통 적용.

회귀 테스트 `ticket-reconcile`, `clear-local-updates reconcile` 추가 완료.

---

### ✅ [HIGH → DONE] 미래 회차 `localUpdates` 가 최신성 판단과 sync 메타를 오염시킬 수 있음

**파일:** `assets/modules/core/data/persistence.js`, `assets/modules/core/data/sync.js`

`sanitizeLocalUpdates()` 로 로컬 업데이트 정규화, 회차 dedupe, 정렬, 미래 회차 방어를 중앙화.
허용 상한은 `estimateLatestDrawKST() + 2`.
상한을 넘는 항목은 저장하지 않고 제외하며, `syncMeta.lastSuccessDrawNo` 도 `winningStats` 재구성 후 실제 유효 최신 회차로 clamp 되도록 보강.

회귀 테스트 `future local-updates guard`, `clear-local-updates reconcile` 추가 완료.

---

### ✅ [MEDIUM → DONE] 티켓 삭제 후 orphan campaign 이 남을 수 있음

**파일:** `assets/modules/core/data/records.js`, `assets/modules/core/app/dataLists.js`, `assets/modules/features/dataio/importExport.js`

`pruneOrphanCampaigns()` 공용 로직을 도입해 Import뿐 아니라 개별 티켓 삭제와 전체 티켓 정리 후에도 orphan campaign 을 자동 제거.
사용자 toast 에는 자동 정리된 캠페인 수가 함께 표시되도록 정리.

회귀 테스트 `orphan-campaign auto-cleanup`, `import orphan-campaign cleanup` 추가 완료.

---

### ✅ [MEDIUM → DONE] 히스토리 dedupe 로 실제 생성/가져오기 로그가 손실됨

**파일:** `assets/modules/core/data/records.js`, `assets/modules/features/generator/actions.js`, `assets/modules/features/dataio/importExport.js`

`history` 저장 정책을 번호 unique 스냅샷이 아니라 actual-log 기준으로 변경.
`saveAll()` 은 중복 번호도 그대로 기록하고, Import merge 도 기존 + incoming 로그를 날짜 내림차순으로 합치며 duplicate 를 유지.
`favorites` 는 기존대로 번호 unique 정책을 유지.

회귀 테스트 `history actual-log` 추가 완료.

---

### ✅ [HIGH → DONE] 티켓북 중복 row 정책이 실제 구매 수량을 표현하지 못함

**파일:** `assets/modules/core/data/records.js`, `assets/modules/core/app/dataLists.js`, `assets/modules/features/Check.js`, `assets/modules/features/generator/*`, `assets/modules/features/ai/form.js`

티켓북 저장 모델을 grouped row + `quantity` 구조로 전환.
동일 key(`targetDrawNo + source + campaignId + numbers + strategyRequest`)는 새 row 대신 기존 row 의 수량만 증가.
티켓 삭제/캠페인 삭제/저장소 요약/확인 UI 는 모두 실제 물리 티켓 수량 기준으로 계산되며, 목록과 확인 탭에는 `xN` 배지가 표시됨.

회귀 테스트 `ticket-quantity grouping` 추가 완료.

---

### ✅ [HIGH → DONE] Import 후 `syncMeta` 가 현재 유효 데이터셋과 어긋날 수 있음

**파일:** `assets/modules/core/data/persistence.js`, `assets/modules/core/data/sync.js`, `assets/modules/features/dataio/postImportRefresh.js`

`syncMeta` 는 계속 backup/export 대상에서 제외하고, Import 완료 후 `fetchWinningStats()` 로 복원된 effective draw 기준으로 `markLocalRestoreSuccess()` 를 호출해 `syncMeta.mode = local_restore` 로 재구성.
`lastSuccessDrawNo`, `currentSource`, `lastSuccessAt` 도 현재 유효 데이터 기준으로 다시 기록됨.

회귀 테스트 `local-restore sync-meta` 추가 완료.

---

### ✅ [HIGH → DONE] 정적 JSON 실패 시 앱이 full/stale/partial 상태를 구분하지 못함

**파일:** `assets/modules/core/data/defaults.js`, `assets/modules/core/data/sync.js`, `assets/modules/core/data/analytics.js`, `assets/modules/core/app/moduleLoader.js`, `assets/modules/core/app/settingsPanel.js`

비영속 `dataHealth` 상태를 도입하고 `full | partial | none` 을 구분.
정적 JSON 실패 시에도 `localUpdates` 만으로 `winningStats` 를 복원할 수 있게 했으며, cold start 에서는 최근 `24`회 기준 partial recovery 를 시도.
`stats`, `ai`, `bt` 는 partial/none 상태에서 공통 gate panel 을 보여주고, `gen` / `check` 는 warning banner 만 표시한 채 계속 사용 가능.

회귀 테스트 `partial winning-stats recovery`, `route data-gate` 추가 완료.

---

### ✅ [MEDIUM → DONE] PWA 멀티탭 업데이트가 activation 전 조기 reload 될 수 있음

**파일:** `assets/modules/bootstrap/pwa.js`

BroadcastChannel 전파 시점을 업데이트 버튼 클릭 시점이 아니라 새 서비스워커 activation 이후(`controllerchange`)로 이동.
initiating tab 은 activation 완료 후 self reload + `SW_ACTIVATED` 브로드캐스트를 보내고, 다른 탭은 그 신호를 받은 뒤에만 reload.

회귀 테스트 `service-worker reload policy` 갱신 완료.

---

### ✅ [HIGH → DONE] localStorage.setItem() 예외 처리

**파일:** `assets/modules/core/data/persistence.js`

`_safeSetItem()` 헬퍼를 추가해 모든 `setItem` 호출을 통일.
`QuotaExceededError` 발생 시 사용자에게 toast 경고를 표시.
`_checkStorageQuotaWarning()`으로 사용량 임계치(`STORAGE_WARNING_BYTES`, `STORAGE_DANGER_BYTES`) 초과 시 세션 당 한 번 자동 경고.

---

### ✅ [HIGH → DONE] 네트워크 응답 Content-Type 검증

**파일:** `assets/modules/core/data/sync.js`

`fetchRangeFromProxy()` 에 Content-Type 검증을 추가.
`application/json` / `text/plain` / `text/json` 이 아닌 응답을 조기 차단해 HTML 에러 페이지 파싱 시도를 방지.

---

### ✅ [MEDIUM → DONE] 동기화 race condition — 프록시 fingerprint 가드

**파일:** `assets/modules/core/data/sync.js`

`_syncInFlightProxyFingerprint` 로 현재 프록시 설정을 비교.
설정이 바뀐 경우 기존 in-flight 요청을 취소하고 새 요청을 시작.
설정이 같을 때만 기존 Promise를 반환해 중복 요청 방지.

---

### ✅ [MEDIUM → DONE] `winningStats` 배열 null 가드

**파일:** `assets/modules/core/app/latestDraw.js`

`Array.isArray(this.data.state.winningStats)` 체크를 추가해
배열 자체가 null/undefined인 엣지케이스에서 TypeError를 방지.

---

### ✅ [MEDIUM → DONE] `extractSingleDrawFromPayload()` 페이로드 구조 진단

**파일:** `assets/modules/core/data/sync.js`

`fetchOneDraw()` 에서 JSON 파싱은 성공했지만 지원하지 않는 구조인 경우
`SYNC_FETCH_ONE_INVALID_PAYLOAD` 로그를 남기도록 수정.
`syncMeta.lastWarningAt` / `syncMeta.lastWarningMessage` 도 함께 저장해
설정 모달에서 최근 응답 구조 경고를 확인할 수 있음.

---

### ✅ [MEDIUM → DONE] 데이터 리스트 상태 새로고침 후 유실

**파일:** `assets/modules/core/app/dataLists.js`, `LottoApp.js`

`_persistDataListState()` 메서드를 추가해 검색어·페이지 번호를
`sessionStorage` (`lotto_pro_datalist_state`)에 저장.
`LottoApp` 생성자에서 `_loadDataListStateFromSession()`으로 복원.

---

### ✅ [MEDIUM → DONE] `refreshCurrentRoute()` stale-check 보강

**파일:** `assets/modules/core/app/moduleLoader.js`

`refreshCurrentRoute()` 에 현재 `routeToken` 기준 stale guard를 추가.
동기화 직후 async 렌더가 늦게 돌아오더라도 이미 다른 탭으로 이동한 경우
이전 탭 렌더가 뒤늦게 섞이지 않음.

회귀 테스트 `refreshCurrentRoute stale` 추가 완료.

---

### ✅ [MEDIUM → DONE] 최신 회차 동기화 후 목표 회차 기본값 stale 상태

**파일:** `assets/modules/core/LottoApp.js`, `assets/modules/core/app/latestDraw.js`, `index.html`

`genTargetDrawNo`, `campStartDraw`, `aiTargetDrawNo` 는
사용자가 직접 수정하지 않은 경우 최신 회차 기준 다음 회차를 계속 추적.
각 입력 옆에 `다음 회차로 재설정` 버튼도 추가.

회귀 테스트 `target-draw autofill` 추가 완료.

---

### ✅ [LOW → DONE] 손상된 localStorage 데이터 콘솔 로그 없음

**파일:** `assets/modules/core/data/persistence.js`

`safeJsonParse()` 에 `label` 파라미터를 추가.
손상 감지 시 `[persistence] 손상된 데이터 감지 (${label})` 메시지를 콘솔에 출력.
모든 `safeJsonParse()` 호출에 key 라벨을 전달하도록 수정.
`localUpdates` 저장소도 `CONFIG.KEYS.LOCAL_UPDATES` 키로 중앙화.

---

### ✅ [LOW → DONE] 설정 모달 포커스 폴백 없음

**파일:** `assets/modules/core/app/settingsPanel.js`

`openSettingsModal()` 에서 `#closeSettingsBtn` 부재 시
모달 내 첫 번째 포커스 가능 요소 → 모달 자체 순으로 포커스 폴백.

---

### ✅ [LOW → DONE] WebWorker 타임아웃 모바일 미적응

**파일:** `assets/modules/core/StrategyWorkerClient.js`

`getNetworkSlowFactor()` 함수를 추가.
`navigator.connection.effectiveType` 기반으로 2G → ×2.5, 3G → ×1.5 배 타임아웃 자동 확장.
Cap은 `GENERATE_TIMEOUT_CAP_MS` / `RECOMMEND_TIMEOUT_CAP_MS` 유지.

---

### ✅ [LOW → DONE] Ball 렌더링 캐시 LRU 없음

**파일:** `assets/modules/core/UIManager.js`

캐시 1000개 초과 시 전체 초기화 → 200개 단위 점진적 제거로 변경.
캐시 히트율 급락 없이 메모리를 관리.

---

## 3. 추가·개선 기능

### ✅ [MEDIUM → DONE] 누락 회차(146번) config 상수화

**파일:** `assets/modules/utils/config.js`

`CONFIG.LIMITS.MISSING_DRAWS = [146]` 상수를 추가.
향후 통계/백테스트에서 누락 회차를 명시적으로 제외할 때 이 상수를 참조.

---

### ✅ [MEDIUM → DONE] 오프라인 상태 배너 없음

**파일:** `index.html`, `LottoApp.js`

`#offlineBanner` 요소를 `index.html` 상단 고정 위치에 추가.
`_bindOfflineBanner()` 에서 `online` / `offline` 이벤트로 표시/숨김 처리.
오프라인 진입/복귀 시 toast도 함께 표시.

---

### ✅ [MEDIUM → DONE] localStorage 사용량 경고 임계치 없음

**파일:** `assets/modules/core/data/persistence.js`

`_checkStorageQuotaWarning()` 메서드를 추가.
저장 후 `STORAGE_WARNING_BYTES` 도달 시 경고 toast, `STORAGE_DANGER_BYTES` 도달 시 에러 toast.
세션 당 각각 한 번씩 표시 (`_quotaWarnShown`, `_quotaWarnShownWeak` 플래그).

---

### ✅ [LOW → DONE] PWA 설치 프롬프트 유도 없음

**파일:** `LottoApp.js`, `index.html`

`_bindPwaInstallPrompt()` 에서 `beforeinstallprompt` 이벤트를 캡처.
지원 시 사이드바에 `#pwaInstallBtn` 이 표시되며 클릭 시 브라우저 설치 프롬프트를 호출.
`appinstalled` 이벤트 수신 후 버튼 자동 숨김.

---

### ✅ [LOW → DONE] 서비스워커 Broadcast Channel 미사용

**파일:** `assets/modules/bootstrap/pwa.js`

`BroadcastChannel('lotto-sw-update')` 도입.
한 탭에서 SW 업데이트를 수락하면 모든 열린 탭이 reload 신호를 수신해 동시에 갱신.

---

### ✅ [LOW → DONE] 접근성(a11y) 기초 항목

| 항목 | 처리 결과 |
|------|-----------|
| toast `aria-live` 없음 | `#toast-live-region` (`aria-live="polite"`) 추가, toast에 `role="status"` |
| 모달 `aria-modal` 없음 | 기존 마크업에 이미 `role="dialog" aria-modal="true"` 적용 확인 — 변경 없음 |
| 설정 모달 포커스 관리 | 폴백 포커스 로직 추가 (위 항목 참조) |

---

### ✅ [LOW → DONE] `localUpdates` 진단/정리 UI 부재

**파일:** `assets/modules/core/app/dataLists.js`, `assets/modules/core/data/persistence.js`, `assets/modules/utils/config.js`, `index.html`

데이터 관리 화면에 로컬 최신 회차 업데이트 개수와 정리 버튼을 추가.
정리 시 runtime override 를 비우고 `winningStats` 를 재구성.
설정 모달 저장소 요약에도 해당 개수가 반영됨.

---

### ✅ [LOW → DONE] QR 스캐너 경로 이탈 시 정리 약함

**파일:** `assets/modules/features/QrScanner.js`, `assets/modules/core/app/moduleLoader.js`

스캔 모달 바깥 클릭으로 닫기 지원.
`check` 라우트 이탈 시 활성 스캐너를 정리하도록 보강.

회귀 테스트 `qr route cleanup` 추가 완료.

---

### ✅ [LOW → DONE] 백테스트 결과 시각화 추가

**파일:** `assets/modules/features/backtest/ui.js`, `assets/styles/modals.css`, `index.html`

백테스트 요약 카드에 ROI/적중률/총상금 기준 미니 차트를 추가.
탭 재진입 시에도 마지막 결과와 함께 재렌더링되도록 상태 유지 로직도 함께 보강.

---

### ✅ [LOW → DONE] 번호 공 / 스테퍼 접근성 라벨

**파일:** `assets/modules/core/UIManager.js`, `index.html`

번호 공 렌더링에 `aria-label` / `title` 추가.
생성 개수 스테퍼 버튼에도 명시적 접근성 라벨을 부여.

---

### ✅ [MEDIUM → DONE] 공용 확인 모달 및 포커스 트랩

**파일:** `assets/modules/core/UIManager.js`, `assets/modules/core/app/dataLists.js`, `assets/modules/utils/strategyPresets.js`, `index.html`

네이티브 `confirm()`/`prompt()` 의존 구간을 공용 async 다이얼로그로 치환.
모달 최초 포커스, `Tab` 트랩, `Escape` 닫기, 닫힌 뒤 호출 버튼 포커스 복귀를 공통 처리.

---

### ✅ [MEDIUM → DONE] 당첨 확인 탭 모바일 선택 UI 재구성

**파일:** `assets/modules/features/Check.js`, `index.html`, `assets/styles/pages.css`, `assets/styles/responsive.css`

`size="10"` 기반 네이티브 선택 UI를 카드형 리스트로 교체.
검색, 티켓 상태 필터, 키보드 탐색, 스캔 결과 고정 노출, 모바일 단일 컬럼 흐름을 지원.

---

### ✅ [MEDIUM → DONE] 모바일 내비 `5탭 + 더보기` 구조 정리

**파일:** `assets/modules/core/LottoApp.js`, `index.html`, `assets/styles/responsive.css`

모바일 하단 탐색을 `생성/통계/예측/확인/데이터 + 더보기` 구조로 단순화.
`더보기` 시트에서 `시뮬레이션`, `설정`, `앱 설치`에 접근 가능.

---

## 4. 현재 잘 동작하는 것

| 항목 | 위치 |
|------|------|
| 🟢 오프라인 fallback 체인 (정적 JSON → localUpdates) | `sync.js` |
| 🟢 동기화 중복 방지 single-flight + proxy fingerprint 가드 | `sync.js` |
| 🟢 XSS 방어 — HTML escaping 일관 적용 | `dataLists.js`, `UIManager.js` |
| 🟢 저장 디바운스 + requestIdleCallback | `persistence.js` |
| 🟢 pagehide/visibilitychange flush | `persistence.js` |
| 🟢 Worker 타임아웃 + 재시도 + 모바일 네트워크 적응 | `StrategyWorkerClient.js` |
| 🟢 시스템 알림 권한 3-state 처리 | `analytics.js` |
| 🟢 SW 업데이트 skipWaiting 수락 후 멀티탭 reload | `pwa.js` |
| 🟢 프록시 URL 포맷 화이트리스트 검증 | `persistence.js` |
| 🟢 캠페인 삭제 cascade | `records.js` |
| 🟢 데이터 리스트 상태 sessionStorage 유지 | `dataLists.js`, `LottoApp.js` |
| 🟢 오프라인 배너 reactive 표시 | `LottoApp.js`, `index.html` |
| 🟢 QuotaExceededError 사용자 toast 안내 | `persistence.js` |
| 🟢 목표 회차 기본값 자동 추적 + 재설정 버튼 | `LottoApp.js`, `latestDraw.js`, `index.html` |
| 🟢 단건 동기화 payload 구조 경고 + 설정 모달 노출 | `sync.js`, `settingsPanel.js` |
| 🟢 `refreshCurrentRoute()` stale guard | `moduleLoader.js` |
| 🟢 로컬 업데이트 정리 UI | `dataLists.js`, `index.html` |
| 🟢 QR 스캐너 route exit cleanup | `QrScanner.js`, `moduleLoader.js` |
| 🟢 공용 확인 모달 + 포커스 트랩 | `UIManager.js`, `dataLists.js`, `strategyPresets.js` |
| 🟢 백테스트 결과 유지 + 미니 차트 | `features/backtest/ui.js` |
| 🟢 체크 탭 카드형 리스트 + 키보드 탐색 | `Check.js`, `index.html`, `assets/styles/*` |
| 🟢 모바일 하단 `5탭 + 더보기` | `LottoApp.js`, `index.html`, `responsive.css` |
| 🟢 PWA 설치 CTA 다중 진입점 | `LottoApp.js`, `index.html` |

---

## 5. 남은 과제 (향후 권장)

| 우선순위 | 내용 | 위치 |
|----------|------|------|
| 🟡 LOW | 공용 확인 모달/모바일 더보기 직접 상호작용 스모크 추가 | `scripts/smoke/` |
| 🟡 LOW | 스모크 테스트에 `MISSING_DRAWS` 처리 검증 추가 | `scripts/smoke/` |
| 🟡 LOW | `MODULE_TYPELESS_PACKAGE_JSON` 경고 정리 여부 검토 | `package.json`, Node 실행 정책 |

---

*변경 후 반드시 `npm run lint` 와 `node scripts/smoke/smoke.mjs` 를 실행하세요.*
