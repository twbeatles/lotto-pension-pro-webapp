import { createDefaultPension720StrategyRequest, resolvePension720StrategyId } from '../../Pension720StrategyCatalog.js';
import { clampInt } from './primitives.js';
import { normalizeFilters } from './filters.js';

export function applyProfileDefaults(params, profile = '') {
    if (profile === 'fast') {
        return {
            ...params,
            lookbackWindow: params.lookbackWindow ?? 20,
            candidatePoolSize: params.candidatePoolSize ?? 80
        };
    }
    if (profile === 'precise') {
        return {
            ...params,
            lookbackWindow: params.lookbackWindow ?? 80,
            candidatePoolSize: params.candidatePoolSize ?? 240
        };
    }
    return {
        ...params,
        lookbackWindow: params.lookbackWindow ?? 40,
        candidatePoolSize: params.candidatePoolSize ?? 140
    };
}

export function normalizeRequest(raw = {}) {
    const profile = ['fast', 'basic', 'precise'].includes(raw.profile) ? raw.profile : '';
    const strategyId = resolvePension720StrategyId(raw.strategyId || raw.id || profile || 'mixed_balance');
    const defaults = createDefaultPension720StrategyRequest(strategyId);
    const params = applyProfileDefaults(
        {
            ...defaults.params,
            ...(raw.params || {}),
            seed: raw.seed ?? raw.params?.seed ?? defaults.params.seed
        },
        profile
    );

    return {
        strategyId,
        evidenceTier: defaults.evidenceTier,
        params: {
            seed:
                Number.isFinite(Number(params.seed)) && Number(params.seed) > 0
                    ? Math.floor(Number(params.seed))
                    : null,
            lookbackWindow: clampInt(params.lookbackWindow, 1, 300, defaults.params.lookbackWindow),
            candidatePoolSize: clampInt(params.candidatePoolSize, 20, 800, defaults.params.candidatePoolSize)
        },
        filters: normalizeFilters({
            ...defaults.filters,
            ...(raw.filters || {})
        })
    };
}