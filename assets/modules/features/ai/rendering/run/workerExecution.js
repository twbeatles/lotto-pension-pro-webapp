import { UIManager } from '../../../../core/UIManager.js';
import { StrategyEngine } from '../../../../core/StrategyEngine.js';
import { isAutoStrategyId } from '../../../../core/StrategyCatalog.js';
import { createRuntimeRng } from '../../../../core/strategy/runtimeEntropy.js';
import { UI_STRINGS } from '../../../../utils/strings.js';
import { normalizeSimulation } from '../formatters.js';

export async function executeAiRecommendation(ctx, { request, targetSetCount, log, workerPayload }) {
    let result = null;
    let results;
    let explanations;
    let fallback = false;
    let workerTimedOut = false;

    try {
        result = await ctx.workerClient.recommend(workerPayload);
        result = normalizeSimulation(result, { executionMode: 'worker' });
        results = Array.isArray(result?.sets) ? result.sets : [];
        explanations = Array.isArray(result?.explanations) ? result.explanations : [];
    } catch (err) {
        workerTimedOut = ctx.isWorkerTimeoutError(err);
        if (workerTimedOut && isAutoStrategyId(request.strategyId)) {
            const message = UI_STRINGS.ai.workerTimeoutAuto;
            ctx.appendLog(log, `> ${message}`, 'var(--warning)');
            UIManager.toast(message, 'warning');
            const handledError = new Error(message);
            handledError.userFacingHandled = true;
            throw handledError;
        }

        fallback = true;
        if (workerTimedOut) {
            UIManager.toast(UI_STRINGS.ai.workerFallback, 'warning');
        }
        console.warn('번호 추천 워커 실패, 메인 스레드로 대체합니다.', err);
        ctx.engine = new StrategyEngine(ctx.app.data.state.winningStats);
        const runtimeRng = createRuntimeRng(request, workerPayload.runtimeSeed);
        const execution = ctx.engine.prepareExecution(request, {
            ...(runtimeRng ? { rng: runtimeRng } : {})
        });
        result = ctx.engine.recommendFromSimulation(request, {
            setCount: targetSetCount,
            execution,
            ...(runtimeRng ? { rng: runtimeRng } : {})
        });
        result = normalizeSimulation(result, {
            executionMode: 'main_thread',
            workerTimedOut
        });
        results = Array.isArray(result?.sets) ? result.sets : [];
        explanations = results.map((set) =>
            ctx.engine.explainSet(set, request, {
                execution,
                normalizedRequest: execution.normalizedRequest,
                sourceData: execution.sourceData,
                context: execution.context,
                weights: result?.simulation?.weights || execution.weights
            })
        );
    }

    return { result, results, explanations, fallback, workerTimedOut };
}

export function ensureAiExplanations(ctx, { request, results, result }) {
    if (!results || results.length === 0) {
        throw new Error('시뮬레이션 결과가 비어 있습니다');
    }

    ctx.engine = new StrategyEngine(ctx.app.data.state.winningStats);
    const execution = ctx.engine.prepareExecution(request);
    return results.map((set) =>
        ctx.engine.explainSet(set, request, {
            execution,
            normalizedRequest: execution.normalizedRequest,
            sourceData: execution.sourceData,
            context: execution.context,
            weights: result?.simulation?.weights || execution.weights
        })
    );
}