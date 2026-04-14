# 기능 구현 정합성 감사 및 구조 분할 반영 (2026-04-14)

## 범위

- 생성 탭 전략 선택 정합성
- 생성 결과 provenance 보존
- 프록시 변경 시 sync abort 보장
- 대형 파일 분할 리팩토링 후 public facade / smoke 회귀 정합성 확인

## 반영 완료 항목

### 1. 생성 탭 전략 선택 source of truth 정리

- 생성 실행은 이제 전략 셀렉트 기준 request 를 그대로 사용합니다.
- `smartMode`, `preferHot`, `balanceMode` 는 quick preset 역할만 수행합니다.
- `generate()` 와 `generateCampaign()` 직전 레거시 토글 기반 전략 덮어쓰기를 제거했습니다.

영향 파일:

- `assets/modules/features/generator/actions.js`
- `assets/modules/features/generator/form.js`

회귀:

- `generator strategy-selection regression`
- `campaign derived-seed regression`

### 2. generated 상태 provenance 보존

- 런타임 `generated` 상태는 이제 단순 번호 배열이 아니라 provenance 엔트리를 유지합니다.
- 엔트리 shape:
  - `{ numbers, strategyRequest, createdAt, source }`
- 생성 결과 카드 저장, AI -> 생성 탭 주입, 전체 저장 흐름은 모두 생성 시점 request 를 유지합니다.

영향 파일:

- `assets/modules/core/data/records.js`
- `assets/modules/core/app/moduleLoader.js`
- `assets/modules/features/ai/form.js`
- `assets/modules/features/generator/actions.js`

회귀:

- `generated ticket provenance regression`
- `requestNumbers replace regression`

### 3. sync abort ownership 보강

- manual/auto 구분 없이 모든 sync 실행이 내부적으로 abort 가능하게 정리됐습니다.
- public cancel UX 는 기존대로 manual sync 에만 노출됩니다.
- 프록시 fingerprint 가 바뀌면 기존 실행을 중단하고 새 실행만 상태를 정리합니다.

영향 파일:

- `assets/modules/core/data/defaults.js`
- `assets/modules/core/data/sync.js`
- `assets/modules/core/DataManager.js`

회귀:

- `sync-guard regression`
- `proxy-change abort regression`
- `auto-sync fallback regression`

## 구조 분할 리팩토링 반영

- facade entry path 는 유지했습니다.
  - `assets/modules/core/LottoApp.js`
  - `assets/modules/core/DataManager.js`
  - `assets/modules/core/UIManager.js`
  - `assets/modules/features/Check.js`
  - `scripts/smoke/cases/regressions.mjs`
- 내부 구현은 책임별 하위 모듈로 분리했습니다.
  - `assets/modules/core/app/moduleLoader/`
  - `assets/modules/core/app/dataLists/`
  - `assets/modules/core/data/records/`
  - `assets/modules/core/data/persistence/`
  - `assets/modules/core/data/sync/`
  - `assets/modules/core/ui/`
  - `assets/modules/features/check/`
  - `assets/modules/features/backtest/`
  - `scripts/smoke/cases/regressions/`

### smoke 구조 후속 정리

- `scripts/smoke/cases/regressions/manifest.mjs`
  - 회귀 실행 순서, pass 라벨, barrel export parity 기대 집합 관리
- `scripts/smoke/cases/regressions/support.mjs`
  - 공통 smoke import / helper 의존성 정리
- `strategy.mjs`, `assets.mjs`, `ui.mjs`
  - `shared.mjs` 재-export가 아니라 실제 구현을 직접 보유하도록 전환

추가 회귀:

- `facade export parity regression`
- `regression barrel export parity regression`

## 검증

실행 기준:

```bash
npm run lint
node scripts/smoke/smoke.mjs
```

결과:

- `lint` 통과
- `smoke` 통과
- 비실패 로그로 `MODULE_TYPELESS_PACKAGE_JSON` 경고와 mock `network-timeout` 로그가 남지만 최종 결과는 `[DONE] smoke checks passed`

## 현재 잔여 메모

- smoke 구현의 일부는 아직 `scripts/smoke/cases/regressions/shared.mjs` 에 남아 있습니다.
- 후속 작업 우선순위는 `generator/data/sync` 도메인 회귀 구현을 `shared.mjs` 밖으로 계속 분리하는 것입니다.
