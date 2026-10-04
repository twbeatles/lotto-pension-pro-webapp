import { BASE_PARAMS, EMPTY_FILTERS } from './defaults.js';

export const STRATEGY_CATALOG = Object.freeze({
    random_baseline: {
        id: 'random_baseline',
        label: '완전 무작위',
        tier: 'A',
        experimental: false,
        summary: '과거 기록 없이 무작위로 뽑기',
        description:
            '과거 당첨 기록을 전혀 보지 않고 1~45 중 6개를 똑같은 확률로 뽑습니다. 순수하게 <strong>운에 맡기는 기본 방식</strong>입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    ensemble_weighted: {
        id: 'ensemble_weighted',
        label: '종합 점수',
        tier: 'A',
        experimental: false,
        summary: '자주·최근·오래 쉰 번호를 골고루 반영',
        description:
            '많이 나온 번호, 최근에 나온 번호, 오래 쉬고 있는 번호를 5:3:2로 섞어 점수를 매깁니다. 한쪽에 치우치지 않아 <strong>처음 쓰기 좋은 기본 방식</strong>입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    consensus_portfolio: {
        id: 'consensus_portfolio',
        label: '여러 기준 합의',
        tier: 'A',
        experimental: false,
        summary: '여러 기준에서 모두 점수가 높은 번호',
        description:
            '출현 횟수, 최근 흐름, 쉬는 기간, 함께 나온 번호, 구간 분포를 따로 본 뒤 <strong>여러 기준에서 동시에 점수가 높은 번호</strong>만 다시 고릅니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 6500 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    bayesian_smooth: {
        id: 'bayesian_smooth',
        label: '안정형 확률',
        tier: 'A',
        experimental: false,
        summary: '튀는 번호를 눌러 안정적으로 추정',
        description:
            '전체 기록과 최근 기록을 부드럽게 섞어 <strong>갑자기 튀는 번호의 영향을 줄입니다</strong>. 최근 기록이 적어도 결과가 크게 흔들리지 않는 신중한 방식입니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 6000 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    momentum_recent: {
        id: 'momentum_recent',
        label: '요즘 뜨는 번호',
        tier: 'B',
        experimental: false,
        summary: '최근 들어 자주 나오는 번호 위주',
        description:
            '평소보다 최근에 더 자주 나오고 있는 번호를 찾아 <strong>요즘 흐름을 따라갑니다</strong>. 최근 10~30회 흐름을 중요하게 보고 싶을 때 좋습니다.',
        defaultParams: { ...BASE_PARAMS, lookbackWindow: 24 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    mean_reversion_cycle: {
        id: 'mean_reversion_cycle',
        label: '나올 때 된 번호',
        tier: 'B',
        experimental: false,
        summary: '평소 간격보다 오래 쉬고 있는 번호',
        description:
            '번호마다 평소 몇 회마다 나오는지 계산한 뒤, <strong>평소보다 오래 쉬고 있는 번호</strong>에 점수를 더 줍니다.',
        defaultParams: { ...BASE_PARAMS, lookbackWindow: 28 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    auto_recent_top: {
        id: 'auto_recent_top',
        label: '자동 선택 (최근 성적 1위)',
        tier: 'A',
        experimental: false,
        scopes: ['ai'],
        summary: '최근 성적이 가장 좋았던 방식을 자동으로 사용',
        description:
            '최근 회차에서 가장 성적이 좋았던 방식 1개를 자동으로 골라 씁니다. 비교는 <strong>최근 최대 30회</strong>까지 봅니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 5500, lookbackWindow: 20 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    auto_ensemble_top3: {
        id: 'auto_ensemble_top3',
        label: '자동 조합 (최근 성적 상위 3개)',
        tier: 'A',
        experimental: false,
        scopes: ['ai'],
        summary: '최근 성적 상위 3개 방식을 섞어서 사용',
        description:
            '최근 성적이 좋았던 방식 3개를 골라 성적에 비례해 섞습니다. 비교는 <strong>최근 최대 30회</strong>까지 봅니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 6000, lookbackWindow: 20 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    hot_frequency: {
        id: 'hot_frequency',
        label: '자주 나온 번호',
        tier: 'B',
        experimental: false,
        summary: '최근 자주 나온 번호 우선',
        description:
            '최근 자주 당첨된 <strong>강세 번호</strong>에 높은 점수를 줍니다. 지금 흐름을 그대로 따라가는 방식입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    cold_frequency: {
        id: 'cold_frequency',
        label: '오래 안 나온 번호',
        tier: 'B',
        experimental: false,
        summary: '오랫동안 안 나온 번호 우선',
        description:
            '오랫동안 당첨되지 않은 <strong>쉬고 있는 번호</strong>를 먼저 고릅니다. 이제 나올 때가 됐다고 보는 방식입니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    recency_gap: {
        id: 'recency_gap',
        label: '최근 흐름 + 쉬는 기간',
        tier: 'A',
        experimental: false,
        summary: '최근 출현과 쉬는 기간을 함께 반영',
        description:
            '번호가 마지막으로 나온 뒤 <strong>얼마나 쉬었는지</strong>를 집중해서 봅니다. 번호마다 나오는 주기가 있다고 보고 그 리듬을 따라갑니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    balance_oe_hl: {
        id: 'balance_oe_hl',
        label: '홀짝·크기 균형',
        tier: 'B',
        experimental: false,
        summary: '홀짝과 큰 수·작은 수를 고르게',
        description:
            '홀수와 짝수, 큰 수(24~45)와 작은 수(1~23)를 3:3이나 4:2처럼 <strong>고르게 맞춥니다</strong>. 한쪽으로 쏠린 조합을 피합니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: {
            ...EMPTY_FILTERS,
            oddEven: [2, 4],
            highLow: [2, 4]
        }
    },
    stat_ac_sum: {
        id: 'stat_ac_sum',
        label: '합계·섞임 맞춤',
        tier: 'B',
        experimental: false,
        summary: '당첨이 많았던 합계·섞임 범위만',
        description:
            '역대 당첨이 가장 많았던 <strong>번호 섞임 정도(7~10)</strong>와 <strong>6개 합계(100~175)</strong> 범위에 맞는 조합만 남깁니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 8000 },
        defaultFilters: {
            ...EMPTY_FILTERS,
            sumRange: [100, 175],
            acRange: [7, 10]
        }
    },
    pair_cooccurrence: {
        id: 'pair_cooccurrence',
        label: '짝꿍 번호',
        tier: 'B',
        experimental: false,
        summary: '함께 자주 나온 번호끼리 묶기',
        description:
            '과거에 <strong>함께 당첨된 적이 많은 번호 짝</strong>을 찾아, 한 번호가 뽑히면 그 짝꿍 번호도 함께 뽑히기 쉽게 합니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    adjacency_bias: {
        id: 'adjacency_bias',
        label: '지난 회차 이웃 번호',
        tier: 'B',
        experimental: false,
        summary: '지난 당첨 번호의 바로 옆 번호 우선',
        description:
            '지난 회차 당첨 번호의 <strong>바로 옆 번호(±1)</strong>가 다음에 잘 나온다는 속설을 반영합니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    zone_split_3band: {
        id: 'zone_split_3band',
        label: '세 구간 고르게',
        tier: 'B',
        experimental: false,
        summary: '1~15 / 16~30 / 31~45에서 골고루',
        description:
            '번호를 1~15, 16~30, 31~45 <strong>세 구간</strong>으로 나눠 구간마다 하나 이상 섞이도록 합니다.',
        defaultParams: { ...BASE_PARAMS },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    wheel_full: {
        id: 'wheel_full',
        label: '후보 돌려 조합',
        tier: 'A',
        experimental: false,
        summary: '유력 후보 안에서 여러 조합 만들기',
        description:
            '점수가 높은 후보 번호(보통 10개 안팎)를 먼저 고른 뒤, 그 안에서 <strong>여러 조합을 넓게</strong> 만들어 봅니다.',
        defaultParams: { ...BASE_PARAMS, wheelPoolSize: 10, wheelGuarantee: 4 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    wheel_reduced_t3: {
        id: 'wheel_reduced_t3',
        label: '후보 압축 조합',
        tier: 'B',
        experimental: false,
        summary: '적은 게임 수로 후보 번호 조합',
        description:
            '"후보 돌려 조합"보다 <strong>적은 게임 수</strong>로 후보 번호를 골고루 섞습니다. 몇 게임만 살 때 좋습니다.',
        defaultParams: { ...BASE_PARAMS, wheelPoolSize: 9, wheelGuarantee: 3 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    skip_hit_weighted: {
        id: 'skip_hit_weighted',
        label: '쉬는 리듬 반영',
        tier: 'B',
        experimental: true,
        summary: '나왔다 쉬었다 하는 리듬 반영',
        description:
            '<strong>[실험 중]</strong> 번호마다 나왔다 쉬었다 하는 리듬을 따라가, 다음에 나올 차례로 보이는 번호를 고릅니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    last_digit_balance: {
        id: 'last_digit_balance',
        label: '끝자리 고르게',
        tier: 'C',
        experimental: true,
        summary: '끝자리가 겹치지 않게',
        description:
            '<strong>[실험 중]</strong> 번호 끝자리(0~9)가 최소 4종류 이상 섞이도록 합니다. 끝자리가 한두 개로 몰리는 조합을 피합니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS, endDigitUniqueMin: 4 }
    },
    delta_gap_pattern: {
        id: 'delta_gap_pattern',
        label: '번호 간격 패턴',
        tier: 'C',
        experimental: true,
        summary: '번호 사이 간격을 과거와 비슷하게',
        description:
            '<strong>[실험 중]</strong> 6개 번호 사이의 간격이 과거 당첨 번호들의 간격과 비슷한 모양이 되도록 맞춥니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS }
    },
    carryover_repeat_control: {
        id: 'carryover_repeat_control',
        label: '지난 번호 반복 조절',
        tier: 'C',
        experimental: true,
        summary: '지난 회차 번호는 최대 2개까지',
        description:
            '<strong>[실험 중]</strong> 지난 회차 당첨 번호가 이번 조합에 다시 들어가는 개수를 최대 2개로 제한합니다.',
        defaultParams: { ...BASE_PARAMS, simulationCount: 7000 },
        defaultFilters: { ...EMPTY_FILTERS, maxConsecutivePairs: 2 }
    }
});