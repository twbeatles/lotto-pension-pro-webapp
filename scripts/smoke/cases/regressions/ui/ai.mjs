/* eslint-disable no-unused-vars */
import { assert, createDocumentStub, createField, DataManager, readFile, resolve } from '../support.mjs';
import { aiRenderingMethods } from '../../../../../assets/modules/features/ai/rendering.js';

async function runAiRunStaleTokenRegression() {
    const renderCalls = [];
    const out = createField();
    const log = createField();
    const btn = createField();
    const previousDocument = globalThis.document;

    globalThis.document = createDocumentStub({
        '#aiPredictBtn': btn,
        '#aiOutput': out,
        '#aiLogArea': log,
        '#page-ai .ai-container': createField()
    });

    let releaseFirst;
    const firstGate = new Promise((resolveGate) => {
        releaseFirst = resolveGate;
    });

    const ctx = {
        app: {
            data: {
                state: { winningStats: [{ draw_no: 1200, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 }], aiResults: [] },
                save() {},
                persistTemporaryResultsToSession() {}
            }
        },
        runToken: 0,
        isRecommending: false,
        buildStrategyRequest() {
            return {
                strategyId: 'ensemble_weighted',
                params: { simulationCount: 5000, lookbackWindow: 20 },
                filters: {}
            };
        },
        appendLog() {},
        isWorkerTimeoutError() {
            return false;
        },
        workerClient: {
            async recommend() {
                await firstGate;
                return {
                    sets: [[1, 2, 3, 4, 5, 6]],
                    explanations: [],
                    simulation: { diagnostics: { accepted: 1, simulationCount: 5000, executionMode: 'worker' } }
                };
            }
        },
        renderResults(results, explanations, options = {}) {
            renderCalls.push({ results, runtimeSeed: options.runtimeSeed });
        }
    };

    try {
        const firstRun = aiRenderingMethods.run.call(ctx);
        ctx.runToken += 1;
        releaseFirst();
        await firstRun;

        assert.equal(renderCalls.length, 0, 'stale AI run must not render results after runToken advances');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runAiRuntimeSeedSurfaceRegression() {
    const [aiRenderingSource, reproductionSource] = await Promise.all([
        readFile(resolve(process.cwd(), 'assets/modules/features/ai/rendering.js'), 'utf8'),
        readFile(resolve(process.cwd(), 'assets/modules/utils/reproductionCode.js'), 'utf8')
    ]);

    assert.match(aiRenderingSource, /const localToken = \+\+this\.runToken/, 'AI run must track runToken');
    assert.match(aiRenderingSource, /if \(localToken !== this\.runToken\) return/, 'AI run must ignore stale completions');
    assert.match(aiRenderingSource, /upsertReproductionCodeBar/, 'AI results must surface reproduction code');
    assert.match(reproductionSource, /재현 코드/, 'reproduction helper must expose Korean reproduction label');
}

export { runAiRunStaleTokenRegression, runAiRuntimeSeedSurfaceRegression };