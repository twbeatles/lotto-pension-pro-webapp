const BASE_PARAMS = Object.freeze({
    simulationCount: 5000,
    lookbackWindow: 20,
    wheelPoolSize: null,
    wheelGuarantee: null,
    seed: null
});

const EMPTY_FILTERS = Object.freeze({
    oddEven: null,
    highLow: null,
    sumRange: null,
    acRange: null,
    maxConsecutivePairs: null,
    endDigitUniqueMin: null
});

export const LEGACY_STRATEGY_ALIASES = Object.freeze({
    ensemble: 'ensemble_weighted',
    statistical: 'stat_ac_sum',
    balance: 'balance_oe_hl',
    cold: 'cold_frequency',
    hot: 'hot_frequency',
    random: 'random_baseline'
});

export const STRATEGY_CATALOG = Object.freeze({
    random_baseline: {
        id: 'random_baseline',
        label: '완전 랜덤',
        tier: 'A',
        experimental: false,
        summary: '균등 확률 비복원 추출',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    ensemble_weighted: {
        id: 'ensemble_weighted',
        label: '앙상블 가중치',
        tier: 'A',
        experimental: false,
        summary: '빈도/최근/갭 신호를 혼합',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    hot_frequency: {
        id: 'hot_frequency',
        label: '핫 빈도 추종',
        tier: 'B',
        experimental: false,
        summary: '빈출 번호 우선',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    cold_frequency: {
        id: 'cold_frequency',
        label: '콜드 반등',
        tier: 'B',
        experimental: false,
        summary: '저빈도/장기 미출현 보정',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    recency_gap: {
        id: 'recency_gap',
        label: '최근성-갭',
        tier: 'A',
        experimental: false,
        summary: '최근성과 미출현 길이를 함께 반영',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    balance_oe_hl: {
        id: 'balance_oe_hl',
        label: '홀짝/고저 밸런스',
        tier: 'B',
        experimental: false,
        summary: '균형형 필터 중심',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: {
            ...EMPTY_FILTERS,
            oddEven: [2, 4],
            highLow: [2, 4]
        }
    },
    stat_ac_sum: {
        id: 'stat_ac_sum',
        label: '정밀 통계(AC/합계)',
        tier: 'B',
        experimental: false,
        summary: 'AC와 합계 구간 기반 필터',
        defaultParams: { ...BASE_PARAMS, simulationCount: 8000 },
        defaultFilters: {
            ...EMPTY_FILTERS,
            sumRange: [100, 175],
            acRange: [7, 10]
        }
    },
    pair_cooccurrence: {
        id: 'pair_cooccurrence',
        label: '공출현 페어',
        tier: 'B',
        experimental: false,
        summary: '동시 출현 페어 빈도 가중',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    adjacency_bias: {
        id: 'adjacency_bias',
        label: '인접수 편향',
        tier: 'B',
        experimental: false,
        summary: '직전 회차 인접 번호 가중',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    zone_split_3band: {
        id: 'zone_split_3band',
        label: '3구간 분할',
        tier: 'B',
        experimental: false,
        summary: '1-15/16-30/31-45 구간 균형',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    wheel_full: {
        id: 'wheel_full',
        label: '휠링(풀)',
        tier: 'A',
        experimental: false,
        summary: '후보군 기반 조합 확장',
        defaultParams: { ...BASE_PARAMS, wheelPoolSize: 10, wheelGuarantee: 4 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    wheel_reduced_t3: {
        id: 'wheel_reduced_t3',
        label: '휠링(축약 T3)',
        tier: 'B',
        experimental: false,
        summary: '소수 티켓 중심 축약 휠',
        defaultParams: { ...BASE_PARAMS, wheelPoolSize: 9, wheelGuarantee: 3 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    skip_hit_weighted: {
        id: 'skip_hit_weighted',
        label: 'Skip/Hit 가중',
        tier: 'B',
        experimental: true,
        summary: '결번-출현 리듬 기반',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    last_digit_balance: {
        id: 'last_digit_balance',
        label: '끝수 균형',
        tier: 'C',
        experimental: true,
        summary: '끝수 분산 중심',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS, endDigitUniqueMin: 4 }
    },
    delta_gap_pattern: {
        id: 'delta_gap_pattern',
        label: '간격 패턴',
        tier: 'C',
        experimental: true,
        summary: '번호 간 간격 분포 근사',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    carryover_repeat_control: {
        id: 'carryover_repeat_control',
        label: '이월 반복 제어',
        tier: 'C',
        experimental: true,
        summary: '직전 회차 반복 수 조정',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS, maxConsecutivePairs: 2 }
    }
});

export function resolveStrategyId(value) {
    if (!value) return 'ensemble_weighted';
    if (STRATEGY_CATALOG[value]) return value;
    return LEGACY_STRATEGY_ALIASES[value] || 'ensemble_weighted';
}

export function getStrategyMeta(id) {
    const resolved = resolveStrategyId(id);
    return STRATEGY_CATALOG[resolved] || STRATEGY_CATALOG.ensemble_weighted;
}

export function listStrategies({ includeExperimental = false } = {}) {
    return Object.values(STRATEGY_CATALOG).filter((item) => includeExperimental || !item.experimental);
}

export function createDefaultStrategyRequest(id = 'ensemble_weighted') {
    const meta = getStrategyMeta(id);
    return {
        strategyId: meta.id,
        evidenceTier: meta.tier,
        params: { ...BASE_PARAMS, ...meta.defaultParams },
        filters: { ...EMPTY_FILTERS, ...meta.defaultFilters }
    };
}
