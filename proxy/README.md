# 로또 프록시 안내 (동적 동기화 선택 기능)

이 저장소에는 브라우저 요청을 공식 로또 API로 전달하고 CORS 헤더를 보완하는
Cloudflare Worker 예시가 포함되어 있습니다.

웹앱의 `proxy/latest`는 설정 가능한 주소를 읽기 때문에,
앱 코드를 바꾸지 않고도 정적 모드와 프록시 모드를 전환할 수 있습니다.

참고:

- 메인 웹앱 런타임 자산(font/icon/QR/캡처 라이브러리)은 현재 `assets/vendor/` same-origin 경로로 로컬화되어 있습니다.
- 따라서 프록시는 최신 회차 동기화 강화를 위한 선택 기능이며, UI 런타임은 프록시/CDN 의존 없이 동작합니다.

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
- 최대 구간 폭: `40` (예: `from=1200&to=1240` 허용, `to=1241` 거부)

앱에서 사용하는 방법:

- 주소 파라미터: `?proxyUrl=...` 또는 `?proxy=...`
- 이전 저장 키: `lotto_webapp_settings_v1.proxyLatestUrl`
- 2버전 설정 키: `lotto_pro_settings_v2.customProxy`
- 해석 우선순위: `query` > `v1` > `v2`
- 사용자 프록시가 없으면 앱은 기본 자동 동기화 fallback을 사용합니다.
- 사용자 프록시가 있으면 해당 주소를 우선 사용하고, 내장 fallback보다 먼저 시도합니다.
- 앱 UI 경로:
  - 사이드바 또는 모바일 헤더의 `설정` 버튼
  - 설정 모달의 `사용자 프록시 주소 (선택)` 입력란

권장 설정 예시:

- 앱 설정 입력란: `https://<your-worker>.workers.dev/proxy/latest`
- 앱 설정 입력란: `https://<your-worker>.workers.dev/?url=`
- 주소창 직접 테스트: `?proxyUrl=https%3A%2F%2F<your-worker>.workers.dev%2Fproxy%2Flatest`

메모:

- `?proxyUrl=` 값은 URL 인코딩한 전체 주소를 넣는 편이 안전합니다.
- 앱은 `/proxy/latest`, `{draw_no}`, `{url}`, 일반 prefix(`...?url=`) 형식을 모두 해석합니다.
- 공개 fallback 경로는 가용성/요금제/속도에 따라 변동될 수 있으므로, 안정적인 운영에는 사용자 프록시를 권장합니다.

## 로컬 점검

프록시 워커 코드는 저장소 루트 ESLint 설정에 포함됩니다.

```bash
npm install
npm run lint
```

## 참고

- 프록시는 선택 기능입니다.
- 프록시가 없어도 앱은 `data/winning_stats.json` + 로컬 업데이트 기반으로 계속 동작하며, 기본 자동 동기화를 시도합니다.
