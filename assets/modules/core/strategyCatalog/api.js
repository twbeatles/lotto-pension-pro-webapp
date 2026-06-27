import { AUTO_STRATEGY_IDS, LEGACY_STRATEGY_ALIASES } from './aliases.js';
import { BASE_PARAMS, EMPTY_FILTERS } from './defaults.js';
import { STRATEGY_CATALOG } from './entries.js';

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