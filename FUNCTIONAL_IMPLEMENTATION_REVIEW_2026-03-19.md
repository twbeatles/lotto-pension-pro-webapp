# 기능 구현 점검 보고서 (2026-03-19)

참조 문서:

- `README.md`
- `claude.md`

검증 범위:

- 프로젝트 구조 및 핵심 기능 모듈 정적 리뷰
- `npm run lint` 실행
- `node scripts/smoke/smoke.mjs` 실행
- 잔존 리스크 3건 직접 재현

결론:

- 점검 시점 기준 자동화 검증은 통과했지만, 실사용 흐름에서 늦게 드러나는 기능 리스크 3건이 확인됐습니다.
- 현재 main 기준으로 본 문서의 우선순위 이슈와 추가 권장 항목은 모두 반영 완료했습니다.
- 아래 본문은 최초 점검 내용을 보존하며, 바로 아래 `상태 업데이트`에 반영 결과를 요약합니다.

---

## 상태 업데이트 (2026-03-19)

same-day 후속 작업으로 아래 항목을 반영했습니다.

- 목표 회차 기본값 자동 추적 + 재설정 버튼 추가
- `refreshCurrentRoute()` stale guard 추가
- `SYNC_FETCH_ONE_INVALID_PAYLOAD` 로그 및 `syncMeta.lastWarningMessage` 저장
- `localUpdates` key 중앙화, 손상 진단 보강, 데이터 관리 화면 정리 UI 추가
- QR 스캐너 모달 backdrop 닫기 및 `check` 라우트 이탈 cleanup 추가
- 회귀 테스트 추가:
  - `target-draw autofill`
  - `refreshCurrentRoute stale`
  - `sync invalid payload`
  - `qr route cleanup`

후속 반영 후 `npm run lint`, `node scripts/smoke/smoke.mjs`를 다시 통과했습니다.

---

## 1. 실행 결과

### 자동 검증

- `npm run lint`: 통과
- `node scripts/smoke/smoke.mjs`: 통과

### 해석

- 기존 회귀 항목은 잘 방어되고 있습니다.
- 현재 남은 문제는 "기능이 완전히 깨지는 수준"보다는, 사용자 행동과 타이밍이 겹칠 때 오동작하거나, 문제 발생 시 원인 파악이 어려운 유형입니다.

---

## 2. 우선순위 이슈

### [MEDIUM] 최신 회차 동기화 후에도 티켓 목표 회차 기본값이 갱신되지 않음

위치:

- `assets/modules/core/app/latestDraw.js:58`
- `assets/modules/core/app/latestDraw.js:63`

현상:

- `updateLatestWin()`은 `genTargetDrawNo`, `campStartDraw`, `aiTargetDrawNo`를 비어 있을 때만 `latest.draw_no + 1`로 채웁니다.
- 한 번 값이 들어가면 이후 최신 회차가 올라가도 기본값이 그대로 남습니다.

재현:

1. 최신 회차가 `1209`일 때 화면이 열리면 기본값이 `1210`으로 채워짐
2. 이후 동기화로 최신 회차가 `1210`이 되어도 입력값은 여전히 `1210`
3. 사용자가 별도 수정 없이 티켓 저장/캠페인 생성/AI 티켓 저장을 하면 이미 지난 회차를 기본 목표 회차로 쓸 수 있음

영향:

- 티켓북 저장 기본값이 실제 다음 회차를 따라가지 않음
- 캠페인 시작 회차 기본값도 stale 상태로 남을 수 있음
- 사용자는 최신 데이터가 반영됐다고 생각하지만 저장 대상 회차는 이전 상태일 수 있음

권장:

- 입력값이 "자동 채움 상태"인지 추적하는 플래그를 두고, 사용자가 직접 수정하지 않은 경우에만 최신 회차 기준으로 자동 갱신
- 최소한 동기화 성공 직후 기본값이 최신 회차보다 작으면 갱신

---

### [MEDIUM] `refreshCurrentRoute()`에 stale guard가 없어 탭 전환 경합 시 이전 탭 렌더가 뒤늦게 실행될 수 있음

위치:

- `assets/modules/core/app/moduleLoader.js:143`
- `assets/modules/core/app/moduleLoader.js:148`
- `assets/modules/core/app/moduleLoader.js:153`
- `assets/modules/core/app/moduleLoader.js:157`

현상:

- `route()`는 `routeToken` 기반 `isStale()` 체크가 있습니다.
- 반면 `refreshCurrentRoute()`는 async `ensureModule()` 이후 현재 라우트가 바뀌었는지 다시 확인하지 않습니다.

재현:

1. `currentRoute = 'stats'` 상태에서 `refreshCurrentRoute()` 시작
2. `ensureModule('stats')` 대기 중 사용자가 다른 탭으로 이동
3. Promise가 풀리면 `stats.render()`가 그대로 실행됨

영향:

- 동기화 직후 `app.refreshCurrentRoute()`가 돌 때 사용자가 빠르게 다른 탭으로 이동하면 이전 탭 렌더가 뒤늦게 섞일 수 있음
- 현재 구조상 `sync.js`에서 동기화 성공 후 `await this.app?.refreshCurrentRoute()`를 호출하므로 실제 발생 가능성이 있습니다

권장:

- `refreshCurrentRoute()`에도 `routeToken` 또는 local token 기반 stale guard 추가
- `const token = ++this.routeTokenRefresh` 같은 별도 토큰을 두거나, `const expected = this.currentRoute` 후 await 뒤 `if (expected !== this.currentRoute) return`

---

### [MEDIUM] 단건 동기화 payload 구조가 예상과 다르면 조용히 실패하여 원인 파악이 어려움

위치:

- `assets/modules/core/data/sync.js:286`
- `assets/modules/core/data/sync.js:313`
- `assets/modules/core/data/sync.js:314`

현상:

- `extractSingleDrawFromPayload()`는 지원하는 shape가 아니면 `null`만 반환합니다.
- `fetchOneDraw()`는 `item`이 `null`일 때 별도 경고 없이 다음 후보로 넘어가거나 최종적으로 `null`을 반환합니다.
- 즉, "JSON 파싱은 됐지만 구조가 다름" 상황이 로그 없이 묻힙니다.

확인:

- `DataManager.prototype.extractSingleDrawFromPayload.call(...)`에 예상 외 객체를 넣어도 `null`만 반환되고 로그가 남지 않음을 확인했습니다.

영향:

- 프록시/우회 소스 응답 포맷이 조금만 달라져도 사용자는 "최신 회차를 확인하지 못했습니다"만 보게 됨
- 운영 중 장애가 나도 원인이 응답 구조인지, 데이터 값인지, 네트워크인지 구분하기 어려움

권장:

- `extractSingleDrawFromPayload()`에서 shape mismatch를 명시적으로 분기하고, `drawNo`, `source`, key 목록 정도를 로그에 남기기
- `fetchOneDraw()`에서 `payload !== null && item === null`인 경우 `SYNC_FETCH_ONE_INVALID_PAYLOAD` 같은 코드로 경고 남기기

---

## 3. 낮은 우선순위지만 보완 가치가 있는 항목

### [LOW] `localUpdates` 손상 시 복구는 되지만 진단 정보가 부족함

위치:

- `assets/modules/core/data/persistence.js:211`
- `assets/modules/core/data/persistence.js:217`

현상:

- `getLocalUpdates()`는 `safeJsonParse()`를 쓰지만 label 없이 호출합니다.
- 손상 데이터가 있어도 fallback은 되지만 어떤 storage key가 문제였는지 로그로 남지 않습니다.

영향:

- 로컬 업데이트 손상 시 사용자는 "최신 회차 일부가 사라진 것처럼" 느낄 수 있는데, 콘솔에서 바로 식별하기 어렵습니다.

권장:

- `safeJsonParse(..., 'lotto_pro_updates_v2')` 형태로 label 추가
- 가능하면 key 문자열도 `CONFIG.KEYS`로 중앙화

---

### [LOW] 최신 회차 추정 로직이 고정 시간 휴리스틱이라 draw 공개 지연/예외 일정에 취약함

위치:

- `assets/modules/utils/utils.js:34`
- `assets/modules/utils/utils.js:38`

현상:

- `estimateLatestDrawKST()`는 매주 7일 간격, 토요일 21:00 KST 고정 컷오프로 최신 회차를 추정합니다.

영향:

- 실제 공개 시점이 지연되거나 일정이 예외적으로 바뀌면 stale 경고와 자동 동기화 대상 회차가 한 회차 앞설 수 있음
- 즉시 치명적 버그는 아니지만, "업데이트 필요" 경고의 신뢰도를 떨어뜨릴 수 있습니다

권장:

- 현재 방식은 유지하되, UI 문구를 "예상 최신 회차 기준"으로 더 명확히 표현
- 가능하면 공식 응답에서 최신 회차 존재 여부를 확인한 뒤 stale 상태를 확정하는 2단계 판정 고려

---

### [LOW] QR 스캐너 수명 주기가 모달 닫기/성공 처리 중심이라 경로 이탈 시 카메라 정리가 약함

위치:

- `assets/modules/features/QrScanner.js:14`
- `assets/modules/features/QrScanner.js:43`
- `assets/modules/features/QrScanner.js:83`

현상:

- 스캐너 정지는 `닫기 버튼` 또는 `스캔 성공` 흐름에만 명시적으로 묶여 있습니다.
- 현재 라우팅 코드에는 "check 탭 이탈 시 scanner stop" 같은 정리 훅이 없습니다.

영향:

- 사용자가 스캔 중 다른 탭으로 이동하는 경우 카메라 세션이 남을 가능성이 있습니다.

권장:

- `route()`에서 `target !== 'check'`일 때 `this.qr?.stop?.()` 호출 검토
- 모달 배경 클릭 닫기까지 지원하면 정리 지점이 더 명확해집니다

---

## 4. 추가하면 좋은 항목

### 우선 추가 권장 테스트

1. 최신 회차 동기화 후 `genTargetDrawNo`, `campStartDraw`, `aiTargetDrawNo` 기본값 자동 갱신 회귀 테스트
2. `refreshCurrentRoute()` 실행 중 라우트 변경 시 이전 탭 렌더가 실행되지 않는지 회귀 테스트
3. `fetchOneDraw()`에 "JSON은 정상이나 구조가 다른 payload" 입력 시 경고 로그가 남는지 테스트
4. QR 스캐너 실행 중 다른 탭 이동 시 `stop()`이 호출되는지 테스트

### 기능 추가 관점 권장

1. "다음 회차 기본값으로 재설정" 버튼을 생성/AI/캠페인 영역에 추가
2. 데이터 관리 화면에 `localUpdates` 개수와 정리 액션 노출
3. 설정 모달 sync 상태에 "마지막 응답 구조 오류" 같은 진단 메타 추가

---

## 5. 현재 잘 되어 있는 부분

- lint/smoke 기준으로 기존 회귀 이슈들은 잘 방어되고 있음
- 동기화 single-flight, cancel, 자동 fallback 흐름은 비교적 안정적임
- import 후 refresh 순서, campaign cascade, proxy 정책, data list pagination은 회귀 테스트가 이미 잘 깔려 있음
- 서비스워커는 core data precache와 explicit update acceptance 정책이 반영되어 있음

---

## 6. 최종 판단

지금 상태는 "기본 기능은 충분히 동작하는 상태"입니다.

다만 아래 3개는 다음 작업 우선순위로 두는 편이 맞습니다.

1. 최신 회차 동기화 후 목표 회차 기본값 자동 갱신
2. `refreshCurrentRoute()` stale guard 추가
3. 단건 동기화 payload mismatch 진단 로그 추가

현재는 위 3개를 포함해 본 문서의 제안 사항을 모두 반영한 상태입니다.
