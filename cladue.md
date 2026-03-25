# cladue.md (Compatibility Alias)

이 파일은 과거 오탈자 파일명(`cladue.md`) 호환을 위해 유지됩니다.

표준 AI 핸드오프 문서는 아래 파일입니다.

- `claude.md`
- 최신 갱신일: `2026-03-25`

현재 기준 문서에는 아래 운영 변경이 반영되어 있습니다.

- 서비스워커 캐시 버전 `v17`
- 기본 자동 동기화 + 사용자 프록시 우선 정책
- `lotto_pro_sync_meta_v1` 동기화 메타 저장
- `syncMeta.lastWarningAt` / `lastWarningMessage` 응답 구조 경고 저장
- 설정 모달 기반 테마/알림/프록시/저장 상태 관리
- 모바일 설정 모달 단일 열 레이아웃
- 데이터 관리 화면 검색/페이지네이션 + `localUpdates` 요약/정리 버튼
- 목표 회차 입력 자동 추적 + 재설정 버튼
- 생성 탭 캠페인 초기화 시 목표 회차 자동추적 메타데이터 복구
- 과거 회차 티켓 저장 직후 즉시 정산
- Import 후 orphan campaign 자동 정리 및 cleanup 수치 toast 표시
- 공식 지원 커스텀 프록시는 `/proxy/latest` 형식만 허용
- 비지원 프록시 형식은 설정 경고 후 기본 자동 동기화로 전환
- 단건 동기화 payload mismatch 시 `SYNC_FETCH_ONE_INVALID_PAYLOAD` 로그
- `refreshCurrentRoute()` stale guard
- `check` 탭 이탈 시 QR 스캐너 정리
- `data/winning_stats.json` install precache
- AI 전략 다변화(`consensus_portfolio`, `bayesian_smooth`, `momentum_recent`, `mean_reversion_cycle`)
- AI 전용 자동 전략 `auto_recent_top`, `auto_ensemble_top3`
- AI 후보풀 리랭킹 + 추천 점수/자동 선택 진단 표시
- `npm run bench:ai` 전략 회귀평가 스크립트
- 코어/기능 코드 분할(`core/app`, `core/data`, `core/strategy`, `features/*`)

최신 기능 점검 문서는 `FUNCTIONAL_IMPLEMENTATION_REVIEW_2026-03-25.md`를 참조하세요.

새로운 세션에서는 반드시 `claude.md`를 기준 문서로 사용하세요.
