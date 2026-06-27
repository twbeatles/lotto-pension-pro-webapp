import { strategyWeightAdaptiveMethods } from './weights/adaptive.js';
import { strategyWeightComputeMethods } from './weights/compute.js';

export const strategyWeightMethods = {
    computeWeights(request, sourceData, options = {}) {
        const normalized = this.normalizeRequest(request);
        return this.computeWeightsFromNormalized(normalized, sourceData, options);
    },
    ...strategyWeightAdaptiveMethods,
    ...strategyWeightComputeMethods
};