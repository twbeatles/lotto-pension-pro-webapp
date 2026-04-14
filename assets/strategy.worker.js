import { StrategyEngine } from './modules/core/StrategyEngine.js';

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

function createEngine(statsData) {
    return new StrategyEngine(toArray(statsData, []));
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
        const engine = createEngine(payload?.statsData);

        if (type === 'GENERATE') {
            const count = Number(payload?.count || 1);
            const request = payload?.request || {};
            const fixed = toArray(payload?.fixed, []);
            const exclude = toArray(payload?.exclude, []);
            const maxAttempts = Number(payload?.maxAttempts || 300);

            const sets = engine.generateMultipleSets(count, request, {
                fixed,
                exclude,
                maxAttempts
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
        const result = engine.recommendFromSimulation(request, { setCount });
        const sets = toArray(result?.sets, []);
        const explanations = sets.map((set) => engine.explainSet(set, request));
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
