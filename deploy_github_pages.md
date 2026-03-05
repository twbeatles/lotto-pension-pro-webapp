# GitHub Pages 배포/운영 안내

## 1) 배포 방식

현재 저장소는 루트(`.`) 정적 파일을 GitHub Pages에 배포하는 구조입니다.

- 배포 대상: `index.html`, `assets/`, `data/`, `manifest.json`, `sw.js`, `.nojekyll`
- 저장소: `https://github.com/twbeatles/lotto---webapp`
- 배포 URL: `https://twbeatles.github.io/lotto---webapp/`

## 2) 데이터 운영

- 기본 데이터 소스: `data/winning_stats.json`
- 실행 중 동기화: 앱의 최신 데이터 동기화 버튼 또는 앱 시작 후 백그라운드 동기화
- 로컬 업데이트 저장 위치: `localStorage.lotto_pro_updates_v2`
- 동기화 실행 정책:
  - in-flight 단일 실행(중복 클릭 시 기존 실행에 합류)
  - 수동 동기화(`syncDataBtn`)는 `cancelSyncBtn`으로 취소 가능
  - fallback 단건 요청은 최근 120회차로 제한

메모:
- 정적 JSON과 로컬 업데이트를 병합해 최신 상태를 구성합니다.
- 정적 기준 최신 회차는 `winning_stats.json` 내용 기준으로 판단합니다.

## 3) 프록시 모드 (선택)

정적 JSON 외 외부 API 동기화를 강화하려면 프록시를 사용할 수 있습니다.

예시:
`https://twbeatles.github.io/lotto---webapp/?proxyUrl=https://<worker>.workers.dev/proxy/latest?draw_no=1200`

우선순위:
1. `?proxyUrl=...` 또는 `?proxy=...`
2. `localStorage` 키 `lotto_webapp_settings_v1.proxyLatestUrl`
3. `lotto_pro_settings_v2.customProxy`
4. 공용 기본값(내부 우선, 외부 CORS는 최후순위)

## 4) 서비스워커/캐시 운영

- 현재 `sw.js` 캐시 버전: `v9`
- 핵심 자산 변경(특히 JS 모듈, 워커, CSS) 시 캐시 갱신이 필요하면 `CACHE_VERSION`을 올립니다.
- `DataIO.js` 의존 모듈인 `assets/modules/utils/backup.js`도 precache 대상에 포함되어야 오프라인 Data 탭 로딩이 안정적입니다.

배포 후 반영 확인:
1. 페이지 열기
2. 강력 새로고침(`Ctrl+F5`)
3. DevTools > Application > Service Workers에서 새 버전 활성화 여부 확인

## 5) 트러블슈팅: "화면은 로드되는데 기능이 안 됨"

1. DevTools Console에서 `SyntaxError`, `Invalid or unexpected token` 여부 확인
2. DevTools Network에서 핵심 모듈(`assets/modules/**/*.js`) 상태 코드 확인
3. SW 캐시 의심 시 사이트 데이터 삭제 후 재접속
4. 로컬에서 아래 검증 실행:

```bash
node scripts/smoke/smoke.mjs
```

## 6) 트러블슈팅: "문자가 깨져서 보임" (예: `理쒖떊`)

1. 강력 새로고침(`Ctrl+F5`) 후 재확인
2. DevTools > Application > Clear storage로 캐시/스토리지 정리 후 재접속
3. 배포 브랜치의 최신 커밋 반영 여부 확인
4. 로컬에서 화면 문구 검증:
   - 메인 동기화 상태 텍스트
   - 생성/AI/시뮬레이션 탭 버튼/라벨/토스트
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
node scripts/smoke/smoke.mjs
node scripts/perf/bench.mjs
```

`smoke`에는 아래 회귀 항목이 포함됩니다.
- 엄격 필터에서 필터 위반 조합이 생성되지 않는지
- draw 정규화 시 중복 번호/보너스 중복 차단되는지
- Import 후 즉시 반영 순서가 유지되는지
- 캠페인 상한 정책이 지켜지는지(`campaign-limit`)
- QR host/중복 번호 검증이 동작하는지(`qr-validation`)
- strategyRequest 키 순서가 달라도 dedupe 키가 동일한지(`ticket-dedupe`)
- 동기화 in-flight/취소 가드가 동작하는지(`sync-guard`)
