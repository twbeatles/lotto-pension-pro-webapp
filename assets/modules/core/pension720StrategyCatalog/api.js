import { PENSION720_STRATEGY_ALIASES } from './aliases.js';
import { BASE_PARAMS, EMPTY_FILTERS } from './defaults.js';
import { PENSION720_STRATEGY_CATALOG } from './entries.js';

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