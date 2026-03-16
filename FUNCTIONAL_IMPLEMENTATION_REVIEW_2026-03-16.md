# 기능 구현 리뷰 (2026-03-16)

## 검토 범위

- 참조 문서: `README.md`, `claude.md`, `proxy/README.md`
- 실행 검증:
  - `npm run lint`
  - `node scripts/smoke/smoke.mjs`
- 수동 확인:
  - 로컬 정적 서버(`python -m http.server 4173`)로 앱 실행
  - 브라우저에서 데이터 관리 화면, 폰트 로딩, 캐시 상태 확인

## 결론 요약

- 현재 기준 `lint`와 `smoke`는 모두 통과한다.
- 다만 실제 UI/런타임 기준으로는 아래 4개 항목이 기능 품질에 직접 영향을 준다.
- 특히 **데이터 관리 화면 회귀**는 사용자 기능이 이미 노출된 상태에서 실제로 동작하지 않는 부분이 있어 우선순위가 가장 높다.

## 주요 이슈

### 1. High - 데이터 관리 화면의 검색/페이지네이션/즐겨찾기·히스토리 액션이 실제 렌더러에서 깨져 있음

관련 파일:

- `index.html:684-724`
- `assets/modules/core/app/dataLists.js:134-170`
- `assets/modules/core/app/dataLists.js:188-290`
- `assets/modules/core/app/dataLists.js:431-558`

근거:

- 화면에는 검색 입력과 페이지네이션 영역이 노출되어 있다(`index.html:684-724`).
- 클릭 위임은 `.result-item[data-raw-index], .result-item[data-id]`만 처리한다(`assets/modules/core/app/dataLists.js:143`).
- 그런데 현재 사용 중인 `renderDataLists()`는 즐겨찾기/히스토리에 `data-raw-index`가 아니라 `data-idx`를 넣는다(`assets/modules/core/app/dataLists.js:203-207`, `238-251`).
- 같은 함수는 검색 상태(`dataListState`)와 `paginateItems()`를 전혀 사용하지 않고, 리스트를 단순 `slice(0, 50)`, `slice(0, 100)`으로 잘라 렌더링한다(`assets/modules/core/app/dataLists.js:238`, `275`).
- 반면 검색/페이지네이션/`data-raw-index`를 정상 처리하는 구현은 `renderDataListsLegacy()`에 남아 있지만 실제 호출되지 않는다(`assets/modules/core/app/dataLists.js:431-558`).

실제 확인:

- 브라우저에서 `window.app.route('data')` 후 즐겨찾기 25개를 주입하고 `#favSearch`에 검색어를 입력했을 때, 내부 query state는 바뀌지만 렌더된 항목 수는 그대로 유지됐다.
- `#favPagination`은 비어 있었고, 즐겨찾기 첫 항목은 `data-raw-index` 없이 `data-idx`만 갖고 있었다.

영향:

- 검색 UI가 보이지만 실제 필터링이 되지 않는다.
- 페이지네이션 UI가 비어 있어 많은 데이터를 탐색할 수 없다.
- 즐겨찾기/히스토리의 복사/QR 버튼은 클릭 위임 조건을 만족하지 못해 동작하지 않을 가능성이 높다.
- 즐겨찾기/히스토리 50개 초과, 티켓 100개 초과, 캠페인 50개 초과 데이터는 접근 불가 상태가 된다.

권장 조치:

- `renderDataListsLegacy()`의 검색/페이지네이션/`data-raw-index` 의미를 현재 chunk 렌더러로 이식하거나, 검증된 레거시 구현으로 우선 롤백한다.
- DOM 기반 스모크 테스트를 추가한다.
  - 검색어 입력 후 렌더된 행 수가 줄어드는지
  - 페이지네이션 텍스트가 채워지는지
  - 즐겨찾기/히스토리의 복사 버튼 클릭이 실제 핸들러까지 도달하는지

### 2. Medium - Pretendard 폰트 경로 이슈가 아직 남아 있어 실제 브라우저에서 404가 발생함

관련 파일:

- `README.md:10-22`
- `assets/styles/tokens.css:1-6`

근거:

- README에는 same-origin Pretendard 경로를 바로잡았다고 적혀 있다(`README.md:22`).
- 실제 `@font-face`는 `../vendor/pretendard/PretendardVariable.woff2`를 사용한다(`assets/styles/tokens.css:3`).
- 그러나 브라우저 실행 시 실제 요청 경로는 `/assets/styles/vendor/pretendard/PretendardVariable.woff2`로 나갔고 404가 발생했다.

영향:

- 폰트가 fallback으로 대체되어 미세한 레이아웃 흔들림과 스타일 일관성 저하가 생긴다.
- 콘솔에 로딩 오류가 계속 남아 실제 기능 오류 추적 신호를 희석시킨다.

권장 조치:

- 경로를 import 체인과 무관한 절대 경로(`/assets/vendor/pretendard/PretendardVariable.woff2`)로 고정하는 편이 안전하다.
- 폰트 로드 200 응답을 확인하는 브라우저 회귀 체크를 추가한다.

### 3. Medium - 문서상 지원한다고 한 프록시 형식과 실제 range sync 구현 계약이 다름

관련 파일:

- `proxy/README.md:56-63`
- `assets/modules/core/data/sync.js:135-153`
- `assets/modules/core/data/sync.js:217-229`

근거:

- 문서에는 앱이 `/proxy/latest`, `{draw_no}`, `{url}`, 일반 prefix(`...?url=`) 형식을 모두 해석한다고 적혀 있다(`proxy/README.md:63`).
- 단건 조회 URL 생성은 실제로 `{draw_no}`, `/proxy/latest`, `{url}`, prefix를 모두 처리한다(`assets/modules/core/data/sync.js:217-229`).
- 하지만 구간 조회는 커스텀 프록시 URL을 받아도 결국 `${origin}/proxy/range`로 강제 변환한다(`assets/modules/core/data/sync.js:141-153`).

영향:

- 사용자가 `https://<worker>.workers.dev/?url=` 같은 prefix 타입 프록시를 넣으면 단건 조회는 되더라도 range sync는 실패할 수 있다.
- 이 경우 동기화는 per-draw fallback에 의존하게 되고, 누락 회차가 많으면 속도가 급격히 느려진다.
- fallback 대상은 `MAX_SYNC_FALLBACK_DRAWS=120` 제한을 받기 때문에 오래된 정적 데이터에서 한 번에 많이 따라잡아야 하는 경우 일부 누락이 남을 수 있다.

권장 조치:

- 앱에서 허용하는 프록시 타입을 명확히 둘 중 하나로 정리해야 한다.
  - 옵션 A: `/proxy/range`까지 제공하는 전용 워커만 지원한다고 UI/README를 축소
  - 옵션 B: prefix/`{url}` 형식일 때는 range sync를 건너뛰고 단건 루프만 수행하되, UI에 “range 미지원 프록시”를 명시
- 최소한 설정 저장 시 프록시 capability를 검증하고 사용자에게 경고하는 단계가 필요하다.

### 4. Medium - 오프라인/PWA 경험이 core data precache가 아니라 런타임 캐시에 의존함

관련 파일:

- `README.md:168-170`
- `sw.js:5-60`

근거:

- README는 same-origin 자산 기반으로 오프라인 런타임 동작을 강조한다(`README.md:168-170`).
- 하지만 서비스워커 install precache 목록(`APP_SHELL_ASSETS`)에는 `data/winning_stats.json`이 없다(`sw.js:5-60`).
- 즉 당첨 데이터는 install 시점이 아니라 런타임 fetch를 통해서만 `lotto-data-v11`에 들어간다.

영향:

- 앱 셸은 열리지만, 핵심 데이터가 아직 warm-up되지 않은 상태의 오프라인 진입에서는 “오프라인/데이터 없음” 상태가 나올 수 있다.
- 특히 첫 방문 직후나 업데이트 직후처럼 캐시가 완전히 예열되지 않은 상황에서 체감 품질이 흔들릴 수 있다.

권장 조치:

- `data/winning_stats.json`을 precache에 포함시키는 것이 가장 단순하다.
- 파일 크기 때문에 precache를 피하려면, 최초 온라인 실행 완료 전에는 “오프라인 준비 완료”로 간주하지 않는 UX 안내가 필요하다.

## 추가로 보완하면 좋은 항목

### A. 테스트 보강

- 현재 `runDataListPaginationRegression()`은 `paginateItems()` 헬퍼만 검증하고 실제 DOM 렌더러 회귀는 잡지 못한다.
- 이번 회귀를 막으려면 `renderDataLists()`를 직접 호출하는 DOM 통합 테스트가 필요하다.

### B. 런타임 자산 회귀 체크

- 현재 smoke는 CDN 제거 여부는 확인하지만, 실제 same-origin 폰트/아이콘이 200으로 로드되는지는 보지 않는다.
- 최소한 `PretendardVariable.woff2`, `icon-192.png`, `icon-512.png` 정도는 네트워크 성공 여부를 점검하는 브라우저 검증이 있으면 좋다.

### C. 프록시 호환성 표기

- 설정 UI에 현재 입력된 프록시가
  - range 지원형인지
  - single-fetch 전용인지
  - 문서 권장 형식인지
  를 즉시 표기하면 운영 혼선을 줄일 수 있다.

## 이번 점검에서 확인한 것

- `npm run lint` 통과
- `node scripts/smoke/smoke.mjs` 통과
- 브라우저 수동 확인에서 아래를 재현/확인
  - 데이터 관리 검색/페이지네이션/액션 회귀
  - Pretendard 폰트 404
  - 서비스워커 캐시가 shell/data로 분리되어 있고 data는 런타임 캐시에 의존함

## 구현 상태 업데이트 (2026-03-16)

- 이 문서에서 지적한 4개 핵심 항목은 같은 날짜 배치에서 반영 완료했습니다.
- 현재 코드 기준 상태:
  - 데이터 관리 화면은 검색/페이지네이션/`data-raw-index`/액션 위임 계약을 다시 만족합니다.
  - Pretendard는 `/assets/vendor/pretendard/PretendardVariable.woff2` 절대 same-origin 경로로 로드합니다.
  - 커스텀 프록시는 공식 지원 형식인 절대 `http(s)` + `/proxy/latest`만 우선 사용합니다.
  - `data/winning_stats.json`은 서비스워커 install 단계에서 `CACHE_DATA`에 precache됩니다.
- 추가 반영:
  - 설정 모달에 비지원 프록시 형식 경고와 자동 fallback 안내를 추가했습니다.
  - smoke에 data-list DOM, proxy-policy, service-worker core data precache, local-font-path 회귀를 추가했습니다.
- 최신 검증:
  - `npm run lint` 통과
  - `node scripts/smoke/smoke.mjs` 통과
  - 브라우저 수동 확인에서 데이터 관리 검색/페이지 이동/복사/QR/삭제, 프록시 경고, 폰트 200 응답, `lotto-data-v12` 캐시 내 `winning_stats.json` 존재를 확인했습니다.
