# 로또·연금복권 프로

동행복권 로또 6/45와 연금복권720+ 데이터를 한 곳에서 확인하고, 통계 기반 번호 추천과 저장 관리를 제공하는 설치형 웹앱입니다.

- 배포 주소: https://twbeatles.github.io/lotto-pension-pro-webapp/
- 패키지명: `lotto-pension-pro-webapp`
- 앱명: `로또·연금복권 프로`
- 기술 구성: 정적 SPA, ES modules, service worker, localStorage

모든 추천은 재미와 참고용이며 당첨을 보장하지 않습니다.

## 3분 사용법

1. **번호 생성:** `번호 생성하기`로 로또 6/45 조합을 만들고, 필요하면 고정수/제외수/연속수 제한을 조정합니다.
2. **번호 추천:** `번호 추천` 탭에서 추천 방식을 고르고 `추천 시작`을 누릅니다. 분석 강도는 처음이면 `기본`을 권장합니다.
3. **연금복권:** `연금복권` 탭에서 조별·자리별 흐름을 확인하고 연금복권720+ 추천 번호를 만듭니다.
4. **저장:** 로또 6/45는 `내 번호 보관함`, 연금복권720+는 `저장한 연금복권 번호` 목록에 저장합니다.
5. **당첨 확인:** 저장한 로또 6/45 번호는 `당첨 확인`, 저장한 연금복권720+ 번호는 `연금복권` 탭에서 최신 결과와 비교합니다.
6. **백업:** `데이터 관리`의 `전체 데이터 내보내기`로 저장 데이터를 백업합니다.

## 주요 기능

- 번호 생성:
    - 로또 6/45 스마트 생성, 고정수/제외수, 연속수 제한, QR 생성
    - 목표 회차 자동 추적과 캠페인 생성
    - 생성 결과를 즐겨찾기, 히스토리, 내 번호 보관함에 저장
- 번호 추천:
    - 다중 전략, 자동 전략 선택, 후보풀 리랭킹, 유사 조합 분산
    - 추천 근거 신호 표시: 빈도, 최근성, 공백, 페어, 추세, 회귀, 베이즈, 필터
    - 같은 번호 다시 만들기 코드와 분석 강도 프리셋 지원
- 연금복권720+:
    - 공식 연금복권720+ 결과 JSON과 정적 데이터 스냅샷 사용
    - 조별 빈도, 위치별 숫자 빈도, 최근 흐름 요약
    - 조 빈도/최근성/공백, 자리별 숫자 빈도, 보너스 번호 보조 신호 기반 추천
    - 같은 6자리의 확장 조 제안, 개별 저장, 확장 조 일괄 저장
    - 저장 번호 복사, CSV 내보내기, 최신 회차 기준 간단 당첨 확인
- 당첨 확인:
    - 저장된 로또 6/45 번호를 최신 당첨 데이터와 비교
    - 검색, 상태 필터, 키보드 이동, QR 스캔 흐름 지원
- 데이터 관리:
    - 즐겨찾기, 히스토리, 내 번호 보관함, 캠페인, 연금복권 저장 번호 관리
    - 백업 v4 내보내기/가져오기, import 미리보기, 중복 병합
    - 로또 6/45와 연금복권720+ 데이터 source, 최신 회차, 마지막 확인 시각 요약
    - `백업하고 정리하기`로 오래된 히스토리와 정산 끝난 미당첨 번호 정리
- PWA:
    - 홈 화면 설치, 오프라인 기본 자산 캐시, 업데이트 확인/적용
    - 멀티탭 저장소 동기화와 부분 복구 상태 표시

## 데이터와 저장

- 로또 6/45 정적 데이터: `data/winning_stats.json`
    - 최신 회차: `1223`
    - row 수: `1222`
    - 허용 누락 회차: `[146]`
- 연금복권720+ 정적 데이터: `data/pension720_stats.json`
    - 최신 회차: `315`
    - 최신 날짜: `2026-05-14`
    - 최신 1등: `2조 537530`
    - 최신 보너스: `358127`
- 런타임 동기화:
    - 로또 6/45는 공식 API와 fallback provider를 사용합니다.
    - 연금복권720+는 `selectPstPt720WnList.do` 공식 JSON을 우선 확인하고 실패 시 포함 데이터로 유지합니다.
- 저장소:
    - 앱 데이터는 localStorage에 저장됩니다.
    - 기존 `lotto_pro_*` 저장소 키는 사용자 데이터 호환을 위해 유지합니다.
    - 백업 v4에는 즐겨찾기, 히스토리, 로또 티켓, 캠페인, 전략 프리셋, 로컬 업데이트, 연금복권 저장 번호가 포함됩니다.
    - 기본 백업 파일명 prefix는 `lotto_pension_pro_backup_v4`입니다.
    - 가져오기 overwrite 전 자동 백업 prefix는 `lotto_pension_pro_before_replace`, 데이터 정리 전 자동 백업 prefix는 `lotto_pension_pro_before_cleanup`입니다.
    - 연금복권720+ 저장 번호 CSV 파일명은 `lotto_pension_pro_pension720_tickets_<timestamp>.csv` 형식입니다.

## 배포와 PWA

- GitHub Pages 저장소/URL은 `lotto-pension-pro-webapp` 기준입니다.
- 배포 대상은 루트 정적 파일입니다. 별도 번들 산출물은 만들지 않습니다.
- service worker cache version: `v23`
- install precache에는 앱 셸과 `data/winning_stats.json`, `data/pension720_stats.json`이 포함됩니다.
- precache manifest가 바뀌면 아래 명령으로 생성 파일을 갱신합니다.

```bash
npm run sync:sw-manifest
```

## 개발 명령

```bash
npm install
npm run lint
npm run check:data-freshness
npm run check:pension720
npm run check:pension720:freshness
node scripts/smoke/smoke.mjs
npm run build
```

`check:pension720`는 checked-in 정적 JSON을 검증하고, `check:pension720:freshness`는 공식 endpoint 최신 회차와 정적 JSON을 비교합니다. 현재 `npm run build`는 두 검증을 모두 포함하므로 네트워크나 공식 endpoint 장애 시 실패할 수 있습니다.

연금복권720+ 정적 데이터를 공식 JSON에서 다시 동기화할 때:

```bash
npm run sync:pension720
```

브라우저 검증:

```bash
python -m http.server 5173
npm run test:happy
npm run test:offline
npm run test:pwa-mobile
```

선택 검증:

```bash
npm run test:sync-live
npm run bench:ai
npm run bench:ai:full
npm run format:check
```

현재 `format:check`는 저장소 기존 포맷 기준선의 영향을 받을 수 있으므로, 코드 변경 검증은 `npm run build`와 변경 파일 범위 Prettier 확인을 우선합니다.

## 프로젝트 구조

```text
lotto-pension-pro-webapp/
├── assets/
│   ├── modules/
│   │   ├── core/
│   │   ├── features/
│   │   └── utils/
│   ├── styles/
│   ├── vendor/
│   └── sw-precache-manifest.js
├── data/
│   ├── pension720_stats.json
│   └── winning_stats.json
├── proxy/
├── scripts/
│   ├── fetch_pension720_stats.mjs
│   ├── generate_sw_manifest.mjs
│   ├── smoke/
│   └── tests/
├── index.html
├── manifest.json
└── sw.js
```

## 운영 메모

- 실제 GitHub repository rename은 코드 변경과 별도 운영 작업입니다. rename 후 GitHub Pages source와 custom settings를 확인해야 합니다.
- `FUNCTIONAL_GAP_AND_COPY_REVIEW_2026-05-04.md`, `FUNCTIONAL_IMPLEMENTATION_AUDIT_2026-04-30.md`는 현재 작업트리에서 삭제 상태이며, 현행 문서 계약으로 취급하지 않습니다.
- 프록시 고급 연결 주소는 절대 URL이며 path에 `/proxy/latest`가 포함된 형식만 지원합니다.
- `?url=`, `{url}`, `{draw_no}` 스타일 프록시는 저장돼 있어도 런타임에서 기본 자동 동기화로 내려갑니다.
- 정적 JSON을 불러오지 못해도 기존 메모리 데이터 또는 로컬 업데이트 기반 부분 복구 상태를 유지할 수 있습니다.
