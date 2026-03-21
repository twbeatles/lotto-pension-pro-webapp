import { strategyRequestMethods } from './strategy/request.js';
import { strategyContextMethods } from './strategy/context.js';
import { strategyWeightMethods } from './strategy/weights.js';
import { strategyEvaluationMethods } from './strategy/evaluation.js';
import { strategyGenerationMethods } from './strategy/generation.js';

export class StrategyEngine {
    constructor(winningStats = []) {
        this.data = [...(winningStats || [])]
            .filter((d) => Number.isFinite(Number(d?.draw_no)))
            .sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
        this._analysisCache = new Map();
    }
}

Object.assign(StrategyEngine.prototype,
    strategyRequestMethods,
    strategyContextMethods,
    strategyWeightMethods,
    strategyEvaluationMethods,
    strategyGenerationMethods
);
