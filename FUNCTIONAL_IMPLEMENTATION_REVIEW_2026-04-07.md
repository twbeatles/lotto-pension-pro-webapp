# 기능 구현 정합성 3차 보강 구현 결과

> 작성일: 2026-04-07
> 기준 브랜치: `main`
> 참조: `README.md`, `claude.md`, 실제 코드베이스, `scripts/smoke/`

## 요약

2026-04-07 계획서의 4개 핵심 보강 항목은 현재 코드에 반영되었습니다.

- 티켓북 동일 구매 `quantity` 그룹화
- Import 후 `syncMeta.local_restore` 재구성
- `dataHealth` 기반 partial recovery / 기능 게이트
- PWA 멀티탭 업데이트를 activation 이후로 지연

검증 기준:

- `npm run lint` 통과
- `node scripts/smoke/smoke.mjs` 통과

## 구현 반영 상태

### 1. 티켓북 `quantity` 모델

반영 파일:

- `assets/modules/core/data/records.js`
- `assets/modules/core/app/dataLists.js`
- `assets/modules/features/Check.js`
- `assets/modules/features/generator/form.js`
- `assets/modules/features/generator/actions.js`
- `assets/modules/features/ai/form.js`
- `assets/modules/features/dataio/importExport.js`
- `assets/modules/features/dataio/support.js`

반영 내용:

- 티켓 엔트리에 `quantity` 필드가 추가되며 누락값은 `1`로 정규화됨
- dedupe key 는 `targetDrawNo + source + campaignId + numbers + strategyRequest`
- 같은 key 는 새 row 대신 기존 row 의 `quantity` 증가
- 캠페인별 분리는 유지되고, 같은 번호라도 `campaignId` 가 다르면 separate row 유지
- 삭제/캠페인 삭제/전체 삭제/저장소 요약은 실제 티켓 수량 기준으로 계산
- 목록/확인 화면에 `xN` 표시 추가

### 2. Import 후 `syncMeta` 재구성 / partial recovery

반영 파일:

- `assets/modules/core/data/defaults.js`
- `assets/modules/core/data/persistence.js`
- `assets/modules/core/data/sync.js`
- `assets/modules/features/dataio/postImportRefresh.js`
- `assets/modules/core/data/analytics.js`

반영 내용:

- 비영속 `dataHealth` 도입:
  - `availability: full | partial | none`
  - `source: static | static_local | local_only | none`
  - `latestDrawNo`
  - `message`
- `syncMeta.mode = local_restore` 추가
- Import 후 `fetchWinningStats()` 다음에 `markLocalRestoreSuccess()` 로 effective draw 기준 메타 재구성
- 정적 JSON 실패 시에도 `localUpdates` 만으로 `winningStats` 를 복원할 수 있음
- cold start 에서는 최근 `24`회 기준 partial recovery 시도

### 3. partial recovery UX / 게이트

반영 파일:

- `assets/modules/core/app/moduleLoader.js`
- `assets/modules/core/app/settingsPanel.js`
- `assets/modules/core/app/latestDraw.js`
- `assets/styles/pages.css`

반영 내용:

- `stats`, `ai`, `bt` 는 `dataHealth.availability !== 'full'` 이면 공통 게이트 패널 렌더
- `gen`, `check` 는 동작 유지 + partial warning banner 표시
- 설정 모달은 stale 과 partial 을 분리 표기
- 최신 회차 카드도 partial 상태 배지를 함께 표시

### 4. PWA 멀티탭 업데이트 순서

반영 파일:

- `assets/modules/bootstrap/pwa.js`

반영 내용:

- legacy `SW_UPDATED` 즉시 reload broadcast 제거
- initiating tab:
  - update accept
  - `skipWaiting`
  - `controllerchange`
  - self reload + `SW_ACTIVATED` broadcast
- remote tabs:
  - `SW_ACTIVATED` 수신 후 reload

## 추가 검증 포인트

스모크 회귀 추가:

- `ticket-quantity grouping`
- `partial winning-stats recovery`
- `local-restore sync-meta`
- `route data-gate`
- 기존 `service-worker reload policy` 는 activation 이후 전파 정책으로 갱신

## 잔여 메모

- `FUNCTIONAL_IMPLEMENTATION_REVIEW_2026-04-05.md` 는 현재 워크트리에서 삭제 상태였습니다.
- Node 실행 시 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 여전히 남아 있으며, 이번 패스 범위에는 포함하지 않았습니다.
