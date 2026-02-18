# LOTTO 전략 리서치 및 구현 매핑 (2026-02-18)

## 1) 목적
- 웹 시장에서 실제로 널리 쓰이는 로또 전략을 옵션화하되, 근거 수준을 등급(Tier A/B/C)으로 분리한다.
- 본 문서는 **당첨 보장 문서가 아니며**, 전략 탐색/시뮬레이션 기능 설계 문서다.

## 2) 근거 등급 정책
- Tier A: 수학/학술/형식적 방법 근거가 분명한 전략
- Tier B: 상용 툴/시장 관행에서 반복적으로 확인되는 전략
- Tier C: 커뮤니티 경험칙 중심, 실험 옵션으로만 제공

## 3) 웹 소스와 등급 매핑 (1:1)
| Source ID | 링크 | 분류 | 적용 Tier |
|---|---|---|---|
| S1 | https://en.wikipedia.org/wiki/Lottery_wheeling_system | 휠링 시스템 개념/수학적 커버리지 | A |
| S2 | https://www.dcode.fr/lottery-wheels | 휠링 조합/축약 방식 도구 | A/B |
| S3 | https://lottowheeling.com/wheels.asp | 시장형 휠링 패턴(풀/리듀스드) | B |
| S4 | https://www.lotterycodex.com/lottery-strategy-reports/ | 상용 전략 리포트 허브 | B |
| S5 | https://www.lotterycodex.com/lottery-strategy-reports/skip-and-hit-frequency-weighting/ | Skip/Hit 가중 전략 | B |
| S6 | https://www.lotterypost.com/blogentry/183667 | 커뮤니티 기반 패턴/필터 사례 | C |
| S7 | https://www.lotterypost.com/blogentry/183678 | 커뮤니티 기반 패턴/필터 사례 | C |
| S8 | https://arxiv.org/abs/1704.05425 | 확률/조합 최적화 관점 참고 | A |

## 4) 구현 전략 카탈로그
### 4.1 기본 탑재 (기본 노출)
| Strategy ID | Tier | 핵심 신호 | 소스 |
|---|---|---|---|
| `random_baseline` | A | 균등 비복원 랜덤 | S8 |
| `ensemble_weighted` | A | 빈도+최근+갭 혼합 | S4, S8 |
| `hot_frequency` | B | 고빈도/최근 빈출 가중 | S4 |
| `cold_frequency` | B | 저빈도/장기 미출현 보정 | S4 |
| `recency_gap` | A | 최근성+결번 길이 신호 | S8 |
| `balance_oe_hl` | B | 홀짝/고저 균형 필터 | S4 |
| `stat_ac_sum` | B | 합계/AC 구간 필터 | S4 |
| `pair_cooccurrence` | B | 동시 출현 페어 가중 | S4 |
| `adjacency_bias` | B | 직전 회차 인접수 편향 | S4 |
| `zone_split_3band` | B | 3구간 분산/균형 | S4 |
| `wheel_full` | A | 후보군 기반 풀 휠링 | S1, S2 |
| `wheel_reduced_t3` | B | 축약 휠링(T3 중심) | S2, S3 |

### 4.2 실험 옵션 (기본 숨김)
| Strategy ID | Tier | 핵심 신호 | 소스 |
|---|---|---|---|
| `skip_hit_weighted` | B | Skip/Hit 리듬 가중 | S5 |
| `last_digit_balance` | C | 끝수 분산 | S6, S7 |
| `delta_gap_pattern` | C | 번호 간 간격 패턴 | S6, S7 |
| `carryover_repeat_control` | C | 직전 회차 반복 제어 | S6, S7 |

## 5) 공통 전략 요청 객체 (실제 구현)
```js
{
  strategyId: string,
  evidenceTier: 'A' | 'B' | 'C',
  params: {
    simulationCount: number,   // 기본 5000, 상한 20000
    lookbackWindow: number,    // 기본 20
    wheelPoolSize: number|null,
    wheelGuarantee: number|null,
    seed: number|null
  },
  filters: {
    oddEven: [minOdd, maxOdd] | null,
    highLow: [minHigh, maxHigh] | null,
    sumRange: [min, max] | null,
    acRange: [min, max] | null,
    maxConsecutivePairs: number | null,
    endDigitUniqueMin: number | null
  }
}
```

## 6) 레거시 하위호환 매핑
| Legacy 값 | Canonical Strategy ID |
|---|---|
| `ensemble` | `ensemble_weighted` |
| `statistical` | `stat_ac_sum` |
| `balance` | `balance_oe_hl` |
| `cold` | `cold_frequency` |
| `hot` | `hot_frequency` |
| `random` | `random_baseline` |

## 7) 코드 매핑
- 전략 메타/등급: `assets/modules/core/StrategyCatalog.js`
- 필터 체인: `assets/modules/core/StrategyFilters.js`
- 가중치/샘플링/시뮬레이션: `assets/modules/core/StrategyEngine.js`
- 생성 탭 적용: `assets/modules/features/Generator.js`
- AI 탭 적용: `assets/modules/features/Ai.js`
- 백테스트 UI 적용: `assets/modules/features/Backtest.js`
- 백테스트 워커 적용: `assets/backtest.worker.js`

## 8) 워커 계약 확장
```js
START.payload = { statsData, startDraw, endDraw, qty, strategyRequest }
PROGRESS.payload = { summary, processedDraws, totalDraws, etaMs, strategyId }
DONE.payload = { summary, diagnostics }
ERROR.payload = { code, message, strategyId }
```

## 9) 운영 기본값
- 기본 시뮬레이션 수: 5,000
- 최대 시뮬레이션 수: 20,000
- 기본 lookback: 20회차
- 실험 전략(Tier C): 기본 비활성/숨김

## 10) 한계 및 주의
- 전략은 통계적 탐색 도구이며, 당첨 확률 우위를 보장하지 않는다.
- 결과 품질은 데이터 최신성/결측/필터 강도에 영향을 받는다.
- 결측 회차(예: 146회차 누락)가 있는 경우 특정 전략의 지표 왜곡이 발생할 수 있다.
