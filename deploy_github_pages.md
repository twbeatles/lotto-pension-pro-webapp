# GitHub Pages 배포/운영 안내

`로또·연금복권 프로`는 루트 정적 파일을 그대로 GitHub Pages에 배포하는 no-build SPA입니다.

- 저장소: `https://github.com/twbeatles/lotto-pension-pro-webapp`
- 배포 URL: `https://twbeatles.github.io/lotto-pension-pro-webapp/`
- 패키지명: `lotto-pension-pro-webapp`
- 배포 대상: `index.html`, `assets/`, `data/`, `manifest.json`, `sw.js`, `.nojekyll`, `THIRD_PARTY_NOTICES.md`

## 배포 전 확인

```bash
npm install
npm run sync:sw-manifest
npm run lint
npm run check:data-freshness
npm run check:pension720
npm run check:pension720:freshness
node scripts/smoke/smoke.mjs
npm run build
git diff --check
```

`npm run build`는 별도 번들을 만들지 않고 `lint -> check:data-freshness -> check:pension720 -> check:pension720:freshness -> smoke`를 실행합니다. 연금복권720+ freshness 검증은 공식 endpoint를 조회하므로 네트워크 장애 시 실패할 수 있습니다.

배포 브랜치에 포함하지 않을 로컬 산출물:

- 브라우저 캡처/시각 검증 결과: `output/`
- Playwright HTML report: `playwright-report/`
- Playwright test output: `test-results/`, `.playwright/`
- benchmark/report output: `bench-results/`, `perf-results/`, `reports/`
- 브라우저에서 내려받은 앱 백업/CSV 파일

## 데이터 운영

- 로또 6/45:
    - 정적 데이터: `data/winning_stats.json`
    - 최신 회차: `1223`
    - row 수: `1222`
    - 허용 누락 회차: `[146]`
    - 최신성 확인: `npm run check:data-freshness`
- 연금복권720+:
    - 정적 데이터: `data/pension720_stats.json`
    - 최신 회차: `315`
    - 최신 날짜: `2026-05-14`
    - 최신 1등: `2조 537530`
    - 최신 보너스: `358127`
    - 동기화: `npm run sync:pension720`
    - 검증: `npm run check:pension720`
    - 공식 최신성 검증: `npm run check:pension720:freshness`

앱 실행 중에는 로또 6/45와 연금복권720+ 데이터를 각각 런타임 동기화하고, 실패 시 포함된 정적 데이터 또는 기존 메모리 데이터를 유지합니다.

## 백업/내보내기 파일명

- 전체 백업: `lotto_pension_pro_backup_v4_<timestamp>.json`
- 가져오기 overwrite 전 자동 백업: `lotto_pension_pro_before_replace_<timestamp>.json`
- 데이터 정리 전 자동 백업: `lotto_pension_pro_before_cleanup_<timestamp>.json`
- 연금복권720+ 저장 번호 CSV: `lotto_pension_pro_pension720_tickets_<timestamp>.csv`

이 파일들은 로컬 브라우저 다운로드로 생성됩니다. 저장소 루트에서 검증 작업을 하는 경우 `.gitignore`가 위 파일명을 제외하도록 유지합니다.

## 고급 데이터 연결 주소

고급 데이터 연결 주소는 로또 6/45 단건 최신 결과 동기화를 보강하는 옵션입니다.

예시:

```text
https://twbeatles.github.io/lotto-pension-pro-webapp/?proxyUrl=https%3A%2F%2F<worker>.workers.dev%2Fproxy%2Flatest
```

우선순위:

1. URL query의 `?proxyUrl=` 또는 `?proxy=`
2. legacy settings key의 `proxyLatestUrl`
3. `lotto_pro_settings_v2.customProxy`
4. 기본 자동 동기화 fallback

지원 형식:

- 절대 `http(s)` URL
- path에 `/proxy/latest` 포함
- `?url=`, `{url}`, `{draw_no}` 형식은 런타임에서 무시하고 기본 자동 동기화로 내려갑니다.

## PWA와 캐시

- 현재 `sw.js` cache version: `v25`
- cache names:
    - `lotto-pension-pro-app-shell-v25`
    - `lotto-pension-pro-data-v25`
- precache manifest는 `scripts/generate_sw_manifest.mjs`가 `assets/sw-precache-manifest.js`로 생성합니다.
- install precache에는 앱 셸과 `data/winning_stats.json`, `data/pension720_stats.json`이 포함됩니다.
- `online-check.txt`는 같은 출처 reachability probe이며 서비스워커 캐시 대상에서 제외됩니다.
- 2026-05-15 성능/UI 리팩토링은 앱 셸 변경에 해당하므로 `v25` 캐시와 precache manifest를 함께 배포합니다.

배포 후 확인:

1. Pages URL 접속
2. 강력 새로고침
3. DevTools > Application > Manifest에서 앱명 `로또·연금복권 프로` 확인
4. DevTools > Application > Service Workers에서 `v25` 활성화 확인
5. 로또 6/45 번호 생성과 연금복권 탭 진입 확인

## Repository Rename Checklist

GitHub repository rename은 코드 변경과 별도 운영 작업입니다.

1. GitHub에서 repository 이름을 `lotto-pension-pro-webapp`으로 변경
2. Pages source가 root/static 배포로 유지되는지 확인
3. 배포 URL이 `https://twbeatles.github.io/lotto-pension-pro-webapp/`로 열리는지 확인
4. README, manifest, index meta, package metadata가 새 이름을 가리키는지 확인
5. 기존 배포 주소를 공유한 곳이 있으면 새 URL로 갱신

## 기존 설치형 PWA 전환

기존 URL 또는 기존 설치 앱 사용자는 새 repository slug의 service worker scope와 start URL을 바로 받지 못할 수 있습니다.

1. 기존 앱에서 `데이터 관리` > `전체 데이터 내보내기`로 백업 파일을 저장
2. 새 URL `https://twbeatles.github.io/lotto-pension-pro-webapp/` 접속
3. 필요하면 기존 설치 앱을 제거하고 새 URL에서 다시 설치
4. 새 앱의 `데이터 관리` > `가져오기`로 백업 복원
5. 연금복권 탭에서 저장 번호와 최신 회차 당첨 확인 결과가 유지되는지 확인

## 로컬 실행

`file://` 직접 열기 대신 HTTP 서버를 사용합니다.

```bash
python -m http.server 5173
```

접속:

```text
http://localhost:5173/
```

## 브라우저 검증

```bash
npm run test:happy
npm run test:offline
npm run test:pwa-mobile
```

- 시스템 `Chrome`/`Edge` 또는 Playwright Chromium이 필요합니다.
- 브라우저가 없으면 `npx playwright install chromium`을 먼저 실행합니다.
- `npm run test:sync-live`는 네트워크 기반 opt-in 실조회 검증입니다.

## 문제 해결

- 화면은 열리지만 기능이 멈추면 Console의 module error와 Network의 `assets/modules/**/*.js` 상태를 먼저 확인합니다.
- 앱명이 오래 보이면 service worker와 site data를 지운 뒤 다시 접속합니다.
- 데이터가 오래되었다면 `npm run check:data-freshness`, `npm run check:pension720`, `npm run check:pension720:freshness` 결과를 확인합니다.
- precache 목록이 바뀐 뒤 반영되지 않으면 `npm run sync:sw-manifest`를 다시 실행하고 `sw.js` cache version을 확인합니다.
