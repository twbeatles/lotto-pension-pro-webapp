export const AUTO_STRATEGY_IDS = new Set(['auto_recent_top', 'auto_ensemble_top3']);
export const ADAPTIVE_SOURCE_STRATEGIES = Object.freeze([
    'consensus_portfolio',
    'ensemble_weighted',
    'bayesian_smooth',
    'momentum_recent',
    'mean_reversion_cycle',
    'zone_split_3band',
    'stat_ac_sum',
    'pair_cooccurrence',
    'adjacency_bias',
    'recency_gap',
    'balance_oe_hl',
    'hot_frequency',
    'cold_frequency'
]);