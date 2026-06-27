import { aiRenderingRunMethods } from './rendering/run.js';
import { aiRenderingResultsMethods } from './rendering/results.js';
import { aiRenderingModelGuideMethods } from './rendering/modelGuide.js';

export { formatAdaptiveSelection, formatTierLabel, normalizeSimulation } from './rendering/formatters.js';

export const aiRenderingMethods = {
    ...aiRenderingRunMethods,
    ...aiRenderingResultsMethods,
    ...aiRenderingModelGuideMethods
};