# GitHub Pages 배포/운영 가이드 (웹앱)

## 1) 정적 배포

1. GitHub Pages 소스 폴더를 `docs/`로 설정
2. 브랜치를 배포 브랜치(예: `main`)로 지정
3. `/docs` 경로 접근 시
   - `docs/index.html`
   - `docs/assets/*`
   - `docs/data/winning_stats.json`
이 함께 제공되면 동작합니다.

## 2) 정적 데이터 갱신 (GitHub Actions)

워크플로: `.github/workflows/sync-winning-stats.yml`

- 스케줄: 매주 월요일 03:00 UTC
- 수동 실행: `workflow_dispatch`
- 동작:
  1. `scripts/scrape_lotto_history.py`로 로컬 DB 갱신
  2. `scripts/export_winning_stats_json.py`로 `docs/data/winning_stats.json` 재생성
  3. 변경분이 있을 때만 커밋/푸시

로컬에서 동일 작업을 수동으로 실행할 때:
```bash
python scripts/scrape_lotto_history.py
python scripts/export_winning_stats_json.py
```

## 3) proxy 모드 (선택)

정적 JSON이 충분하지 않다면 쿼리 파라미터로 프록시를 켭니다.

예:  
`https://<gh-pages>/index.html?proxyUrl=https://<worker>.workers.dev/proxy/latest?draw_no=1200`

우선순위:
1) `?proxyUrl=...` 또는 `?proxy=...`
2) `localStorage` 키 `lotto_webapp_settings_v1.proxyLatestUrl`
3) `lotto_pro_settings_v2.customProxy`
4) 정적 JSON fallback (`./data/winning_stats.json`)

메모:
- 앱 시작 시 v1 키가 있고 v2가 비어 있으면 v2로 자동 이관됩니다.
- `sw.js`는 cross-origin API 요청을 가로채지 않으므로, 프록시/API 에러는 원래 fetch 에러 semantics를 유지합니다.

## 4) 확인 체크리스트

- 앱 실행 시 CORS 에러 없이 데이터가 노출되는지
- proxy 실패 시 정적 JSON로 fallback 되는지
- 새로고침해도 favorites/history가 유지되는지
- `sync` 상태 문구(`GitHub Pages` 페이지 하단) 표시

## Local Run (HTTP server required)

Opening `docs/index.html` via double click (`file://`) may break `fetch()` (browser origin restrictions) and make the app look like "UI works but features don't".

Run locally like this:

```bash
cd docs
python -m http.server 5173
```

Then open:
- `http://localhost:5173/`
