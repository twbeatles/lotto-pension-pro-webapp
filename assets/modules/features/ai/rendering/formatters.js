import { getStrategyMeta } from '../../../core/StrategyCatalog.js';

export function formatAdaptiveSelection(adaptive = null) {
    if (!adaptive || !Array.isArray(adaptive.selectedStrategies) || !adaptive.selectedStrategies.length) {
        return '';
    }

    return adaptive.selectedStrategies
        .map((item) => `${getStrategyMeta(item.strategyId).label}(${Number(item.compositeScore || 0).toFixed(1)})`)
        .join(' + ');
}

export function formatTierLabel(tier = '') {
    const labels = { A: '기본', B: '확장', C: '실험' };
    return `${String(tier || '-').toUpperCase()} · ${labels[tier] || '참고'}`;
}

export function normalizeSimulation(result, { executionMode = 'worker', workerTimedOut = false } = {}) {
    if (!result?.simulation) return result;
    const current = result.simulation.diagnostics || {};
    const fallbackMode =
        current.fallbackMode && current.fallbackMode !== 'none'
            ? current.fallbackMode
            : workerTimedOut
              ? 'worker_timeout'
              : 'none';
    result.simulation = {
        ...result.simulation,
        diagnostics: {
            ...current,
            executionMode,
            fallbackMode,
            effectiveAdaptiveWindow: current.effectiveAdaptiveWindow ?? current.adaptive?.evaluationWindow ?? null
        }
    };
    return result;
}