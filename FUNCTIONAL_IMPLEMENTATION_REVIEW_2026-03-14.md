# 기능 구현 리뷰 및 반영 현황 (2026-03-14)

## 검토 범위

- 참조 문서: `README.md`, `claude.md`, `gemini.md`, `PROJECT_ANALYSIS.md`
- 주요 코드:
  - `index.html`, `sw.js`
  - `assets/modules/core/*.js`
  - `assets/modules/features/*.js`
  - `assets/modules/utils/*.js`
  - `proxy/worker.js`

## 최초 리뷰 요약

초기 리뷰 시점에는 아래 영역이 기능 구현 관점의 주요 리스크로 확인됐습니다.

1. 정적 호스팅에서 기본 최신 동기화 경로가 404 후 외부 프록시에 의존함
2. README의 "백그라운드 최신 데이터 동기화" 표현이 실제 동작보다 과장됨
3. 서비스워커 `controllerchange -> reload` 흐름이 첫 설치에서도 재초기화를 유발할 수 있음
4. 시스템 알림 토글과 실제 브라우저 권한 상태가 분리되어 있음
5. debounce/idle 저장만 있어 빠른 종료 시 최근 변경 유실 가능성이 있음
6. 데이터 관리 탭이 50/100개까지만 보여 장기 사용 시 관리성이 떨어짐
7. localStorage 누적 관리 상태를 사용자에게 보여주지 않음
8. AI 안내 문구가 엄격 필터 정책과 완전히 맞지 않음

## 구현 반영 현황

### 1. 동기화/프록시

- 완료
- 반영 내용:
  - 최신 회차 동기화는 `프록시 옵트인` 정책으로 전환
  - 프록시 미설정 시 `/proxy/latest`, `api.allorigins.win`, `corsproxy.io` 기본 fallback 제거
  - `lotto_pro_sync_meta_v1` 추가
    - `mode`
    - `currentSource`
    - `lastSuccessAt`
    - `lastSuccessDrawNo`
    - `lastFailureAt`
    - `lastFailureMessage`
  - 데이터 탭에서 현재 모드/소스, 마지막 성공 시각, 마지막 반영 회차, 마지막 실패 원인, 최신성 경고 표시
  - `Check`, `Backtest` 실행 전 데이터가 뒤처졌으면 경고 토스트 표시

### 2. 서비스워커 업데이트 흐름

- 완료
- 반영 내용:
  - 첫 설치에서는 `controllerchange`만으로 reload 하지 않음
  - 사용자가 업데이트 토스트에서 `skipWaiting`을 수락한 경우에만 reload

### 3. 알림 권한 UX

- 완료
- 반영 내용:
  - 데이터 탭에 시스템 알림 권한 배지 추가
  - 시스템 알림 토글 on 시 즉시 권한 요청
  - 거부/미허용 시 토글 원복 + 안내 토스트
  - 테스트 알림 버튼 추가
  - 정산 시점에는 권한 재요청 없이 `granted`일 때만 시스템 알림 발송

### 4. 저장 신뢰성

- 완료
- 반영 내용:
  - `pagehide`, `visibilitychange(hidden)`에서 `save(true)` flush
  - 즐겨찾기/티켓/캠페인/알림/전략 프리셋 CRUD는 즉시 저장
  - 프록시 URL 입력처럼 잦은 입력은 debounce 저장 유지
  - 백업 스키마는 유지하고 `syncMeta`는 백업 제외

### 5. 데이터 관리 UI와 장기 사용성

- 완료
- 반영 내용:
  - 즐겨찾기/히스토리/티켓/캠페인 검색 + 페이지네이션 추가
  - 페이지 크기 `20`
  - 티켓 상태 필터와 검색 합성
  - 기존 50/100개 하드 슬라이스 제거
  - 저장 상태 요약 카드 추가
    - 대략적인 localStorage 사용량
    - 항목 수 요약
    - `정상/주의/위험` 배지
  - 자동 삭제 대신 경고 + 수동 정리 정책 적용
  - AI 안내 문구를 엄격 필터 정책에 맞게 수정

## 문서 정합성 반영

동시에 아래 문서도 실제 구현 기준으로 갱신했습니다.

- `README.md`
- `claude.md`
- `cladue.md`
- `gemini.md`
- `PROJECT_ANALYSIS.md`
- `deploy_github_pages.md`
- `proxy/README.md`

주요 정리 항목:

- 앱 실행 중 백그라운드 동기화(프록시 설정 시) 표현 통일
- 프록시 우선순위에서 공개 fallback 기본값 제거
- `lotto_pro_sync_meta_v1` 저장 키 문서화
- 서비스워커 reload 정책 문서화
- 새 smoke 회귀 항목 문서화

## 검증 결과

- `npm install`: 통과
- `npm run lint`: 통과
- `node scripts/smoke/smoke.mjs`: 통과

이번에 추가/확인한 smoke 회귀:

- `proxy-opt-in sync`
- `persistence-flush`
- `notification-permission`
- `data-list pagination`
- `service-worker reload policy`

## 잔여 메모

- Node 실행 시 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 남아 있습니다.
  - 기능 오류는 아니며, 필요하면 추후 `package.json`의 `"type": "module"` 도입 여부를 검토하면 됩니다.
- 실제 배포 환경에서 서비스워커 업데이트 토스트와 reload 동작은 한 번 더 수동 브라우저 확인을 권장합니다.
