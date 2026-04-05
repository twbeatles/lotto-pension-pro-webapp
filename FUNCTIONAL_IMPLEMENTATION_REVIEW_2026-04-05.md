# 기능 구현 리뷰 후속 조치 보고서

> 작성일: 2026-04-05
> 상태: 구현 완료 및 검증 완료
> 기준 문서: `README.md`, `claude.md`, `ISSUES.md`
> 대체 아티팩트: 기존 `FUNCTIONAL_IMPLEMENTATION_REVIEW_2026-03-25.md` 후속 리뷰

---

## 1. 이번 반영 범위

이번 후속 조치에서는 2026-04-05 기능 구현 리뷰에서 확정한 4개 이슈를 모두 반영했다.

1. stale `checked` 티켓 재정합성
2. 미래 회차 `localUpdates` 방어 및 `syncMeta` clamp
3. orphan campaign 자동 정리 확대
4. 히스토리 actual-log 정책 전환

---

## 2. 구현 완료 항목

### 2-1. 티켓 정산 재정합성

- `assets/modules/core/data/analytics.js`
  - `reconcileTicketChecks()` 추가
  - 현재 `winningStats` 기준으로 티켓 전체의 `checked` 상태 재평가
- `assets/modules/core/data/sync.js`
  - `fetchWinningStats()` 완료 후 재정합성 실행
- `assets/modules/features/dataio/postImportRefresh.js`
  - Import 후 post-refresh 경로에서도 동일 로직 적용

동작 정책:

- 해당 회차 결과가 있으면 `rank`, `drawNo` 를 다시 계산
- 결과가 없거나 최신 회차가 아직 해당 티켓 회차에 도달하지 않았으면 `checked` 제거 후 `pending` 복귀

### 2-2. 로컬 업데이트 방어 및 sync 메타 정리

- `assets/modules/core/data/persistence.js`
  - `sanitizeLocalUpdates()` 추가
  - 정규화, 회차 dedupe, 정렬, 미래 회차 차단 중앙화
  - 허용 상한: `estimateLatestDrawKST() + 2`
- `assets/modules/core/data/sync.js`
  - `winningStats` 재구성 뒤 `syncMeta.lastSuccessDrawNo` clamp 적용

동작 정책:

- 상한 초과 미래 회차는 저장하지 않음
- 수동 import/manual sync 는 제외 개수를 toast 에 반영
- 자동 로드/복구 경로는 toast 없이 `syncMeta.lastWarningMessage` 로만 경고 유지

### 2-3. orphan campaign 자동 정리

- `assets/modules/core/data/records.js`
  - `pruneOrphanCampaigns()` 추가
  - `removeTicket()`, `clearTicketBook()` 후 자동 실행
- `assets/modules/features/dataio/importExport.js`
  - Merge/Overwrite Import 도 동일 공용 정리 로직 사용
- `assets/modules/core/app/dataLists.js`
  - 삭제/정리 성공 toast 에 자동 정리된 캠페인 수 표시

### 2-4. 히스토리 actual-log 정책 변경

- `assets/modules/core/data/records.js`
  - `mergeHistoryEntries()` 추가
- `assets/modules/features/generator/actions.js`
  - `saveAll()` 이 중복 번호도 모두 히스토리에 저장하도록 변경
- `assets/modules/features/dataio/importExport.js`
  - merge import 시 히스토리를 날짜 내림차순 actual-log 기준으로 병합

정책 요약:

- `favorites` 는 번호 조합 unique 유지
- `history` 는 duplicate 를 허용하고 실제 저장/가져오기 로그를 유지

---

## 3. 문서 동기화

아래 문서를 현재 구현 기준으로 갱신했다.

- `README.md`
- `claude.md`
- `gemini.md`
- `cladue.md`
- `PROJECT_ANALYSIS.md`
- `ISSUES.md`
- `deploy_github_pages.md`

추가 반영 내용:

- 최신 기능 리뷰 아티팩트 참조를 2026-04-05 기준으로 교체
- `npm run build` 를 정적 배포 검증 명령으로 문서화
- 신규 스모크 회귀 항목 반영

---

## 4. 검증 결과

실행 완료:

```bash
npm run lint
node scripts/smoke/smoke.mjs
npm run build
```

핵심 회귀 통과 항목:

- `ticket-reconcile`
- `future local-updates guard`
- `clear-local-updates reconcile`
- `orphan-campaign auto-cleanup`
- `history actual-log`

---

## 5. 남은 메모

- 이 저장소는 번들러 기반 프로젝트가 아니므로 `build` 는 정적 배포 검증용 명령으로 정의했다.
- Node 실행 시 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 여전히 남아 있으며, 기능 동작 자체에는 영향이 없다.
