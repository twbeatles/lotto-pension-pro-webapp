# 잠재적 이슈 & 개선 필요 항목

> 최초 작성: 2026-03-16
> 최종 갱신: 2026-03-17 — 이 세션에서 식별된 모든 항목 처리 완료
> 기준 커밋: `a474ce8` (분석 기준) → 현재 main (처리 완료)
> 참조: `CLAUDE.md`, `README.md`, 전체 소스 정적 분석

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

### 🟠 [MEDIUM] `extractSingleDrawFromPayload()` 페이로드 구조 단정

**파일:** `assets/modules/core/data/sync.js`

커스텀 프록시가 예상 외 JSON 구조를 반환할 때 조용히 null을 반환하고 동기화가 성공한 것처럼 처리됨.
Content-Type 가드로 HTML 응답은 차단되지만, 유효한 JSON이지만 예상 필드가 없는 경우는 여전히 null 반환.

**잔존 위험:** 비정상 JSON 구조를 받은 경우 성공으로 오인될 수 있음 — 향후 명시적 경고 로그 추가 권장.

---

### ✅ [MEDIUM → DONE] 데이터 리스트 상태 새로고침 후 유실

**파일:** `assets/modules/core/app/dataLists.js`, `LottoApp.js`

`_persistDataListState()` 메서드를 추가해 검색어·페이지 번호를
`sessionStorage` (`lotto_pro_datalist_state`)에 저장.
`LottoApp` 생성자에서 `_loadDataListStateFromSession()`으로 복원.

---

### 🟠 [MEDIUM] 라우트 stale-check 적용 범위

**파일:** `assets/modules/core/app/moduleLoader.js`

`route()` 메서드 내 모든 탭(`bt`, `check`, `stats`)에 `isStale()` 체크가 적용되어 있음.
단, `refreshCurrentRoute()` 에는 stale 체크가 없어 동기화 완료 직후 빠른 탭 전환 시 이전 탭의 데이터가 잠깐 보일 수 있음.

**잔존 위험:** `refreshCurrentRoute()` 에 routeToken 기반 stale 체크 추가 권장.

---

### ✅ [LOW → DONE] 손상된 localStorage 데이터 콘솔 로그 없음

**파일:** `assets/modules/core/data/persistence.js`

`safeJsonParse()` 에 `label` 파라미터를 추가.
손상 감지 시 `[persistence] 손상된 데이터 감지 (${label})` 메시지를 콘솔에 출력.
모든 `safeJsonParse()` 호출에 key 라벨을 전달하도록 수정.

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

### 🟡 [LOW] 백테스트 결과 차트 없음

백테스트는 텍스트/표 결과만 제공.
CSS 기반 단순 바 차트 또는 SVG inline 차트로 다중 전략 비교 시 직관성을 높일 수 있음.

**잔존:** 향후 개선 과제로 유지.

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

---

## 5. 남은 과제 (향후 권장)

| 우선순위 | 내용 | 위치 |
|----------|------|------|
| 🟠 MEDIUM | `extractSingleDrawFromPayload()` 비정상 구조 명시적 경고 | `sync.js` |
| 🟠 MEDIUM | `refreshCurrentRoute()` stale 체크 추가 | `moduleLoader.js` |
| 🟡 LOW | 백테스트 결과 시각화 (CSS/SVG 바 차트) | `features/backtest/` |
| 🟡 LOW | 번호 공 `aria-label` 추가 | `UIManager.js` |
| 🟡 LOW | 스모크 테스트에 `MISSING_DRAWS` 처리 검증 추가 | `scripts/smoke/` |

---

*변경 후 반드시 `npm run lint` 와 `node scripts/smoke/smoke.mjs` 를 실행하세요.*
