import { strategyGenerationSamplingMethods } from './generation/sampling.js';
import { strategyGenerationWheelMethods } from './generation/wheel.js';
import { strategyGenerationStandardMethods } from './generation/standard.js';
import { strategyGenerationSimulationMethods } from './generation/simulation.js';

export const strategyGenerationMethods = {
    ...strategyGenerationSamplingMethods,
    ...strategyGenerationWheelMethods,
    ...strategyGenerationStandardMethods,
    ...strategyGenerationSimulationMethods
};