# 기능 구현 점검 리포트 (2026-03-11)

## 기준

- 참조 문서: `README.md`, `claude.md`
- 점검 범위: 생성, AI, 백테스트, 당첨 확인, QR 스캔, 데이터 입출력, 로컬 저장소, 동기화
- 실행 검증:
  - `npm run lint` 통과
  - `node scripts/smoke/smoke.mjs` 통과

## 결론 요약

현재 코드베이스는 기본 경로에서는 비교적 안정적이지만, 실제 사용 중 오판이나 데이터 불일치를 만들 수 있는 구현상 빈틈이 남아 있습니다. 특히 `휠 전략 + 고정수`, `티켓/QR의 목표 회차 처리`, `캠페인 저장 조건`, `손상된 로컬 저장소 복구`는 우선 순위가 높습니다.

## 주요 이슈

### 1. 높음: 휠 전략에서 고정수가 보존되지 않습니다

- 위치:
  - `assets/modules/core/StrategyCatalog.js:137-155`
  - `assets/modules/core/StrategyEngine.js:353-386`
- 문제:
  - `wheel_full`, `wheel_reduced_t3`는 UI에서 선택 가능한 전략인데, `generateWheelSet()`이 `sampleWithConstraints()`로 만든 `seedSet`에서 앞쪽 `guarantee` 개수만 `wheelBase`로 사용합니다.
  - 이 과정에서 사용자가 지정한 고정수가 `seedSet` 뒤쪽에 위치하면 최종 결과에서 탈락할 수 있습니다.
- 실제 확인:
  - 임시 검증으로 `fixed=[10,20,30,40,45]`, `wheel_full`, `wheelGuarantee=4`를 넣었을 때 생성 결과가 `[10,20,24,30,35,39]`로 나왔고, 고정수 `40`, `45`가 사라졌습니다.
- 영향:
  - 사용자가 "반드시 포함"을 기대한 고정수가 빠진 채 티켓이 생성됩니다.
  - 캠페인/티켓북 저장 시 잘못된 번호가 그대로 누적될 수 있습니다.
- 권장 조치:
  - 휠 전략에서도 `fixed`는 항상 우선 보존해야 합니다.
  - `fixed.length > 6`은 즉시 실패 처리하고, `fixed.length > guarantee`인 경우에도 고정수 전부를 포함한 뒤 나머지를 채우는 방식으로 재구성하는 편이 맞습니다.

### 2. 높음: 최신 회차 확인이 목표 회차가 없을 때 다른 회차로 대체됩니다

- 위치:
  - `assets/modules/features/Check.js:170-180`
- 문제:
  - `runLatest()`는 `ticket.targetDrawNo`에 해당하는 회차를 찾지 못하면 자동으로 `winningStats[0]`의 최신 회차를 사용합니다.
- 실제 확인:
  - 임시 검증에서 `targetDrawNo=1210` 티켓을 검사했을 때 실제 비교 회차가 `1209`로 설정됐습니다.
- 영향:
  - 아직 추첨되지 않은 티켓이 최신 회차 기준으로 오검사됩니다.
  - 특정 과거 회차용 티켓도 데이터가 없으면 엉뚱한 회차로 판정됩니다.
  - 사용자 입장에서는 "미추첨"이어야 할 항목이 `낙첨` 또는 `당첨`으로 잘못 보일 수 있습니다.
- 권장 조치:
  - 목표 회차가 없으면 비교를 중단하고 `해당 회차 데이터 없음` 또는 `아직 미추첨` 상태를 보여줘야 합니다.
  - 티켓북 항목과 스캔 항목 모두 동일 규칙을 적용해야 합니다.

### 3. 높음: QR 스캔 경로에서 회차 정보가 버려집니다

- 위치:
  - `assets/modules/features/QrScanner.js:117-175`
  - `assets/modules/features/Check.js:65-66`
- 문제:
  - QR `v` 파라미터 형식은 `[DrawNo]q[Game1]q[Game2]...`인데, 현재 파서는 `parts[0]`의 회차 정보를 사용하지 않고 게임 번호만 반환합니다.
  - `setScannedNumbers()`도 `{ numbers, date }`만 저장하고 `targetDrawNo`를 보존하지 않습니다.
- 실제 확인:
  - `https://m.dhlottery.co.kr/?v=0861q010203040506` 파싱 결과는 `[[1,2,3,4,5,6]]`만 반환되고 회차는 포함되지 않습니다.
- 영향:
  - 실제 구매한 QR 티켓을 스캔해도 어느 회차 티켓인지 앱이 모릅니다.
  - 위 2번 이슈와 결합되면 스캔 결과가 최신 회차 기준으로 잘못 판정될 수 있습니다.
- 권장 조치:
  - QR 파서 반환값을 `[{ targetDrawNo, numbers }]` 형태로 바꾸고, `CheckModule`에서 해당 회차를 우선 사용해야 합니다.
  - 스캔 결과를 티켓북에 저장하는 기능을 추가할 계획이라면 이 구조가 먼저 필요합니다.

### 4. 중간: 캠페인 메타데이터가 티켓 추가 성공 여부와 무관하게 저장됩니다

- 위치:
  - `assets/modules/features/Generator.js:450-464`
- 문제:
  - `addTicketsBulk()` 결과가 `0`이어도 `addCampaign()`은 항상 호출됩니다.
  - 즉, 필터가 너무 엄격해서 티켓이 하나도 안 만들어졌거나, 전부 중복이라 실제 추가가 `0`이어도 캠페인 카드만 남을 수 있습니다.
- 영향:
  - "캠페인 생성 완료"처럼 보이지만 실제 티켓은 없을 수 있습니다.
  - 중복 재생성 시 빈 캠페인/중복 캠페인이 쌓여 관리 데이터가 혼탁해집니다.
- 권장 조치:
  - `inserted === 0`이면 캠페인을 저장하지 않거나, 최소한 사용자에게 `캠페인 저장 안 함`을 명확히 표시해야 합니다.
  - 추가로 캠페인과 티켓을 연결할 식별자(`campaignId`)를 두면 삭제/조회 품질도 좋아집니다.

### 5. 중간: 즐겨찾기/히스토리 로드 경로는 스키마 검증이 없어 손상된 저장소에 취약합니다

- 위치:
  - `assets/modules/core/DataManager.js:443-477`
  - `assets/modules/core/LottoApp.js:447-455`
  - `assets/modules/core/UIManager.js:44-46`
- 문제:
  - `load()`는 `favorites`, `history`를 그대로 `JSON.parse`해서 state에 넣고 끝납니다.
  - 반면 렌더 경로는 `item.numbers`가 항상 배열이라고 가정하고 `renderBalls(item.numbers)`를 호출합니다.
- 실제 확인:
  - 임시 검증에서 `favorites=[{foo:"bar"}]`, `history=[{numbers:"oops"}]`를 로드해도 그대로 state에 남았습니다.
- 영향:
  - 손상된 `localStorage` 또는 오래된 비호환 데이터가 남아 있으면 데이터 탭 렌더링이 깨질 수 있습니다.
  - 지금은 `ticketBook`, `campaigns`, `alertPrefs`는 정규화하지만 `favorites`, `history`는 같은 방어가 없습니다.
- 권장 조치:
  - `normalizeItems()`에 준하는 로직을 `DataManager.load()`에도 적용해야 합니다.
  - 잘못된 항목은 버리고, 정리된 결과를 다시 저장하는 마이그레이션 경로가 필요합니다.

### 6. 중간, 추론 기반: QR 성공 콜백에 재진입 방어가 없어 중복 처리 가능성이 있습니다

- 위치:
  - `assets/modules/features/QrScanner.js:86-106`
- 문제:
  - `onScanSuccess()`는 성공 직후 `await this.stop()`을 호출하지만, 그 전에 중복 decode callback이 들어오는 것을 막는 플래그가 없습니다.
  - 클래스에 `isScanning` 상태는 있지만 성공 시점의 가드에는 쓰이지 않습니다.
- 추론 근거:
  - QR 스캐너 계열 라이브러리는 성공 문자열을 정지 직전 짧은 시간 동안 여러 번 콜백하는 경우가 흔합니다.
- 영향:
  - 토스트 중복, `route('check')` 중복 호출, 스캔 결과 중복 세팅이 발생할 수 있습니다.
- 권장 조치:
  - `if (!this.isScanning) return; this.isScanning = false;` 형태의 one-shot 가드를 성공 콜백 맨 앞에 두는 편이 안전합니다.

## 추가 권장 사항

### 우선 추가할 회귀 테스트

- `wheel_full` / `wheel_reduced_t3`에서 고정수가 항상 결과에 포함되는지 검사
- `Check.runLatest()`가 `targetDrawNo` 미존재 시 fallback 대신 경고 상태를 반환하는지 검사
- QR 파싱 결과에 `drawNo`가 포함되는지 검사
- 캠페인 생성 시 `inserted === 0`이면 캠페인이 저장되지 않는지 검사
- 손상된 `favorites/history` 로컬 데이터가 로드 시 정리되는지 검사

### 구현 우선순위 제안

1. `StrategyEngine.generateWheelSet()`의 고정수 보존 수정
2. `CheckModule`의 목표 회차 미존재 처리 수정
3. `QrScanner` 반환 스키마를 회차 포함 형태로 확장
4. `Generator.generateCampaign()`의 빈 캠페인 저장 차단
5. `DataManager.load()`의 `favorites/history` 정규화 추가
