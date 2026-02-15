# GitHub Pages 웹앱 전환 분석 (v1) - [Implemented]

> **Note**: 이 문서는 초기 분석 문서입니다. 현재 프로젝트는 **Cloudflare Workers (`proxy/`)** 기반으로 프록시가 구현되었으며, 이를 백엔드로 사용하는 방향으로 진행 중입니다.


## 결론
- `PyQt6` 데스크톱 앱을 GitHub Pages(정적 호스팅)로 **완전 동일 동작으로 1:1 실행**하는 것은 불가
- 하지만 핵심 기능은 `client-only SPA`(HTML/CSS/JS + localStorage)로 재구현하여 **대부분 유지 가능**

## 현재 적용 여부
- 기존 Python 핵심 엔진(생성/통계/백테스트/AI 추천)에서 사용되는 계산 논리를 웹앱 스크립트로 이식
- UI는 다이얼로그 기반에서 탭 기반으로 구조 변경
- 데스크톱 저장(`~/.lotto_generator/*.json`)을 브라우저 영구저장(localStorage)로 전환
- 당첨데이터는 정적 `docs/data/winning_stats.json` 기반 로드
- 실시간 동기화는 기본 비활성, CORS 회피를 위해 **프록시/별도 함수 계층**은 후속 단계로 분리

## 구현 완료 포인트
- `docs/index.html`:
  - 탭: 생성/통계/AI/백테스트/체크/데이터
  - 결과 패널, 모달, 저장/내보내기/가져오기 버튼 배치
- `docs/assets/app.css`:
  - 다크/라이트 테마, 카드 레이아웃, 볼 스타일, 반응형 반영
- `docs/assets/app.js`:
  - 번호 생성기, 고정/제외/스마트/연속수 제한
  - 로컬 추첨 데이터 로드 (`./data/winning_stats.json`)
  - 통계(빈도/구간/쌍), AI 추천, 백테스트, 당첨 비교
  - 즐겨찾기·히스토리 관리(localStorage)
  - CSV/JSON 내보내기·가져오기
- `docs/data/winning_stats.json`:
  - `data/lotto_history.db` 기반 빌드 산출물(현재 1200+ 레코드)

## GitHub Pages 관점에서의 핵심 제약
- `dhlottery` API 직접 호출은 브라우저 CORS로 실패 가능성이 높음
- 동적 최신 동기화가 필수이면 아래 중 하나 필요
  - 서버리스 프록시(Cloudflare Worker, Netlify Function, GitHub Actions + API 갱신 파일) 추가
  - 최소한 주기적 정적 JSON 배포 파이프라인

## 권장 배포 전략 (안전)
- 1단계: 순수 정적 + 로컬 JSON (`docs` 폴더를 gh-pages로 배포)
- 2단계: 자동 갱신(주 1회) 워크플로우로 `winning_stats.json` 업데이트
- 3단계: 원하면 선택적으로 `/proxy/latest` 엔드포인트 추가 후 프론트엔드가 동기화 모드 전환

## 구현 완료 (Next steps 반영)
- 정적 데이터 동기화 자동화
  - `scripts/export_winning_stats_json.py` 추가: `data/lotto_history.db` 기반으로 `docs/data/winning_stats.json` 재생성
  - `.github/workflows/sync-winning-stats.yml` 추가: 주 1회 + 수동 실행 가능한 GitHub Actions로 DB 스크래핑 및 JSON 갱신
  - 변경분이 있을 때만 자동 커밋/푸시
- 프록시 연동 준비
  - SPA가 `lotto_webapp_settings_v1.proxyLatestUrl` 또는 `?proxyUrl=` / `?proxy=` 파라미터가 있으면 프록시 모드로 먼저 동기화 시도
  - 실패 시 기존 정적 `./data/winning_stats.json`으로 자동 fallback
- 프록시 템플릿
  - `proxy/worker.js` 추가: 공식 API를 중계하고 CORS 헤더를 붙이는 Cloudflare Worker 샘플
  - `proxy/README.md` 추가: 배포/운영 지침

## 운영 정책 제안
- 정적 모드: 기본 운영 모드 (gh-pages 단독), 사용자가 인터넷 없이도 즉시 동작
- 동기화 모드: proxy 환경이 구성되면 `?proxy=<https://...>/proxy/latest?draw_no=<회차>` 형태로 최신 회차 조회
- 권장:
  - 회차 누락 방지를 위해 GitHub Actions 주기 스크래핑을 우선 유지
  - 사용자가 최신성 민감도 높으면 프록시 + 스케줄 갱신 병행

## 수용 기준 매핑
- 생성 규칙 일치, 히스토리/즐겨찾기 지속성, 백테스트 성능, 결과 내보내기, 최신 회차 fallback 동작은 SPA에서 충분히 검증 가능
- 다만 회차 데이터 최신성/동기화는 현재 단계에서 정적 갱신 정책에 의존
