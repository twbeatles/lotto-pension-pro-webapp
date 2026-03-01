# 기능 구현 리스크 점검 보고서 (2026-03-01)

## 점검 기준
- 참조 문서: `README.md`, `claude.md`
- 점검 범위: `index.html`, `sw.js`, `assets/modules/**`, `assets/*.worker.js`, `scripts/smoke`, `scripts/perf`
- 수행 검증:
  - `node scripts/smoke/smoke.mjs` 통과
  - `node scripts/perf/bench.mjs` 통과
  - 전체 JS 파싱 검사(`node --check`) 통과

## 요약
- 즉시 수정 권장: 2건
  - 필터 무시 조합이 생성되는 문제
  - 백업 Import 경유 XSS 가능성
- 단기 보완 권장: 3건
  - Import 후 최신 회차 반영 지연
  - 회차 데이터 정규화 검증 부족(중복 번호 허용)
  - 오프라인 캐시 누락(`backup.js`)

---

## 1) [High] 필터 조건을 위반한 조합이 반환될 수 있음
- 근거 코드:
  - `assets/modules/core/StrategyEngine.js:389`
  - `assets/modules/core/StrategyEngine.js:410`
- 문제:
  - `generateSetWithExecution()`이 필터 통과 조합을 못 찾으면 마지막에 필터 검증 없이 랜덤 조합을 반환합니다.
- 재현:
  - 불가능한 필터(`sumRange: [1,10]`)로 생성해도 결과가 반환됨.
  - 확인 결과 예시: 합계 163/151/175 조합이 반환되고 `passesFilters === false`.
- 영향:
  - Generator/AI/Backtest 결과가 사용자 설정 필터를 위반할 수 있어 신뢰도가 떨어집니다.
- 권장 수정:
  - 마지막 fallback에서 `null`을 반환하고, 상위 호출부에서 "조건을 완화하세요" 메시지 및 생성 부족 수량을 명시.
  - "보완 랜덤 생성"이 필요하면 UI에 명시적 배지/카운트 표시.

## 2) [High] 백업 파일 Import 경유 Stored XSS 가능성
- 근거 코드:
  - `assets/modules/core/DataManager.js:336`
  - `assets/modules/core/LottoApp.js:497`
  - `assets/modules/features/DataIO.js:133`
- 문제:
  - `campaign.name`이 문자열 길이만 제한되고 HTML 이스케이프 없이 `innerHTML`로 렌더링됩니다.
- 영향:
  - 악성 백업 JSON을 Import하면 스크립트가 실행될 수 있습니다.
- 권장 수정:
  - `innerHTML` 템플릿 대신 `textContent` 기반 DOM 조립으로 전환.
  - 최소한 렌더 직전 escape 유틸 적용.

## 3) [Medium] Import한 localUpdates가 즉시 화면/통계에 반영되지 않음
- 근거 코드:
  - `assets/modules/features/DataIO.js:195`
  - `assets/modules/features/DataIO.js:228`
  - `assets/modules/features/DataIO.js:241`
- 문제:
  - Import에서 `setLocalUpdates()`는 수행하지만, 이후 `fetchWinningStats()`/`updateLatestWin()`를 호출하지 않습니다.
- 영향:
  - 사용자는 Import 직후 최신 회차/통계 반영을 보지 못하고, 재시작/수동 동기화 전까지 상태가 stale일 수 있습니다.
- 권장 수정:
  - Import 완료 후 아래 순서 추가:
    - `await this.data.fetchWinningStats({ notifyTicketSettle: false })`
    - `this.app.updateLatestWin?.()`
    - `await this.app.refreshCurrentRoute?.()`

## 4) [Medium] 회차 데이터 정규화에서 중복 번호가 허용됨
- 근거 코드:
  - `assets/modules/core/DataManager.js:911`
  - `assets/modules/core/DataManager.js:917`
  - `assets/modules/utils/backup.js:15`
  - `assets/modules/utils/backup.js:21`
- 문제:
  - 번호 배열 길이만 6인지 검사하고, 유니크 6개인지 검사하지 않습니다.
- 재현:
  - `normalizeDrawItem({numbers:[1,1,2,3,4,5], bonus:6})`가 유효 객체로 반환됨.
- 영향:
  - 비정상 데이터가 analytics/당첨 판정으로 유입될 수 있습니다.
- 권장 수정:
  - 정규화 시 `new Set(numbers).size === 6` 검증.
  - `bonus`가 본번호 6개와 중복되지 않는지도 검증.

## 5) [Medium] 오프라인 캐시에 `backup.js`가 누락되어 Data 탭이 깨질 수 있음
- 근거 코드:
  - `assets/modules/features/DataIO.js:4` (`../utils/backup.js` import)
  - `sw.js:5` (`APP_SHELL_ASSETS`)
  - `sw.js:30` (`DataIO.js`는 캐시됨)
- 문제:
  - `DataIO.js`는 프리캐시되지만, 의존 모듈 `assets/modules/utils/backup.js`는 프리캐시에 없습니다.
- 영향:
  - 오프라인 상태에서 Data 탭을 처음 열 때 동적 import 실패 가능성이 있습니다.
- 권장 수정:
  - `APP_SHELL_ASSETS`에 `./assets/modules/utils/backup.js` 추가.
  - 배포 시 `CACHE_VERSION` 증가.

## 6) [Low] 라우팅 실패 시 사용자 피드백 없음(비동기 예외 전파)
- 근거 코드:
  - `assets/modules/core/LottoApp.js:151`
- 문제:
  - 네비 클릭 시 `this.route(target)`를 `await/catch` 없이 호출합니다.
- 영향:
  - 모듈 로딩 실패 시 콘솔 에러만 남고 사용자 입장에선 무반응처럼 보일 수 있습니다.
- 권장 수정:
  - `this.route(target).catch(err => UIManager.toast(...))` 형태로 처리.

---

## 추가 구현 권장 (단기)
1. 필터 위반 방지 회귀 테스트 추가
- 불가능 필터 요청 시 결과 0개 또는 명시적 실패를 기대하는 테스트 케이스를 `scripts/smoke`에 추가.

2. Import 후 상태 동기화 테스트 추가
- v3 백업 Import 직후 최신 회차/통계 카드가 즉시 갱신되는지 검증.

3. 보안 가드 추가
- 백업 JSON Import 시 문자열 필드 sanitize/escape 공통 유틸 도입.

4. 오프라인 E2E 체크리스트 보강
- "설치 후 네트워크 차단 -> Data 탭 진입 -> 백업 내보내기/가져오기" 시나리오를 배포 체크리스트에 추가.

## 점검 로그 요약
- `scripts/smoke`: PASS
- `scripts/perf/bench`: PASS
  - generate avg 3.10ms
  - recommend avg 10.76ms
  - backtest-like total 302.72ms
- JS 파싱: PASS (`ALL_JS_PARSE_OK`)

---

## 반영 상태 (2026-03-01)
- [완료] 엄격 필터 모드 적용 (무필터 fallback 제거)
- [완료] 캠페인 렌더링 DOM 조립 전환(textContent 기반)
- [완료] Import 후 즉시 반영 루틴 공통화
- [완료] draw 정규화(중복 번호/보너스 중복) 강화
- [완료] `sw.js` precache 보강(`backup.js`) 및 `CACHE_VERSION: v8`
- [완료] 라우팅 실패 사용자 피드백 토스트 추가
- [완료] 스모크 회귀 테스트 3건 추가
- [점검] 텍스트 파일 UTF-8 디코드 검사 결과 인코딩 오류 파일 없음
