# 로또 프록시 안내 (동적 동기화 선택 기능)

이 저장소에는 브라우저 요청을 공식 로또 API로 전달하고 CORS 헤더를 보완하는
Cloudflare Worker 예시가 포함되어 있습니다.

웹앱의 `proxy/latest`는 설정 가능한 주소를 읽기 때문에,
앱 코드를 바꾸지 않고도 정적 모드와 프록시 모드를 전환할 수 있습니다.

## 배포 (Cloudflare Workers)

1. Wrangler를 설치합니다.
2. 특정 공식 주소를 노출하려면 `LOTTO_PROXY_URL` 비밀값을 설정합니다.
3. `worker.js`를 배포합니다.

```bash
wrangler deploy proxy/worker.js
```

## 조회 예시

- 최신 1회차: `https://<your-worker>.workers.dev/proxy/latest?draw_no=1180`
- 구간 조회: `https://<your-worker>.workers.dev/proxy/range?from=1175&to=1180`

`/proxy/latest` 응답 형식:
- 기본값: `hybrid` (기존 형식 + 정규화 형식 동시 제공)
- `?format=legacy`: 기존 형식 (`data.list[0]`)
- `?format=normalized`: 정규화 형식 (`data: [{ draw_no, numbers, ... }]`)

`/proxy/range` 응답 형식:
- 기본값: 정규화 배열 (`data: []`)
- `?format=legacy`: 기존 형식 배열 (`data.list`)
- `?format=hybrid`: 정규화 + 기존 형식 동시 제공

앱에서 사용하는 방법:
- 주소 파라미터: `?proxyUrl=...` 또는 `?proxy=...`
- 이전 저장 키: `lotto_webapp_settings_v1.proxyLatestUrl`
- 2버전 설정 키: `lotto_pro_settings_v2.customProxy`
- 해석 우선순위: `query` > `v1` > `v2` > `public fallback`

## 참고

- 프록시는 선택 기능입니다.
- 프록시가 불가능해도 앱은 `data/winning_stats.json` 기반으로 계속 동작합니다.
