# 기능 구현 리스크 및 보강 점검 (2026-02-28)

## 점검 범위
- 기준 계획: `IMPLEMENTATION_RISK_CHECK_2026-02-28` A(1~9), B(1~5) 전체 반영
- 참조 문서: `README.md`, `claude.md`, `cladue.md`(호환 별칭), `gemini.md`

## 반영 상태

### A. 잠재 문제
- [x] A1 동기화 정책 프로파일화 (`idle`/`manual`/`refresh`)
- [x] A2 백테스트 상금 계산 모드 분리 (`hybrid_dynamic_first`, `fast_fixed`)
- [x] A3 전략 워커 동적 타임아웃/재시도/최종 코드 에러 처리
- [x] A4 백업 v3 확장 (`localUpdates`, `strategyPresets`)
- [x] A5 import overwrite 후 프록시 입력 UI 동기화
- [x] A6 프록시 fallback 순서 조정 (내부 우선, 외부 최후순위)
- [x] A7 백테스트 실행 중 취소(중지) UX 추가
- [x] A8 README 구조 설명을 현재 저장소 기준으로 정리
- [x] A9 `claude.md` 표준화 + `cladue.md` 호환 유지

### B. 추가 구현
- [x] B1 백테스트 신뢰도(상금) 모드 분리 + 결과/안내 문구 표시
- [x] B2 동기화 정책 객체화
- [x] B3 백업 유틸(`assets/modules/utils/backup.js`) 도입
- [x] B4 코드형 관측성 로그(`SYNC_*`, `WORKER_TIMEOUT_*`) 추가
- [x] B5 자동 스모크 스크립트(`scripts/smoke/smoke.mjs`) 추가

## 반영 파일
- `assets/modules/core/DataManager.js`
- `assets/modules/core/StrategyEngine.js`
- `assets/modules/core/StrategyWorkerClient.js`
- `assets/modules/core/StrategyCatalog.js`
- `assets/modules/features/Backtest.js`
- `assets/modules/features/Generator.js`
- `assets/modules/features/Ai.js`
- `assets/modules/features/DataIO.js`
- `assets/modules/utils/config.js`
- `assets/modules/utils/backup.js`
- `assets/backtest.worker.js`
- `index.html`
- `assets/app.css`
- `README.md`, `claude.md`, `cladue.md`, `gemini.md`, `deploy_github_pages.md`
- `.gitignore`
- `scripts/smoke/smoke.mjs`

## 검증 결과
- `node --check` (수정 JS 파일 대상): 통과
- `node scripts/smoke/smoke.mjs`: 통과
- `node scripts/perf/bench.mjs`: 통과

## 메모
- AI 핸드오프 표준 파일명은 `claude.md`입니다.
- `cladue.md`는 오탈자 호환 안내 문서로 유지됩니다.
