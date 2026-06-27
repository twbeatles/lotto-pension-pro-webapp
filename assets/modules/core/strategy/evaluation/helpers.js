export function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

export function sortCandidate(numbers) {
    const candidate = [...(numbers || [])]
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
        .sort((a, b) => a - b);
    if (candidate.length !== 6) return null;
    for (let i = 1; i < candidate.length; i++) {
        if (candidate[i] === candidate[i - 1]) return null;
    }
    return candidate;
}

export function scoreByDistance(value, stats = {}, fallbackSpread = 10) {
    const median = Number.isFinite(stats?.median) ? stats.median : value;
    const std = Number.isFinite(stats?.std) ? stats.std : 1;
    const spread = Math.max(std * 1.6, fallbackSpread, 1);
    return clamp01(1 - Math.abs(value - median) / spread);
}

export function getRecommendationMix(strategyId) {
    switch (strategyId) {
        case 'pair_cooccurrence':
            return { weight: 0.3, pair: 0.4, profile: 0.15, gap: 0.15 };
        case 'stat_ac_sum':
            return { weight: 0.3, pair: 0.15, profile: 0.4, gap: 0.15 };
        case 'balance_oe_hl':
        case 'zone_split_3band':
        case 'last_digit_balance':
            return { weight: 0.28, pair: 0.12, profile: 0.45, gap: 0.15 };
        case 'cold_frequency':
        case 'mean_reversion_cycle':
        case 'skip_hit_weighted':
            return { weight: 0.28, pair: 0.14, profile: 0.2, gap: 0.38 };
        case 'momentum_recent':
        case 'hot_frequency':
        case 'adjacency_bias':
            return { weight: 0.4, pair: 0.2, profile: 0.18, gap: 0.22 };
        case 'consensus_portfolio':
        case 'bayesian_smooth':
            return { weight: 0.34, pair: 0.22, profile: 0.24, gap: 0.2 };
        default:
            return { weight: 0.34, pair: 0.2, profile: 0.24, gap: 0.22 };
    }
}