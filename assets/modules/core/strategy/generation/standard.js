import { createFilterEvaluator } from '../../StrategyFilters.js';

export const strategyGenerationStandardMethods = {
    generateSetWithExecution(execution, options = {}) {
        const normalized = execution.normalizedRequest;
        const filterEvaluator = options.filterEvaluator || createFilterEvaluator(normalized.filters);
        const maxAttempts = options.maxAttempts || 250;
        const fixed = options.fixed || [];
        const exclude = options.exclude || [];
        const rng = options.rng || execution.rng;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const candidate = execution.isWheel
                ? this.generateWheelSet(execution.weights, normalized, { fixed, exclude, rng })
                : this.sampleWithConstraints(execution.weights, fixed, exclude, rng);
            if (!candidate) continue;
            if (filterEvaluator(candidate, { assumeSorted: true })) return candidate;
        }

        const fallbackWeights = Array(46).fill(1);
        for (let i = 0; i < 120; i++) {
            const fallback = this.sampleWithConstraints(fallbackWeights, fixed, exclude, rng);
            if (fallback && filterEvaluator(fallback, { assumeSorted: true })) return fallback;
        }
        return null;
    },

    generateSet(request, options = {}) {
        const execution = options.execution || this.prepareExecution(request, options);
        return this.generateSetWithExecution(execution, options);
    },

    generateMultipleSets(count, request, options = {}) {
        const requestedQty = Math.max(1, Math.floor(Number(count) || 1));
        const maxCount = Math.floor(Number(options.maxCount || 0));
        const qty = maxCount > 0 ? Math.min(requestedQty, maxCount) : requestedQty;
        const unique = new Set();
        const result = [];

        const execution = options.execution || this.prepareExecution(request, options);
        const filterEvaluator = options.filterEvaluator || createFilterEvaluator(execution.normalizedRequest.filters);
        const rng = options.rng || execution.rng;

        let attempts = 0;
        const maxAttempts = Math.max(200, qty * 80);
        const perSetMaxAttempts = options.maxAttempts || 250;

        while (result.length < qty && attempts++ < maxAttempts) {
            const set = this.generateSetWithExecution(execution, {
                ...options,
                rng,
                maxAttempts: perSetMaxAttempts,
                filterEvaluator
            });
            if (!set || set.length !== 6) continue;
            const key = set.join(',');
            if (unique.has(key)) continue;
            unique.add(key);
            result.push(set);
        }
        return result;
    }
};