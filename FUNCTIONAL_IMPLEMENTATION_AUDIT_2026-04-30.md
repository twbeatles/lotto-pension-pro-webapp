# 기능 구현 점검 리포트 (2026-04-30)

> 2026-05-04 후속 반영: PWA 업데이트 UX, Android PWA 무시드 난수 고정 방지, 초보자용 문구, 백업/복원 미리보기, 저장 공간 정리, 데이터 최신성 검증은 `FUNCTIONAL_GAP_AND_COPY_REVIEW_2026-05-04.md`와 현재 README가 최신 기준입니다.

## 상태

- 2026-04-30 기능 구현 점검에서 나온 우선 개선 항목은 코드, 테스트, 문서에 반영했다.
- 이 문서는 `README.md`, `claude.md`, `gemini.md`에서 참조하는 현재 감사/후속 수정 기록이다.
- 현재 Git 기준 삭제로 추적되는 문서 파일은 없다.

## 반영된 개선

- 데이터 연결 주소(고급) 변경 시 진행 중 sync를 먼저 취소하고 새 설정 또는 기본 자동 동기화 경로를 큐잉한다.
- 동기화 payload 날짜는 유효한 `YYYY-MM-DD` 또는 공식 `YYYYMMDD`만 수락한다.
- 최신 당첨 카드의 날짜/placeholder 문자열은 HTML escape 후 렌더링한다.
- 전략 워커 최종 타임아웃 시 busy worker를 terminate하고 fallback 흐름으로 넘어간다.
- 정적 JSON 일시 실패 시 기존 메모리 `winningStats`를 기본 보존한다.
- Import는 백업 파일 크기, 티켓 총량, strategyRequest 직렬화 크기/깊이/키/배열 상한을 적용한다.
- Cloudflare Worker `/proxy/latest`는 `draw_no` 생략 시 KST 기준 예상 최신 회차를 조회한다.
- Prettier 기준선과 ignore 범위를 명시했다.
- 브라우저 happy path 검증과 공식 API 실조회 검증을 별도 opt-in 명령으로 추가했다.

## 문서 정합성

- `README.md`: 2026-04-30 후속 개선, 새 검증 명령, 현재 감사 문서명을 반영했다.
- `claude.md`: 현재 날짜, 새 테스트 파일, import 제한 상수를 반영했다.
- `gemini.md`: 오래된 이전 감사 문서 참조를 04-30 문서로 교체하고 최근 수정 목록을 동기화했다.
- `deploy_github_pages.md`: GitHub Pages 운영, 프록시 정책, 검증 명령이 현재 코드와 맞다.
- `proxy/README.md`: `/proxy/latest` 기본 최신 회차 조회와 `/proxy/range` 제한을 현재 Worker 구현과 맞춘 상태다.
- `.gitignore`: 배포에 필요한 정적 자산은 추적하고, 로컬 캐시/브라우저 테스트/성능 리포트 산출물은 제외한다.

## 검증 명령

최종 푸시 전 확인 대상:

```bash
npm run format:check
npm run build
npm run test:offline
npm run test:happy
npm run test:sync-live
node scripts/perf/bench.mjs
npm run bench:ai
```

`npm run test:sync-live`는 네트워크 상태와 공식 API 가용성에 따라 실패할 수 있는 opt-in 실조회 점검이다.
