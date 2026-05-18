const BASE_PARAMS = Object.freeze({
    seed: null,
    lookbackWindow: 40,
    candidatePoolSize: 140
});

const EMPTY_FILTERS = Object.freeze({
    groups: null,
    fixedDigits: null,
    excludedDigitsByPosition: null,
    digitSumRange: null,
    oddDigitRange: null,
    highDigitRange: null,
    uniqueDigitMin: null,
    maxSameDigit: null
});

export const PENSION720_STRATEGY_ALIASES = Object.freeze({
    basic: 'mixed_balance',
    precise: 'position_hot',
    fast: 'mixed_balance',
    random: 'random_baseline',
    mixed: 'mixed_balance',
    position: 'position_hot',
    trailing: 'trailing_match',
    bonus: 'bonus_flow',
    gap: 'gap_rebound',
    group: 'group_rotation'
});

export const PENSION720_STRATEGY_CATALOG = Object.freeze({
    mixed_balance: {
        id: 'mixed_balance',
        label: '혼합 균형',
        tier: 'A',
        experimental: false,
        summary: '조/자리/최근 흐름을 균형 반영',
        description: '조별 빈도, 최근성, 공백, 자리별 숫자 강세, 보너스 흐름을 함께 보는 기본 연금복권 전략입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    position_hot: {
        id: 'position_hot',
        label: '자리별 강세',
        tier: 'A',
        experimental: false,
        summary: '각 자리에서 강한 숫자 우선',
        description: '6자리 각각의 출현 빈도와 최근 흐름을 더 강하게 반영합니다.',
        defaultParams: { ...BASE_PARAMS, candidatePoolSize: 160 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    trailing_match: {
        id: 'trailing_match',
        label: '끝자리 적중형',
        tier: 'B',
        experimental: false,
        summary: '하위 등수와 연결되는 끝자리 집중',
        description: '연금복권 당첨 구조상 중요한 뒤쪽 자리의 흐름을 더 크게 반영합니다.',
        defaultParams: { ...BASE_PARAMS, candidatePoolSize: 170 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    group_rotation: {
        id: 'group_rotation',
        label: '조 로테이션',
        tier: 'B',
        experimental: false,
        summary: '최근 공백이 긴 조를 보정',
        description: '조별 최근 공백과 전체 출현 흐름을 함께 보고 조 선택을 넓힙니다.',
        defaultParams: { ...BASE_PARAMS, lookbackWindow: 60 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    gap_rebound: {
        id: 'gap_rebound',
        label: '공백 반등',
        tier: 'B',
        experimental: false,
        summary: '자리별 장기 미출현 숫자 보정',
        description: '각 자리에서 오래 나오지 않은 숫자에 반등 가중치를 줍니다.',
        defaultParams: { ...BASE_PARAMS, lookbackWindow: 80, candidatePoolSize: 180 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    bonus_flow: {
        id: 'bonus_flow',
        label: '보너스 흐름',
        tier: 'B',
        experimental: false,
        summary: '보너스 번호 자리 흐름 보조 반영',
        description: '1등 번호뿐 아니라 보너스 번호의 자리별 흐름을 더 많이 섞습니다.',
        defaultParams: { ...BASE_PARAMS, candidatePoolSize: 160 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    random_baseline: {
        id: 'random_baseline',
        label: '완전 랜덤',
        tier: 'A',
        experimental: false,
        summary: '조와 6자리 숫자를 균등 추출',
        description: '과거 통계를 참고하지 않고 조와 여섯 자리를 균등하게 뽑습니다.',
        defaultParams: { ...BASE_PARAMS, candidatePoolSize: 80 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    diversity: {
        id: 'diversity',
        label: '숫자 다양성',
        tier: 'C',
        experimental: true,
        summary: '중복 숫자를 줄이고 분산 확보',
        description: '[실험] 같은 숫자가 여러 번 반복되는 조합을 낮추고 다양한 숫자를 선호합니다.',
        defaultParams: { ...BASE_PARAMS, candidatePoolSize: 180 },
        defaultFilters: { ...EMPTY_FILTERS, uniqueDigitMin: 4, maxSameDigit: 2 }
    },
    consecutive_pattern: {
        id: 'consecutive_pattern',
        label: '연속 패턴',
        tier: 'C',
        experimental: true,
        summary: '자리 사이 인접 흐름 탐색',
        description: '[실험] 인접한 자리의 숫자 차이가 작게 이어지는 패턴을 후보로 더 탐색합니다.',
        defaultParams: { ...BASE_PARAMS, candidatePoolSize: 180 },
        defaultFilters: { ...EMPTY_FILTERS }
    }
});

export function resolvePension720StrategyId(value) {
    if (!value) return 'mixed_balance';
    const raw = String(value || '').trim();
    if (PENSION720_STRATEGY_CATALOG[raw]) return raw;
    return PENSION720_STRATEGY_ALIASES[raw] || 'mixed_balance';
}

export function getPension720StrategyMeta(id) {
    const resolved = resolvePension720StrategyId(id);
    return PENSION720_STRATEGY_CATALOG[resolved] || PENSION720_STRATEGY_CATALOG.mixed_balance;
}

export function listPension720Strategies({ includeExperimental = false } = {}) {
    return Object.values(PENSION720_STRATEGY_CATALOG).filter((item) => includeExperimental || !item.experimental);
}

export function createDefaultPension720StrategyRequest(id = 'mixed_balance') {
    const meta = getPension720StrategyMeta(id);
    return {
        strategyId: meta.id,
        evidenceTier: meta.tier,
        params: { ...BASE_PARAMS, ...meta.defaultParams },
        filters: { ...EMPTY_FILTERS, ...meta.defaultFilters }
    };
}
