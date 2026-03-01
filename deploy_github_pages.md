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

- 현재 `sw.js` 캐시 버전: `v7`
- 핵심 자산 변경(특히 JS 모듈, 워커, CSS) 시 캐시 갱신이 필요하면 `CACHE_VERSION`을 올립니다.

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

## 6) 로컬 실행

`file://` 직접 열기 대신 HTTP 서버로 실행하세요.

```bash
python -m http.server 5173
```

접속:
- `http://localhost:5173/`

## 7) 로컬 검증 명령

```bash
node scripts/smoke/smoke.mjs
node scripts/perf/bench.mjs
```
