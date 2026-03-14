import { createDefaultStrategyRequest, getStrategyMeta, resolveStrategyId } from '../StrategyCatalog.js';
import { sanitizeFilters } from '../StrategyFilters.js';
import { clamp, resolvePayoutMode, xorshift32 } from './shared.js';
export const strategyRequestMethods = {
    normalizeRequest(raw = {}) {
        const base = createDefaultStrategyRequest(resolveStrategyId(raw.strategyId));
        const meta = getStrategyMeta(base.strategyId);

        const params = {
            ...base.params,
            ...(raw.params || {})
        };

        params.simulationCount = Math.floor(clamp(params.simulationCount, 1000, 20000, base.params.simulationCount));
        params.lookbackWindow = Math.floor(clamp(params.lookbackWindow, 5, 120, base.params.lookbackWindow));
        params.wheelPoolSize = params.wheelPoolSize === null
            ? null
            : Math.floor(clamp(params.wheelPoolSize, 7, 20, meta.defaultParams.wheelPoolSize || 10));
        params.wheelGuarantee = params.wheelGuarantee === null
            ? null
            : Math.floor(clamp(params.wheelGuarantee, 2, 5, meta.defaultParams.wheelGuarantee || 3));
        params.seed = (raw.params && raw.params.seed !== undefined && raw.params.seed !== null && raw.params.seed !== '')
            ? Math.floor(Number(raw.params.seed))
            : null;
        params.payoutMode = resolvePayoutMode(params.payoutMode);

        const filters = sanitizeFilters({
            ...base.filters,
            ...(raw.filters || {})
        });

        return {
            strategyId: meta.id,
            evidenceTier: meta.tier,
            params,
            filters
        };
    },

    getDataBefore(drawNo = null) {
        if (!Number.isFinite(Number(drawNo))) return this.data;
        return this.data.filter((row) => Number(row.draw_no) < Number(drawNo));
    },

    getRandomFn(seed = null) {
        if (seed === null || seed === undefined || seed === '' || !Number.isFinite(Number(seed))) {
            return Math.random;
        }
        return xorshift32(Math.floor(Number(seed)));
    },

    prepareExecution(request, options = {}) {
        const normalizedRequest = options.normalizedRequest || this.normalizeRequest(request);
        const sourceData = options.sourceData || this.data;
        const rng = options.rng || this.getRandomFn(normalizedRequest.params.seed);
        const { weights } = this.computeWeightsFromNormalized(normalizedRequest, sourceData);
        const isWheel = normalizedRequest.strategyId === 'wheel_full' || normalizedRequest.strategyId === 'wheel_reduced_t3';

        return {
            normalizedRequest,
            sourceData,
            rng,
            weights,
            isWheel
        };
    }
};
