# GitHub Pages 배포/운영 안내

## 1) 배포 방식

현재 저장소는 루트(`.`) 정적 파일을 GitHub Pages에 배포하는 구조입니다.

- 별도 번들 산출물(`dist/`)을 만드는 프로젝트가 아니며, 정적 배포 검증은 `npm run build`(=`lint + smoke`)로 수행합니다.

- 배포 대상: `index.html`, `assets/`, `data/`, `manifest.json`, `sw.js`, `.nojekyll`, `THIRD_PARTY_NOTICES.md`
- 저장소: `https://github.com/twbeatles/lotto---webapp`
- 배포 URL: `https://twbeatles.github.io/lotto---webapp/`

메모:

- 런타임 외부 의존 자산은 모두 `assets/vendor/` same-origin 경로로 포함됩니다.
- Pages 배포 시 CDN 링크가 아니라 저장소에 커밋된 vendor 자산이 그대로 서빙되어야 합니다.
- 현재 앱 셸은 분할된 내부 모듈과 `assets/styles/*.css`까지 함께 배포되는 구조입니다.
- 서비스워커 등록/업데이트 UX는 `index.html` inline script가 아니라 `assets/modules/bootstrap/pwa.js`에서 시작됩니다.
- 설치 프롬프트가 가능한 환경에서는 데스크톱 사이드바, 설정 모달, 모바일 `더보기` 시트에 설치 버튼이 동기화됩니다.

## 2) 데이터 운영

- 기본 데이터 소스: `data/winning_stats.json`
- 실행 중 동기화: 앱의 최신 데이터 동기화 버튼 또는 앱 시작 후 백그라운드 자동 동기화
- 로컬 업데이트 저장 위치: `localStorage.lotto_pro_updates_v2`
- 동기화 메타 저장 위치: `localStorage.lotto_pro_sync_meta_v1`
- 동기화 메타에는 최근 응답 구조 경고(`lastWarningAt`, `lastWarningMessage`)도 함께 저장됨
- 설치 시 `data/winning_stats.json`은 서비스워커 data cache에 precache됨
- 과거 회차 티켓을 저장하거나 가져올 때 이미 당첨 데이터가 있으면 즉시 정산됨
- `reconcileTicketChecks()` 가 앱 초기 로드, 최신 회차 sync 직후, Import 후 post-refresh, 로컬 업데이트 정리 후 reload 시 `checked` 상태를 재검증함
- Import 후에는 백업에 저장되지 않은 `syncMeta` 를 `local_restore` 모드로 다시 구성함
- 미래 회차 `localUpdates` 는 `estimateLatestDrawKST() + 2` 상한을 넘으면 저장하지 않고 제외함
- `syncMeta.lastSuccessDrawNo` 는 실제 유효 최신 회차보다 높게 남지 않도록 clamp 됨
- 정적 JSON 이 실패하면 `localUpdates` 만으로 recent draw 를 복원해 `partial recovery` 상태가 될 수 있음
- partial 상태에서는 `gen/check/data` 는 유지되지만 `stats/ai/bt` 는 gate UI 로 제한됨
- Merge/Overwrite Import 후 연결 티켓이 없는 orphan campaign 은 자동 정리됨
- 마지막 연결 티켓이 삭제되거나 티켓북 전체 정리 후에도 orphan campaign 은 자동 정리됨
- 티켓북 동일 조합은 grouped row + `quantity` 로 저장되며, 삭제/요약/캠페인 카운트는 실제 티켓 수량 기준으로 계산됨
- 히스토리는 번호 unique 스냅샷이 아니라 실제 저장/가져오기 로그를 유지함
- 동기화 실행 정책:
  - in-flight 단일 실행(중복 클릭 시 기존 실행에 합류)
  - 수동 동기화(`syncDataBtn`)는 `cancelSyncBtn`으로 취소 가능
  - 사용자 프록시가 없으면 내장 fallback 경로로 최신 회차를 확인
  - 사용자 프록시가 있어도 공식 지원 형식(`/proxy/latest`)일 때만 우선 사용
  - 비지원 프록시 형식은 설정 경고를 띄우고 기본 자동 동기화로 전환
  - JSON 구조가 예상과 다르면 `SYNC_FETCH_ONE_INVALID_PAYLOAD` 로그와 설정 경고를 남김
  - fallback 단건 요청은 최근 120회차로 제한

메모:

- 정적 JSON과 로컬 업데이트를 병합해 최신 상태를 구성합니다.
- 데이터 관리 화면에서 로컬 업데이트 개수를 확인하고 정리할 수 있습니다.
- Import 완료 toast 에는 orphan campaign cleanup 수치가 함께 표시됩니다.
- 정적 기준 최신 회차는 `winning_stats.json` 내용 기준으로 판단합니다.
- 자동 동기화 경로가 모두 실패하면 정적 JSON + 로컬 업데이트 상태를 그대로 유지합니다.

## 3) 프록시 모드 (선택)

정적 JSON 외 외부 API 동기화를 강화하려면 프록시를 사용할 수 있습니다.

예시:
`https://twbeatles.github.io/lotto---webapp/?proxyUrl=https%3A%2F%2F<worker>.workers.dev%2Fproxy%2Flatest`

우선순위:

1. `?proxyUrl=...` 또는 `?proxy=...`
2. `localStorage` 키 `lotto_webapp_settings_v1.proxyLatestUrl`
3. `lotto_pro_settings_v2.customProxy`
4. 그 외는 앱 내장 자동 동기화 fallback

메모:

- `?proxyUrl=`에 넣는 값은 `https://<worker>.workers.dev/proxy/latest`처럼 최신 단건 엔드포인트를 권장합니다.
- 브라우저 주소창에 직접 넣을 때는 프록시 주소 전체를 URL 인코딩해야 쿼리 문자열이 깨지지 않습니다.
- 앱의 공식 지원 커스텀 프록시는 `https://<worker>.workers.dev/proxy/latest` 형식입니다.
- `?url=`, `{draw_no}`, `{url}` 형태는 저장돼 있어도 런타임에서 사용하지 않고 기본 자동 동기화로 전환합니다.
- 설정 모달에는 비지원 프록시 형식에 대한 경고와 fallback 상태가 함께 표시됩니다.
- 내장 fallback보다 안정적인 운영이 필요하면 사용자 프록시를 권장합니다.

## 4) 서비스워커/캐시 운영

- 현재 `sw.js` 캐시 버전: `v17`
- 핵심 자산 변경(특히 JS 모듈, 워커, CSS) 시 캐시 갱신이 필요하면 `CACHE_VERSION`을 올립니다.
- `data/winning_stats.json`은 install 시 `CACHE_DATA`에 precache됩니다.
- `DataIO.js` 의존 모듈인 `assets/modules/utils/backup.js`도 precache 대상에 포함되어야 오프라인 Data 탭 로딩이 안정적입니다.
- 현재는 `assets/vendor/`의 font/icon/QR/캡처 자산, `assets/styles/*.css`, 분할된 `assets/modules/core/*`, `assets/modules/features/*` 내부 모듈도 precache 대상입니다.
- 첫 설치에서는 자동 reload 하지 않으며, 업데이트 reload은 사용자가 토스트에서 수락한 경우에만 수행됩니다.
- 멀티탭 환경에서는 새 서비스워커가 실제 활성화된 뒤(`controllerchange`)에만 activation-complete 신호를 전파합니다.
- 다른 탭은 이 activation-complete 신호를 받은 뒤에만 reload 되어 조기 reload 를 피합니다.

배포 후 반영 확인:

1. 페이지 열기
2. 강력 새로고침(`Ctrl+F5`)
3. DevTools > Application > Service Workers에서 새 버전 활성화 여부 확인

## 5) 트러블슈팅: "화면은 로드되는데 기능이 안 됨"

1. DevTools Console에서 `SyntaxError`, `Invalid or unexpected token` 여부 확인
2. DevTools Network에서 핵심 모듈(`assets/modules/**/*.js`) 상태 코드 확인
3. SW 캐시 의심 시 사이트 데이터 삭제 후 재접속
4. 설정 모달에서 최근 응답 구조 경고와 마지막 sync 경고 시각 확인
5. 모바일에서는 `더보기` 시트에서 `시뮬레이션/설정/설치` 진입이 가능한지 확인
6. 로컬에서 아래 검증 실행:

```bash
node scripts/smoke/smoke.mjs
```

## 6) 트러블슈팅: "문자가 깨져서 보임" (예: `理쒖떊`)

1. 강력 새로고침(`Ctrl+F5`) 후 재확인
2. DevTools > Application > Clear storage로 캐시/스토리지 정리 후 재접속
3. 배포 브랜치의 최신 커밋 반영 여부 확인
4. 로컬에서 화면 문구 검증:
   - 메인 동기화 상태 텍스트
   - 생성/AI/시뮬레이션/확인 탭 버튼/라벨/토스트
   - 공용 확인 모달/설정 모달/모바일 더보기 시트 문구
5. 필요 시 `sw.js`의 `CACHE_VERSION`을 상향해 캐시 강제 갱신

## 7) 로컬 실행

`file://` 직접 열기 대신 HTTP 서버로 실행하세요.

```bash
python -m http.server 5173
```

접속:

- `http://localhost:5173/`

## 8) 로컬 검증 명령

```bash
npm install
npm run lint
npm run build
node scripts/smoke/smoke.mjs
node scripts/perf/bench.mjs
```

선택:

```bash
npm run lint:fix
npm run format:check
```

`smoke`에는 아래 회귀 항목이 포함됩니다.

- 엄격 필터에서 필터 위반 조합이 생성되지 않는지
- draw 정규화 시 중복 번호/보너스 중복 차단되는지
- Import 후 즉시 반영 순서가 유지되는지
- 캠페인 상한 정책이 지켜지는지(`campaign-limit`)
- 캠페인 삭제 시 연결 티켓이 같이 제거되는지(`campaign-cascade`)
- 생성 탭 초기화 후 목표 회차 자동 추적이 복구되는지(`campaign reset autofill recovery`)
- QR host/중복 번호 검증이 동작하는지(`qr-validation`)
- strategyRequest 키 순서가 달라도 dedupe 키가 동일한지(`ticket-dedupe`)
- 과거 회차 티켓 저장 직후 즉시 정산되는지(`immediate ticket settlement`)
- 기존 `checked` 티켓이 sync/import/local-update cleanup 후 현재 당첨 데이터 기준으로 다시 맞춰지는지(`ticket-reconcile`)
- 동기화 in-flight/취소 가드가 동작하는지(`sync-guard`)
- AI `생성 탭으로`가 기존 결과를 교체하는지(`requestNumbers replace`)
- sync 성공 후 최신 당첨결과 카드가 항상 갱신되는지(`sync-latest-win refresh`)
- 미래 회차 `localUpdates` 가 저장 시 제외되고 경고가 남는지(`future local-updates guard`)
- 로컬 업데이트 정리 후 stale `checked` 티켓과 `syncMeta.lastSuccessDrawNo` 가 함께 교정되는지(`clear-local-updates reconcile`)
- Import `alerts` 옵션 기본값과 적용 여부가 맞는지(`import-alert-options`)
- Import 후 orphan campaign 이 정리되는지(`import orphan-campaign cleanup`)
- 티켓 삭제/전체정리 후 orphan campaign 이 즉시 정리되는지(`orphan-campaign auto-cleanup`)
- 히스토리가 duplicate actual-log 를 유지하는지(`history actual-log`)
- 전략 프리셋 CRUD가 scope별로 동작하는지(`strategy-preset-crud`)
- 런타임 HTML/loader에서 CDN 경로가 남지 않는지(`runtime-asset-localization`)
- 프록시 미설정 상태에서 자동 동기화 fallback 경로가 시도되는지(`auto-sync fallback`)
- `pagehide`/`visibilitychange(hidden)`에서 즉시 저장 flush가 동작하는지(`persistence-flush`)
- 시스템 알림 토글이 권한 요청/원복/테스트 알림 흐름대로 동작하는지(`notification-permission`)
- 데이터 탭 검색/페이지네이션이 100개 초과 데이터에서도 동작하는지(`data-list pagination`)
- 데이터 탭 렌더러가 실제 DOM에서 검색/페이지네이션/attribute 계약을 지키는지(`data-list DOM`)
- 전용 워커 외 프록시 형식이 자동 fallback으로 내려가는지(`proxy-policy`)
- 목표 회차 기본값이 최신 회차 기준 다음 회차를 계속 추적하는지(`target-draw autofill`)
- `refreshCurrentRoute()` stale guard가 이전 탭 렌더를 막는지(`refreshCurrentRoute stale`)
- 단건 동기화 payload mismatch 시 경고 로그가 남는지(`sync invalid payload`)
- `check` 탭 이탈 시 QR 스캐너가 정리되는지(`qr route cleanup`)
- 서비스워커가 첫 설치에서 자동 reload 하지 않는지(`service-worker reload policy`)
- 서비스워커 install precache에 `winning_stats.json`이 포함되는지(`service-worker core data precache`)
- Pretendard 폰트가 절대 same-origin 경로를 사용하는지(`local-font-path`)
