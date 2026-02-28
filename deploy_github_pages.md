# GitHub Pages 배포/운영 안내 (웹앱)

## 1) 정적 배포 방식

현재 저장소는 루트(`.`) 정적 파일을 그대로 GitHub Pages에 배포하는 구조입니다.

- 배포 대상: `index.html`, `assets/`, `data/`, `manifest.json`, `sw.js` 등
- 현재 저장소 기준으로 `.github/workflows`는 포함되어 있지 않습니다.
- 자동 배포가 필요하면 별도 GitHub Actions 워크플로를 추가해 운영합니다.

## 2) 데이터 운영

- 기본 데이터 소스: `data/winning_stats.json`
- 실행 중 동기화: 앱의 **최신 데이터 동기화** 버튼 또는 앱 시작 후 백그라운드 동기화
- 로컬 업데이트 저장 위치: `localStorage`의 `lotto_pro_updates_v2`

메모:
- 정적 JSON과 로컬 업데이트를 병합해 최신 상태를 구성합니다.
- 최신 회차를 반영하려면 `data/winning_stats.json` 갱신 후 커밋/푸시하면 됩니다.

## 3) 프록시 모드 (선택)

정적 JSON 외 외부 API 동기화를 강화하려면 프록시를 사용할 수 있습니다.

예시:
`https://<gh-pages>/index.html?proxyUrl=https://<worker>.workers.dev/proxy/latest?draw_no=1200`

우선순위:
1. `?proxyUrl=...` 또는 `?proxy=...`
2. `localStorage` 키 `lotto_webapp_settings_v1.proxyLatestUrl`
3. `lotto_pro_settings_v2.customProxy`
4. 공용 기본값(내부 우선, 외부 CORS는 최후순위)

## 4) 점검 목록

- 앱 실행 시 최신 당첨 정보가 표시되는지
- 프록시 실패 시에도 정적 JSON 기반 기능이 유지되는지
- 새로고침 후 즐겨찾기/히스토리/티켓북 데이터가 유지되는지
- 티켓북 미정산 항목이 동기화 후 자동 정산되는지
- 백업 v3 내보내기/가져오기(v1/v2/v3 호환)가 동작하는지

## 5) 로컬 실행 (HTTP 서버 필요)

`file://` 직접 열기 대신 HTTP 서버로 실행하세요.

```bash
python -m http.server 5173
```

접속:
- `http://localhost:5173/`

## 6) 로컬 검증 명령

```bash
node scripts/smoke/smoke.mjs
node scripts/perf/bench.mjs
```
