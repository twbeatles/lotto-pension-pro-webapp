export const LEGACY_STRATEGY_ALIASES = Object.freeze({
    ensemble: 'ensemble_weighted',
    statistical: 'stat_ac_sum',
    balance: 'balance_oe_hl',
    cold: 'cold_frequency',
    hot: 'hot_frequency',
    random: 'random_baseline'
});

export const AUTO_STRATEGY_IDS = new Set(['auto_recent_top', 'auto_ensemble_top3']);