# 기능 구현 점검 리뷰 (2026-03-25)

## 검토 범위

- 참조 문서: `README.md`, `claude.md`
- 검토 범위: 생성, AI, 백테스트, 데이터 입출력, 동기화, 티켓/캠페인 관리

## 현재 상태

- `npm run lint` 통과
- `node scripts/smoke/smoke.mjs` 통과
- 아래 핵심 개선 3건 반영 완료

## 반영 완료 항목

### 1. 과거 회차 티켓 저장 시 즉시 정산

- 반영 파일:
  - `assets/modules/core/data/records.js`
- 변경 내용:
  - `addTicket()` / `addTicketsBulk()` 에서 저장 직후 현재 보유한 당첨 데이터 기준으로 즉시 정산
  - 과거 회차면 바로 `checked` 상태 반영
  - 미래 회차면 기존처럼 `pending` 유지
- 추가 테스트:
  - `immediate ticket settlement regression`

### 2. 생성 탭 캠페인 초기화 시 목표 회차 자동 추적 상태 복구

- 반영 파일:
  - `assets/modules/features/generator/form.js`
- 변경 내용:
  - `resetCampaignOptions()` 가 단순히 input value 만 바꾸지 않고
  - `setTargetDrawInputValue()` 경로를 사용해 `userEdited`, `lastAutoValue` 메타데이터까지 복구
  - 초기화 이후 최신 회차 변경 시 다시 자동 추적 가능
- 추가 테스트:
  - `campaign reset autofill recovery regression`

### 3. Import 후 orphan campaign 정리

- 반영 파일:
  - `assets/modules/features/dataio/support.js`
  - `assets/modules/features/dataio/importExport.js`
- 변경 내용:
  - 연결 티켓이 없는 캠페인을 정리하는 helper 추가
  - Merge Import 에서는 이번에 들어온 캠페인 중 실제 연결 티켓이 생기지 않은 항목만 제거
  - Overwrite Import 에서는 결과 데이터 기준으로 orphan campaign 제거
  - import toast 에 cleanup 수치 표시
- 추가 테스트:
  - `import orphan-campaign cleanup regression`

## 비고

- 문서 최초 검토 시 발견했던 3개 핵심 기능 이슈는 모두 수정 반영했습니다.
- 수동 브라우저 검증이 필요한 항목(QR 권한, SW 업데이트 전파, PWA 설치 프롬프트)은 별도 운영 확인이 여전히 유효합니다.
