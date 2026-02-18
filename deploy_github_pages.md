# GitHub Pages 배포/운영 가이드 (웹앱)

## 1) 정적 배포

현재 저장소는 루트(`.`)를 그대로 GitHub Pages 아티팩트로 배포합니다.

- 워크플로: `.github/workflows/deploy.yml`
- 트리거: `main` 또는 `master` 브랜치 푸시, 수동 실행(`workflow_dispatch`)
- 배포 대상: `index.html`, `assets/`, `data/`, `manifest.json`, `sw.js` 등 루트 정적 파일

## 2) 데이터 운영

- 기본 데이터 소스: `data/winning_stats.json`
- 런타임 동기화: 앱의 **최신 데이터 동기화** 버튼 또는 앱 시작 시 백그라운드 동기화
- 로컬 업데이트 저장: `localStorage`의 `lotto_pro_updates_v2`

메모:
- 정적 JSON과 로컬 업데이트가 병합되어 최신 상태를 구성합니다.
- 최신 회차 반영이 필요하면 `data/winning_stats.json`을 갱신 후 커밋/푸시하면 됩니다.

## 3) proxy 모드 (선택)

정적 JSON 외 외부 API 동기화를 강화하려면 프록시를 사용합니다.

예:
`https://<gh-pages>/index.html?proxyUrl=https://<worker>.workers.dev/proxy/latest?draw_no=1200`

우선순위:
1. `?proxyUrl=...` 또는 `?proxy=...`
2. `localStorage` 키 `lotto_webapp_settings_v1.proxyLatestUrl`
3. `lotto_pro_settings_v2.customProxy`
4. public fallback

## 4) 확인 체크리스트

- 앱 실행 시 최신 당첨 정보가 표시되는지
- proxy 실패 시에도 정적 JSON 기반 기능이 유지되는지
- 새로고침 후 favorites/history/ticketBook이 유지되는지
- 티켓북 미정산 항목이 동기화 후 자동 정산되는지

## 5) Local Run (HTTP server required)

`file://` 직접 열기 대신 HTTP 서버로 실행하세요.

```bash
python -m http.server 5173
```

열기:
- `http://localhost:5173/`
