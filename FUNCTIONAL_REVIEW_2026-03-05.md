# 로또 웹앱 기능 구현 점검 리포트 (2026-03-05)

## 점검 범위 및 방법
- 참조 문서: `README.md`, `claude.md`
- 점검 코드 범위: `index.html`, `assets/modules/core/*`, `assets/modules/features/*`, `assets/*.worker.js`, `sw.js`, `proxy/worker.js`
- 검증 실행: `node scripts/smoke/smoke.mjs` (PASS)

## 요약
- 현재 스냅샷 기준 즉시 장애를 유발하는 치명적 블로커는 확인되지 않았습니다.
- 2026-03-05 통합 개선 배치(리포트 `1~9 + A~E`)를 코드에 반영했고, 관련 스모크 회귀가 모두 PASS입니다.
- 현재 기준 주요 권고사항은 구현 완료 상태이며, 잔여 작업은 배포 환경 수동 검증(서비스워커 갱신 체감/브라우저 캐시)입니다.

## 구현 반영 상태 (2026-03-05)
- [완료] 백테스트 회차 폭 상한(300) 적용: UI + `Backtest.js` + `backtest.worker.js`
- [완료] 캠페인 상한(52주/주당20/총500) 적용: `index.html`, `Generator.js`, `DataManager.normalizeCampaignEntry()`
- [완료] 백테스트 상세 `적중` 값 채움: 워커 `WINS.hitText`/`matchedCount`/`bonusHit` 추가
- [완료] 백테스트 CSV 계약 정합화: `strategy_id`, `strategy_label` 분리
- [완료] QR 검증 강화: 공식 host allowlist + 게임 내 중복 번호 거부
- [완료] 동기화 단일 실행 가드: `syncInFlightPromise`
- [완료] 수동 동기화 취소: `cancelActiveSync()` + `cancelSyncBtn`
- [완료] 티켓 dedupe 안정화: stable stringify 기반 키 생성
- [완료] 프록시 출처 라벨 문자열 복구
- [완료] Import 옵션 패널: `merge/overwrite` + 설정 적용 체크(`theme/proxy/strategyPrefs`)
- [완료] 정책 기본값 반영: `Merge=설정 미적용`, `Overwrite=설정 적용`
- [완료] 스모크 회귀 추가: `campaign-limit`, `qr-validation`, `ticket-dedupe`, `sync-guard`
- [완료] 서비스워커 캐시 버전 상향: `v9`

## 검증 결과 (통합 배치 이후)
- 실행 명령: `node scripts/smoke/smoke.mjs`
- 결과: PASS
  - `campaign-limit regression`
  - `qr-validation regression`
  - `ticket-dedupe regression`
  - `sync-guard regression`

## 주요 점검 결과 (개선 전 진단 기록)
- 아래 근거의 라인 번호/코드 상태는 2026-03-05 개선 반영 전 스냅샷 기준입니다.

### 1) [높음] 백테스트 회차 범위 상한 부재로 장시간 작업 발생 가능
- 근거:
  - `index.html:451`, `index.html:455` (`btStart`, `btEnd`에 최대값 제한 없음)
  - `assets/modules/features/Backtest.js:406`~`411` (`start <= end`만 검사, 범위 폭 제한 없음)
  - `assets/backtest.worker.js:171`~`225` (전략별로 전체 범위를 순회)
- 위험:
  - 범위를 과도하게 크게 입력하면 CPU/배터리 사용량 증가, 장시간 대기, UX 저하 가능
- 권고:
  - UI/런타임 모두에 최대 범위 제한(예: 300회차)을 추가하고 실행 전 즉시 검증 메시지 표시

### 2) [높음] 캠페인 생성 수량에 실질적 상한 없음
- 근거:
  - `index.html:242`, `index.html:246` (`campWeeks`, `campSetsPerWeek` 최소값만 존재)
  - `assets/modules/features/Generator.js:372`~`374` (최대값 제한 없음)
  - `assets/modules/core/DataManager.js:338`~`339` (정규화에서도 최소값만 보장)
- 위험:
  - 대량 티켓 생성으로 localStorage 한도 도달, UI 프리징, 저장 실패 가능
- 권고:
  - `weeks`, `setsPerWeek`, `총 티켓 수` 상한 도입 및 대량 작업 사전 확인 절차 추가

### 3) [중간] 백테스트 "적중" 컬럼이 항상 빈 값으로 출력됨
- 근거:
  - `assets/backtest.worker.js:211` (`hitText: ''`)
  - `assets/modules/features/Backtest.js:182` (`row.hitText` 렌더링)
- 위험:
  - 결과 테이블 핵심 정보 누락으로 신뢰도 저하
- 권고:
  - 워커에서 `3`, `4`, `5`, `5+보너스`, `6` 형태로 `hitText` 생성 후 전달

### 4) [중간] CSV 헤더/값 의미 불일치 (`strategy_id`에 라벨 저장)
- 근거:
  - `assets/modules/features/Backtest.js:365` 헤더는 `strategy_id`
  - `assets/modules/features/Backtest.js:369` 실제 값은 `getStrategyLabel(...)`
- 위험:
  - 후속 분석 스크립트에서 ID로 오인할 수 있음
- 권고:
  - `strategy_id`와 `strategy_label`을 분리 저장하거나 헤더명을 `strategy_label`로 수정

### 5) [중간] QR 파서가 비정상 게임(중복 번호)도 허용
- 근거:
  - `assets/modules/features/QrScanner.js:161`~`164` (숫자 6개면 통과)
  - 중복 번호 검증(`new Set(nums).size === 6`) 부재
- 위험:
  - 손상된 QR 데이터가 정상 티켓으로 처리되어 당첨 확인 오판 가능
- 권고:
  - 게임 파싱 시 중복 번호 검증을 필수화

### 6) [중하] QR 도메인 검증이 느슨함
- 근거:
  - `assets/modules/features/QrScanner.js:123` (`url.includes('dhlottery')`)
- 위험:
  - 문자열만 포함한 비공식 URL도 통과 가능
- 권고:
  - URL host 파싱 후 허용 도메인 화이트리스트(`m.dhlottery.co.kr`, `www.dhlottery.co.kr`) 적용

### 7) [중간] 동기화가 여러 진입점에서 동시 실행될 수 있음
- 근거:
  - Idle 동기화: `assets/modules/core/LottoApp.js:61`~`63`
  - 수동 동기화: `assets/modules/core/LottoApp.js:213`~`215`
  - 새로고침 동기화: `assets/modules/core/LottoApp.js:218`~`223`
  - `fetchLatestFromAPI` 내부 in-flight 락 부재: `assets/modules/core/DataManager.js:1060`
- 위험:
  - 중복 네트워크 요청, 로그 중첩, 상태 경합 가능
- 권고:
  - `syncInFlightPromise` 같은 단일 실행 가드 추가 및 버튼 비활성화 상태 통합

### 8) [중하] 티켓 중복키가 JSON 키 순서에 의존
- 근거:
  - `assets/modules/core/DataManager.js:349` (`JSON.stringify(strategyRequest)`)
  - Import 병합 중복 제거에서도 동일 키 사용: `assets/modules/features/DataIO.js:101`~`104`
- 위험:
  - 내용은 같고 키 순서만 다른 요청이 중복으로 저장될 수 있음
- 권고:
  - 전략 요청 객체를 정렬 직렬화(stable stringify)해 중복키 생성

### 9) [낮음] 프록시 출처 로그 문자열 인코딩 깨짐
- 근거:
  - `assets/modules/core/DataManager.js:250`, `assets/modules/core/DataManager.js:252`
- 위험:
  - 운영 로그 가독성 저하
- 권고:
  - 해당 라벨 문자열 UTF-8 정상화

## 추가 구현 권장사항

### A) 검증/상한 상수 중앙화
- 백테스트 범위, 캠페인 총량, 동기화 fallback 개수 등 제한값을 한 곳에서 관리
- HTML 속성과 런타임 검증이 동일 상수를 사용하도록 통일

### B) 동기화 취소 기능 추가
- 수동 동기화에 AbortController와 "중지" 버튼을 도입해 장시간 대기 방지

### C) Import 병합 옵션 세분화
- Merge 모드에서 `strategyPrefs`, `customProxy`, `theme`를 항목별 병합/덮어쓰기 선택 가능하게 개선

### D) 회귀 테스트 확장
- 아래 케이스를 스모크/회귀에 추가 권장:
  - 과도한 백테스트 범위 입력 거부
  - 캠페인 생성 상한 검증
  - QR 비정상 페이로드(중복 번호, 잘못된 host) 거부
  - 동기화 in-flight 락 동작

### E) 백테스트 결과 투명성 강화
- WINS payload에 `matchedCount`, `bonusHit`, `hitText` 포함
- 상세 테이블에서 당첨 근거를 즉시 확인 가능하도록 개선

## 확인한 사항
- 현재 스냅샷에서 `scripts/smoke/smoke.mjs`는 정상 통과했습니다.
- 본 문서는 "현재 실패 여부"뿐 아니라 향후 운영 리스크를 줄이기 위한 잠재 이슈 중심 점검 결과입니다.
