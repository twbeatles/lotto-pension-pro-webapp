import { StrategyEngine } from './modules/core/StrategyEngine.js';
import { createRuntimeRng } from './modules/core/strategy/runtimeEntropy.js';

let statsCacheKey = '';
let statsCacheData = [];
let engineCacheKey = '';
let engineCache = null;

function toArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
}

function createErrorPayload(requestId, code, err) {
    return {
        requestId,
        code,
        message: err?.message || '전략 워커 실행 중 오류가 발생했습니다.'
    };
}

function resolveStatsData(payload = {}) {
    const nextStats = payload?.statsData;
    const nextKey = String(payload?.statsKey || '');
    if (Array.isArray(nextStats)) {
        statsCacheData = nextStats;
        statsCacheKey = nextKey;
        if (engineCacheKey && engineCacheKey !== nextKey) {
            engineCacheKey = '';
            engineCache = null;
        }
        return statsCacheData;
    }
    if (nextKey && nextKey === statsCacheKey && statsCacheData.length) {
        return statsCacheData;
    }
    if (!nextKey && statsCacheData.length) {
        return statsCacheData;
    }
    throw new Error('Strategy worker data cache is empty.');
}

function createEngine(payload) {
    const statsData = resolveStatsData(payload);
    if (statsCacheKey && engineCacheKey === statsCacheKey && engineCache) {
        return engineCache;
    }
    const engine = new StrategyEngine(statsData);
    if (statsCacheKey) {
        engineCacheKey = statsCacheKey;
        engineCache = engine;
    }
    return engine;
}

self.onmessage = async (event) => {
    const { type, requestId, payload } = event.data || {};

    if (type === 'WARMUP') {
        self.postMessage({
            type: 'READY',
            requestId,
            payload: { warmedUp: true }
        });
        return;
    }

    if (type !== 'GENERATE' && type !== 'RECOMMEND') return;

    try {
        const engine = createEngine(payload);

        if (type === 'GENERATE') {
            const count = Number(payload?.count || 1);
            const request = payload?.request || {};
            const fixed = toArray(payload?.fixed, []);
            const exclude = toArray(payload?.exclude, []);
            const maxAttempts = Number(payload?.maxAttempts || 300);
            const runtimeRng = createRuntimeRng(request, payload?.runtimeSeed);

            const sets = engine.generateMultipleSets(count, request, {
                fixed,
                exclude,
                maxAttempts,
                ...(runtimeRng ? { rng: runtimeRng } : {})
            });

            self.postMessage({
                type: 'DONE',
                requestId,
                payload: {
                    jobType: 'GENERATE',
                    sets
                }
            });
            return;
        }

        const request = payload?.request || {};
        const setCount = Number(payload?.setCount || 5);
        const runtimeRng = createRuntimeRng(request, payload?.runtimeSeed);
        const execution = engine.prepareExecution(request, {
            ...(runtimeRng ? { rng: runtimeRng } : {})
        });
        const result = engine.recommendFromSimulation(request, {
            setCount,
            execution,
            ...(runtimeRng ? { rng: runtimeRng } : {})
        });
        const sets = toArray(result?.sets, []);
        const explanations = sets.map((set) =>
            engine.explainSet(set, request, {
                execution,
                normalizedRequest: execution.normalizedRequest,
                sourceData: execution.sourceData,
                context: execution.context,
                weights: result?.simulation?.weights || execution.weights
            })
        );
        const diagnostics = result?.simulation?.diagnostics
            ? {
                  ...result.simulation.diagnostics,
                  executionMode: 'worker',
                  fallbackMode: result.simulation.diagnostics.fallbackMode || 'none',
                  effectiveAdaptiveWindow: result.simulation.diagnostics.effectiveAdaptiveWindow ?? null
              }
            : {
                  executionMode: 'worker',
                  fallbackMode: 'none',
                  effectiveAdaptiveWindow: null
              };

        self.postMessage({
            type: 'DONE',
            requestId,
            payload: {
                jobType: 'RECOMMEND',
                sets,
                simulation: result?.simulation
                    ? {
                          ...result.simulation,
                          diagnostics
                      }
                    : null,
                explanations
            }
        });
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            payload: createErrorPayload(requestId, 'STRATEGY_WORKER_ERROR', err)
        });
    }
};
