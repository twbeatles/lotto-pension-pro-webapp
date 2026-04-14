const BASE_PARAMS = Object.freeze({
    simulationCount: 5000,
    lookbackWindow: 20,
    wheelPoolSize: null,
    wheelGuarantee: null,
    seed: null,
    payoutMode: 'hybrid_dynamic_first'
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

export const AUTO_STRATEGY_IDS = new Set(['auto_recent_top', 'auto_ensemble_top3']);

export const STRATEGY_CATALOG = Object.freeze({
    random_baseline: {
        id: 'random_baseline',
        label: '완전 랜덤',
        tier: 'A',
        experimental: false,
        summary: '균등 확률 비복원 추출',
        description: '과거 데이터를 전혀 참고하지 않고 1부터 45까지의 숫자 중 6개를 균등한 확률로 추출합니다. 철저히 운에 맡기는 기본 생성 방식입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    ensemble_weighted: {
        id: 'ensemble_weighted',
        label: '앙상블 가중치',
        tier: 'A',
        experimental: false,
        summary: '빈도/최근/공백 신호를 혼합',
        description: '역대 당첨 번호의 빈도, 최근 출현 여부, 그리고 출현 공백 간격을 5:3:2 비율로 종합하여 점수를 매깁니다. 가장 균형 잡힌 <strong>대표 가중치 추천 모델</strong>로 쓰기 좋은 기본 전략입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    consensus_portfolio: {
        id: 'consensus_portfolio',
        label: '컨센서스 포트폴리오',
        tier: 'A',
        experimental: false,
        summary: '강한 신호의 교집합을 다시 선별',
        description: '빈도, 최근성, 공백, 페어 시너지, 구간 분산 신호를 각각 독립적으로 본 뒤, 여러 관점에서 동시에 점수가 높은 후보만 다시 랭킹하는 <strong>다중 합의형 전략</strong>입니다. 단일 기준에 치우치지 않아 통계 추천의 기본형으로 쓰기 좋습니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 6500 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    bayesian_smooth: {
        id: 'bayesian_smooth',
        label: '베이지안 스무딩',
        tier: 'A',
        experimental: false,
        summary: '과적합을 줄인 확률형 추정',
        description: '전체 출현 빈도와 최근 출현 빈도를 베이지안 방식으로 부드럽게 결합해 <strong>과하게 튀는 번호를 누르고 안정적인 확률</strong>을 추정합니다. 샘플 수가 적은 최근 구간에서도 흔들림이 적은 보수형 모델입니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 6000 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    momentum_recent: {
        id: 'momentum_recent',
        label: '모멘텀 추세',
        tier: 'B',
        experimental: false,
        summary: '최근 상승세 번호에 가속도 부여',
        description: '전체 평균 대비 최근 구간에서 출현 비율이 더 빨라진 번호를 찾아 <strong>상승 추세의 연장선</strong>을 노립니다. 직전 10~30회 흐름을 따라가고 싶을 때 적합한 추세형 모델입니다.',
        defaultParams: { ...BASE_PARAMS, lookbackWindow: 24 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    mean_reversion_cycle: {
        id: 'mean_reversion_cycle',
        label: '평균회귀 사이클',
        tier: 'B',
        experimental: false,
        summary: '예상 공백 대비 늦어진 번호를 보정',
        description: '번호별 평균 출현 간격을 계산한 뒤 현재 공백이 그 기대치보다 길어진 번호에 가중치를 더합니다. 단순 콜드 전략보다 한 단계 더 나아가 <strong>번호별 고유 리듬</strong>을 반영하는 평균회귀형 모델입니다.',
        defaultParams: { ...BASE_PARAMS, lookbackWindow: 28 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    auto_recent_top: {
        id: 'auto_recent_top',
        label: '자동 선택(최근 상위 1개)',
        tier: 'A',
        experimental: false,
        scopes: ['ai'],
        summary: '최근 N회 기준 최상위 전략 자동 선택',
        description: '최근 성능을 다시 비교해 가장 성적이 좋았던 전략 1개를 자동으로 골라 적용합니다. 현재 참조 회차 수를 입력받지만, 실제 자동 비교 구간은 <strong>최대 30회</strong>까지 사용합니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 5500, lookbackWindow: 20 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    auto_ensemble_top3: {
        id: 'auto_ensemble_top3',
        label: '자동 앙상블(상위 3개)',
        tier: 'A',
        experimental: false,
        scopes: ['ai'],
        summary: '최근 상위 3개 전략을 자동 혼합',
        description: '최근 성능평가에서 상위권에 오른 전략 3개를 선택한 뒤, 각 전략의 현재 가중치를 성능 비율만큼 혼합합니다. 현재 참조 회차 수를 입력받지만, 실제 자동 비교 구간은 <strong>최대 30회</strong>까지 사용합니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 6000, lookbackWindow: 20 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    hot_frequency: {
        id: 'hot_frequency',
        label: '핫 빈도 추종',
        tier: 'B',
        experimental: false,
        summary: '빈출 번호 우선',
        description: '최근들어 자주 당첨되고 있는 이른바 <strong>강세 번호</strong>들에 높은 가중치를 부여합니다. 현재 상승세를 타고 있는 번호의 추세를 따라가는 순응형 전략입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    cold_frequency: {
        id: 'cold_frequency',
        label: '콜드 반등',
        tier: 'B',
        experimental: false,
        summary: '저빈도/장기 미출현 보정',
        description: '오랫동안 당첨되지 않아 <strong>출현 패턴상 나올 때가 된 약세 번호</strong>를 우선적으로 선택합니다. 통계적 회귀 현상을 노리는 반등형 전략입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    recency_gap: {
        id: 'recency_gap',
        label: '최근성-갭',
        tier: 'A',
        experimental: false,
        summary: '최근성과 미출현 길이를 함께 반영',
        description: '최근 발생한 출현과 직전 출현 사이의 <strong>공백 기간</strong>을 집중 분석합니다. 번호가 규칙적인 주기를 가지고 출현한다고 가정하고 그 출현 리듬의 맥락을 공략합니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    balance_oe_hl: {
        id: 'balance_oe_hl',
        label: '홀짝/고저 밸런스',
        tier: 'B',
        experimental: false,
        summary: '균형형 필터 중심',
        description: '홀수와 짝수, 고/저(23 기준) 비율을 3:3 또는 4:2처럼 <strong>가장 이상적인 밸런스</strong>로 맞추는 데 집중합니다. 한쪽으로 번호가 쏠리는 극단적 현상을 강력하게 방지합니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: {
            ...EMPTY_FILTERS,
            oddEven: [2, 4],
            highLow: [2, 4]
        }
    },
    stat_ac_sum: {
        id: 'stat_ac_sum',
        label: '정밀 통계(복잡도/합계)',
        tier: 'B',
        experimental: false,
        summary: '복잡도 지수와 합계 구간 기반 필터',
        description: '역대 당첨 비율이 가장 높은 <strong>산술적 복잡도 지수(7~10)</strong>와 <strong>총합(100~175)</strong> 구간만을 엄격하게 필터링합니다. 번호 간 산포도를 최적화하여 뭉침을 배제합니다.',
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
        description: '과거에 <strong>함께 당첨된 적이 많은 번호쌍</strong>의 데이터를 분석하여, 특정 번호가 선택되면 그와 시너지가 좋은 번호가 함께 끌려오도록 가중치를 부여합니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    adjacency_bias: {
        id: 'adjacency_bias',
        label: '인접수 편향',
        tier: 'B',
        experimental: false,
        summary: '직전 회차 인접 번호 가중',
        description: '이전 회차 당첨 번호의 <strong>바로 옆 번호(이웃수)</strong>가 다음 회차에 잘 나온다는 전통적인 통계적 편향을 사용하여 인접수들의 출현 확률을 높입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    zone_split_3band: {
        id: 'zone_split_3band',
        label: '3구간 분할',
        tier: 'B',
        experimental: false,
        summary: '1-15/16-30/31-45 구간 균형',
        description: '전체 번호를 1~15, 16~30, 31~45의 <strong>세 개 구간</strong>으로 나누어 번호가 구간별로 골고루 하나 이상씩 섞여 나오도록 유도하는 안정적인 분산 투자법입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    wheel_full: {
        id: 'wheel_full',
        label: '휠링(풀)',
        tier: 'A',
        experimental: false,
        summary: '후보군 기반 조합 확장',
        description: '선택된 유력 후보군(통상 10수 내외)을 기반으로, 그 안에서 점수가 높은 번호를 넓게 샘플링해 여러 조합을 탐색하는 <strong>후보군 기반 확장 전략</strong>입니다.',
        defaultParams: { ...BASE_PARAMS, wheelPoolSize: 10, wheelGuarantee: 4 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    wheel_reduced_t3: {
        id: 'wheel_reduced_t3',
        label: '휠링(축약 3단계)',
        tier: 'B',
        experimental: false,
        summary: '소수 티켓 중심 축약 휠',
        description: '풀 휠링보다 적은 수의 조합으로 후보군을 샘플링하는 <strong>축약형 확장 전략</strong>입니다. 제한된 조합 수 안에서 후보군을 폭넓게 탐색하고 싶을 때 적합합니다.',
        defaultParams: { ...BASE_PARAMS, wheelPoolSize: 9, wheelGuarantee: 3 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    skip_hit_weighted: {
        id: 'skip_hit_weighted',
        label: '결번/출현 가중',
        tier: 'B',
        experimental: true,
        summary: '결번-출현 리듬 기반',
        description: '<strong>[실험 모델]</strong> 번호별로 출현과 결번이 순환하는 리듬 패턴을 수학적으로 추적하여, 다음 타이밍에 출현 쪽으로 기울 수 있는 번호를 휴리스틱하게 추정합니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    last_digit_balance: {
        id: 'last_digit_balance',
        label: '끝수 균형',
        tier: 'C',
        experimental: true,
        summary: '끝수 분산 중심',
        description: '<strong>[실험 모델]</strong> 1의 자리 끝수(1~9, 0)가 최소 4종류 이상 서로 다르게 나오도록 강제합니다. 끝수가 한두 개로 몰리는 극단적인 패턴 부작용을 사전에 차단합니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS, endDigitUniqueMin: 4 }
    },
    delta_gap_pattern: {
        id: 'delta_gap_pattern',
        label: '간격 패턴',
        tier: 'C',
        experimental: true,
        summary: '번호 간 간격 분포 근사',
        description: '<strong>[실험 모델]</strong> 생성된 6개 번호들 사이의 간격 변화 값이 과거 당첨 티켓들이 보였던 간격 분포 곡선과 가장 유사한 형태를 띠도록 섀도우 매칭을 수행합니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    carryover_repeat_control: {
        id: 'carryover_repeat_control',
        label: '이월 반복 제어',
        tier: 'C',
        experimental: true,
        summary: '직전 회차 반복 수 조정',
        description: '<strong>[실험 모델]</strong> 직전 회차 당첨 번호가 이번 회차에 그대로 출현(이월)하는 개수를 최대 2개 이하로 엄격하게 컨트롤하여 불필요한 이월수 노이즈 비중을 차단합니다.',
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

export function isAutoStrategyId(value) {
    return AUTO_STRATEGY_IDS.has(resolveStrategyId(value));
}

export function listStrategies({ includeExperimental = false, scope = null } = {}) {
    return Object.values(STRATEGY_CATALOG).filter((item) => {
        if (!includeExperimental && item.experimental) return false;
        if (scope && Array.isArray(item.scopes) && !item.scopes.includes(scope)) return false;
        return true;
    });
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
