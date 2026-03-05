# 로또 6/45 프로 웹앱

이 프로젝트는 동행복권 당첨 정보를 조회, 분석하고 번호를 생성하는 웹앱입니다.
기존 파이썬 데스크톱 앱을 단일 페이지 웹앱으로 전환한 버전입니다.

## 배포 주소
- GitHub Pages: https://twbeatles.github.io/lotto---webapp/

## 최근 통합 개선 반영 (2026-03-05)
- 리포트 `1~9 + A~E` 권고사항을 한 번에 반영했습니다.
- 제한 상수를 `CONFIG.LIMITS`로 중앙화했습니다.
  - `MAX_BACKTEST_SPAN=300`
  - `MAX_CAMPAIGN_WEEKS=52`
  - `MAX_CAMPAIGN_SETS_PER_WEEK=20`
  - `MAX_CAMPAIGN_TOTAL_TICKETS=500`
  - `MAX_SYNC_FALLBACK_DRAWS=120`
- 백테스트 검증을 UI/메인 스레드/워커 3단계로 강화하고, `WINS` payload에 `matchedCount`, `bonusHit`, `hitText`를 추가했습니다.
- 백테스트 CSV를 `strategy_id`, `strategy_label` 분리 포맷으로 수정했습니다.
- 동기화를 단일 실행(single-flight)으로 고정하고, 수동 동기화에 한해 취소 버튼(`cancelSyncBtn`)을 지원합니다.
- QR 파서에 공식 host 화이트리스트와 중복 번호 거부 검증을 추가했습니다.
- 데이터 Import에 옵션 패널을 추가했습니다.
  - 모드: `merge` / `overwrite`
  - 설정 적용: `theme`, `proxy`, `strategyPrefs`
  - 기본 정책: `Merge=설정 미적용`, `Overwrite=설정 적용`
- 서비스워커 캐시 버전을 `v9`로 상향했습니다.
- 스모크 테스트에 회귀 4건을 추가했습니다.
  - `campaign-limit`, `qr-validation`, `ticket-dedupe`, `sync-guard`

## 최근 안정화 반영 (2026-03-01)
- 모듈 파싱 오류(`SyntaxError: Invalid or unexpected token`)로 앱 초기화가 중단되던 문제를 복구했습니다.
- 복구 대상: `DataManager`, `Ai`, `Backtest`, `Generator`의 깨진 문자열 리터럴.
- 서비스워커 캐시 버전을 `v8`로 상향해 배포 후 구버전 캐시 잔존 가능성을 낮췄습니다.
- 배포 직후 이상 동작 시 강력 새로고침(`Ctrl+F5`) 또는 사이트 데이터 삭제 후 재확인하세요.

### 인코딩 정리 2차 (2026-03-01)
- 메인 상태 텍스트(`최신`, `업데이트 가능`, `오프라인`) 깨짐 현상을 복구했습니다.
- 생성/시뮬레이션/AI 탭의 토스트, 버튼 라벨, 로그 메시지, 접근성 라벨(`aria-label`)의 깨진 문구를 정리했습니다.
- 사용자 화면에서 보이는 한글 문구 기준으로 전역 점검을 수행했습니다.

### 기능 품질 강화 3차 (2026-03-01)
- 전략 엔진을 `엄격 필터 모드`로 고정했습니다. 필터를 만족하지 못하면 무필터 랜덤 조합으로 채우지 않습니다.
- 백테스트 워커의 무필터 랜덤 대체를 제거하고, 요약에 `requestedTickets/generatedTickets/fillRate`를 추가했습니다.
- 데이터 Import 완료 후 즉시 `fetchWinningStats -> updateLatestWin -> refreshCurrentRoute -> renderDataLists` 순서로 화면을 갱신합니다.
- 회차 정규화에서 `중복 번호`, `보너스 번호 중복`을 차단했습니다(`DataManager`, `backup` 공통).
- 캠페인 렌더링을 `textContent` 기반 DOM 조립으로 변경해 Import 경유 XSS 위험을 낮췄습니다.
- 서비스워커 precache에 `assets/modules/utils/backup.js`를 추가했습니다(`CACHE_VERSION: v8`).
- 스모크 테스트에 회귀 3건(엄격 필터, draw 정규화, post-import refresh 순서)을 추가했습니다.
- 코드베이스 텍스트 파일 UTF-8 디코드 점검 결과, 인코딩 오류 파일은 발견되지 않았습니다.

## 주요 기능
- 번호 생성: 스마트 추천, 연속수 제한, 고정수/제외수 설정, QR 생성
- 티켓북/캠페인:
  - 생성 결과와 AI 결과를 회차 기준으로 티켓북에 저장
  - `N주 x 주당 M세트` 캠페인 생성으로 일괄 등록
  - 안전 상한 적용: `최대 52주`, `주당 최대 20세트`, `총 500티켓`
  - 동기화 시 미정산 티켓 자동 정산
- 인공지능 예측:
  - 다중 전략(앙상블, 균형, 고빈도/저빈도 등) 지원
  - 몬테카를로 기반 정밀 시뮬레이션
  - 추천 조합별 근거 신호(빈도/최근성/공백/페어/필터) 표시
- 전략 시뮬레이션:
  - 단일/다중 전략 비교(최대 5개)
  - 백테스트 범위 상한: 최대 300회차
  - 수익률, 당첨률, 총비용, 총상금, 5등 이상 비교
  - 비교 결과 CSV 내보내기
- 통계 분석: 번호 구간 분포, 홀짝/고저 비율, 자주/드물게 나온 번호, 상위 동시출현 번호쌍
- 모바일 최적화 화면: 세이프 영역 대응, 하단 탐색, 반응형 레이아웃
- 알림 관리: 인앱 알림과 시스템 알림 설정
- 오프라인 앱 지원:
  - 네트워크가 없을 때도 기본 기능 사용 가능
  - 백그라운드 최신 데이터 동기화
  - 홈 화면 설치 지원
- 데이터 백업/복원: 백업 v1/v2/v3 가져오기, v3(`localUpdates`, `strategyPresets`) 내보내기
  - Import 옵션: `merge/overwrite` + 설정 적용 체크박스
- 프록시 지원: `dhlottery.co.kr` 우회 및 사용자 프록시 주소 설정
  - 우선순위: `?proxyUrl/?proxy` -> `lotto_webapp_settings_v1.proxyLatestUrl` -> `lotto_pro_settings_v2.customProxy` -> 공용 기본값

## 구성 개요

```mermaid
graph LR
    U[웹 사용자] -->|정적 배포| G[GitHub Pages]
    U -->|데이터 동기화| D[정적 JSON 데이터]
    U -->|브라우저 저장소| L[localStorage]
```

- 화면/로직: 바닐라 자바스크립트(ES 모듈) + CSS 변수 (빌드 단계 없음)
- 배포: 정적 호스팅(GitHub Pages 호환)
- 데이터: 정적 JSON(`data/winning_stats.json`) + 로컬 저장소
- 서비스워커: 같은 출처 리소스 중심 캐시 전략 (`CACHE_VERSION: v9`)

## 프로젝트 구조

```text
lotto---webapp/
├── assets/                  # 정적 리소스(CSS, JS, 이미지)
│   ├── modules/             # 자바스크립트 모듈
│   │   ├── core/            # 앱/데이터/전략/UI 핵심
│   │   ├── features/        # 기능 모듈(예측/시뮬레이션/검증/통계 등)
│   │   └── utils/           # 공통 유틸리티
│   ├── icons/               # 앱 아이콘
│   ├── app.css              # 통합 스타일
│   ├── backtest.worker.js   # 시뮬레이션 워커
│   └── strategy.worker.js   # 생성/추천 워커
├── data/                    # 정적 데이터
│   └── winning_stats.json   # 로또 당첨 이력
├── proxy/                   # 프록시 워커 예시
├── scripts/                 # 로컬 점검 스크립트(perf/smoke)
├── index.html               # 앱 진입점
├── manifest.json            # 웹앱 설치 설정
└── sw.js                    # 서비스워커
```

## AI 핸드오프 기준 파일명
- 표준 문서: `claude.md`
- 호환 별칭: `cladue.md` (오탈자 호환용)
- 보조 문서: `gemini.md`

## 로컬 스모크 테스트

```bash
node scripts/smoke/smoke.mjs
```

성능 회귀를 함께 확인하려면:

```bash
node scripts/perf/bench.mjs
```

## 라이선스
- 현재 저장소에는 `LICENSE` 파일이 없습니다.
