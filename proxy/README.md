# 로또 데이터 연결 주소(고급) / 프록시 안내

이 저장소에는 브라우저 요청을 공식 로또 API로 전달하고 CORS 헤더를 보완하는
Cloudflare Worker 예시가 포함되어 있습니다.

웹앱의 `데이터 연결 주소(고급)` 입력은 설정 가능한 `/proxy/latest` 주소를 읽기 때문에,
앱 코드를 바꾸지 않고도 기본 자동 동기화와 고급 연결 주소 모드를 전환할 수 있습니다.

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

- 최신 회차: `https://<your-worker>.workers.dev/proxy/latest`
- 특정 회차 단건 테스트: `https://<your-worker>.workers.dev/proxy/latest?draw_no=1180`
- 구간 조회: `https://<your-worker>.workers.dev/proxy/range?from=1175&to=1180`

`/proxy/latest` 응답 형식:

- 기본값: `hybrid` (기존 형식 + 정규화 형식 동시 제공)
- `?format=legacy`: 기존 형식 (`data.list[0]`)
- `?format=normalized`: 정규화 형식 (`data: [{ draw_no, numbers, ... }]`)
- 앱은 `draw_no`/`ltEpsd`를 정수 `>= 1`로만 수락하므로 프록시 응답도 소수/문자열 소수/0/음수 회차를 반환하지 않아야 합니다.
- `draw_no`를 생략하면 Worker가 KST 기준 예상 최신 회차를 조회합니다.

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
- 고급 데이터 연결 주소가 없으면 앱은 기본 자동 동기화 fallback을 사용합니다.
- 고급 데이터 연결 주소가 있어도 공식 지원 형식(`/proxy/latest`)일 때만 우선 사용하고, 내장 fallback보다 먼저 시도합니다.
- 비지원 연결 주소 형식은 설정 경고를 표시한 뒤 기본 자동 동기화로 내려갑니다.
- 앱 UI 경로:
    - 사이드바, 모바일 헤더, 또는 모바일 `더보기`의 `설정` 진입
    - 설정 모달의 `데이터 연결 주소(고급)` 입력란

권장 설정 예시:

- 앱 설정 입력란: `https://<your-worker>.workers.dev/proxy/latest`
- 주소창 직접 테스트: `?proxyUrl=https%3A%2F%2F<your-worker>.workers.dev%2Fproxy%2Flatest`

메모:

- `?proxyUrl=` 값은 URL 인코딩한 전체 주소를 넣는 편이 안전합니다.
- 앱의 공식 지원 커스텀 프록시 형식은 절대 URL + `/proxy/latest` 엔드포인트입니다.
- `?url=`, `{url}`, `{draw_no}`, 일반 prefix 형식은 런타임에서 지원하지 않으며 기본 자동 동기화로 내려갑니다.
- `/proxy/latest` 가 JSON은 반환하지만 지원하지 않는 shape를 주면 앱은 `SYNC_FETCH_ONE_INVALID_PAYLOAD` 로그를 남기고 설정 모달에 최근 응답 구조 경고를 표시합니다.
- 공개 fallback 경로는 가용성/요금제/속도에 따라 변동될 수 있으므로, 안정적인 운영에는 고급 데이터 연결 주소 사용을 권장합니다.

## 로컬 점검

프록시 워커 코드는 저장소 루트 ESLint 설정에 포함됩니다.

```bash
npm install
npm run lint
```

## 참고

- 프록시는 선택 기능입니다.
- 프록시가 없어도 앱은 `data/winning_stats.json` + 로컬 업데이트 기반으로 계속 동작하며, 기본 자동 동기화를 시도합니다.
