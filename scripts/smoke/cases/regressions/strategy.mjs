import {
    assert,
    assertTicketShape,
    buildBackupPayload,
    buildSmokeRequest,
    GeneratorModule,
    passesFilters,
    readFile,
    resolve,
    createRuntimeRng,
    StrategyEngine,
    StrategyWorkerClient,
    withRuntimeSeed,
    xorshift32
} from './support.mjs';

function runBacktestSmoke(stats) {
    const startIndex = Math.max(30, stats.length - 50);
    const sample = stats.slice(startIndex);
    assert.ok(sample.length >= 20, 'backtest smoke requires at least 20 draws');

    const request = buildSmokeRequest();
    let tickets = 0;
    let totalPrize = 0;
    let wins = 0;
    for (let i = 10; i < Math.min(sample.length, 22); i++) {
        const history = sample.slice(0, i);
        const draw = sample[i];
        const engine = new StrategyEngine(history);
        const sets = engine.generateMultipleSets(2, request, { sourceData: history });
        assertTicketShape(sets, 2);
        for (const set of sets) {
            const result = engine.evaluateTicketSet(set, draw, { payoutMode: 'hybrid_dynamic_first' });
            assert.ok(Number.isFinite(result.rank), 'rank must be finite');
            assert.ok(Number.isFinite(result.prize), 'prize must be finite');
            tickets += 1;
            totalPrize += Number(result.prize || 0);
            if (result.rank >= 1 && result.rank <= 5) wins += 1;
        }
    }
    assert.ok(tickets > 0, 'backtest smoke must generate tickets');
    assert.ok(totalPrize >= 0, 'totalPrize must be non-negative');
    return { tickets, totalPrize, wins };
}

function runStrictFilterRegression(stats) {
    const request = {
        strategyId: 'ensemble_weighted',
        params: {
            simulationCount: 3000,
            lookbackWindow: 20,
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: 20260301,
            payoutMode: 'hybrid_dynamic_first'
        },
        filters: {
            oddEven: null,
            highLow: null,
            sumRange: [1, 10],
            acRange: null,
            maxConsecutivePairs: null,
            endDigitUniqueMin: null
        }
    };
    const engine = new StrategyEngine(stats);
    const sets = engine.generateMultipleSets(5, request, { maxAttempts: 30 });
    assert.equal(sets.length, 0, 'impossible filter must not produce fallback sets');
    assert.ok(
        sets.every((set) => passesFilters(set, request.filters)),
        'all generated sets must pass filters'
    );
}

function runGenerateMultipleSetsMaxCountRegression(stats) {
    const engine = new StrategyEngine(stats);
    const request = {
        strategyId: 'random_baseline',
        params: {
            simulationCount: 1000,
            lookbackWindow: 20,
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: 20260519,
            payoutMode: 'hybrid_dynamic_first'
        },
        filters: {}
    };

    const clamped = engine.generateMultipleSets(30, request, { maxCount: 4, maxAttempts: 300 });
    assertTicketShape(clamped, 4);

    const bulk = engine.generateMultipleSets(30, request, { maxAttempts: 3000 });
    assert.equal(bulk.length, 30, 'generateMultipleSets without maxCount must keep bulk-generation behavior');
}

function runWheelFixedNumbersRegression(stats) {
    const engine = new StrategyEngine(stats);
    const fixed = [10, 20, 30, 40, 45];
    const request = {
        strategyId: 'wheel_full',
        params: {
            simulationCount: 5000,
            lookbackWindow: 20,
            wheelPoolSize: 10,
            wheelGuarantee: 4,
            seed: 12345,
            payoutMode: 'hybrid_dynamic_first'
        },
        filters: {}
    };

    const set = engine.generateSet(request, { fixed, maxAttempts: 40 });
    assert.ok(Array.isArray(set), 'wheel strategy must generate a set');
    fixed.forEach((n) => {
        assert.ok(set.includes(n), `wheel strategy must preserve fixed number ${n}`);
    });
}

function runAdaptiveRecommendationDiagnosticsRegression(stats) {
    const engine = new StrategyEngine(stats);
    const adaptiveResult = engine.recommendFromSimulation(
        {
            strategyId: 'auto_recent_top',
            params: {
                simulationCount: 1200,
                lookbackWindow: 120,
                wheelPoolSize: null,
                wheelGuarantee: null,
                seed: 20260414,
                payoutMode: 'hybrid_dynamic_first'
            },
            filters: {}
        },
        {
            setCount: 3
        }
    );

    assert.equal(
        adaptiveResult?.simulation?.diagnostics?.effectiveAdaptiveWindow,
        30,
        'auto recommendation diagnostics must expose the capped evaluation window'
    );
    assert.equal(
        adaptiveResult?.simulation?.diagnostics?.fallbackMode,
        'none',
        'successful auto recommendation must report fallbackMode none'
    );

    const uniformFallback = engine.recommendFromSimulation(
        {
            strategyId: 'ensemble_weighted',
            params: {
                simulationCount: 1000,
                lookbackWindow: 20,
                wheelPoolSize: null,
                wheelGuarantee: null,
                seed: 20260414,
                payoutMode: 'hybrid_dynamic_first'
            },
            filters: {
                oddEven: null,
                highLow: null,
                sumRange: [1, 10],
                acRange: null,
                maxConsecutivePairs: null,
                endDigitUniqueMin: null
            }
        },
        {
            setCount: 1
        }
    );

    assert.equal(
        uniformFallback?.simulation?.diagnostics?.fallbackMode,
        'uniform_weights',
        'zero-accepted recommendation must report the uniform weight fallback mode'
    );
}

function runCampaignDerivedSeedRegression(stats) {
    const baseRequest = {
        strategyId: 'ensemble_weighted',
        params: {
            simulationCount: 2000,
            lookbackWindow: 20,
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: 777,
            payoutMode: 'hybrid_dynamic_first'
        },
        filters: {}
    };

    const week0Request = GeneratorModule.prototype.getCampaignRuntimeRequest.call({}, baseRequest, 0);
    const week1Request = GeneratorModule.prototype.getCampaignRuntimeRequest.call({}, baseRequest, 1);

    assert.equal(baseRequest.params.seed, 777, 'campaign runtime request must not mutate the original seed');
    assert.equal(week0Request.params.seed, 777, 'week 0 must keep the original seed');
    assert.equal(week1Request.params.seed, 778, 'later campaign weeks must derive a distinct runtime seed');

    const engine = new StrategyEngine(stats);
    const week0A = engine.generateMultipleSets(3, week0Request, { maxAttempts: 300 });
    const week1A = engine.generateMultipleSets(3, week1Request, { maxAttempts: 300 });
    const week0B = engine.generateMultipleSets(
        3,
        GeneratorModule.prototype.getCampaignRuntimeRequest.call({}, baseRequest, 0),
        { maxAttempts: 300 }
    );
    const week1B = engine.generateMultipleSets(
        3,
        GeneratorModule.prototype.getCampaignRuntimeRequest.call({}, baseRequest, 1),
        { maxAttempts: 300 }
    );

    assert.notDeepEqual(week0A, week1A, 'derived seeds must diversify week-to-week campaign output');
    assert.deepEqual(week0A, week0B, 'campaign week 0 output must stay reproducible');
    assert.deepEqual(week1A, week1B, 'campaign week 1 output must stay reproducible');
}

function runNoSeedRuntimeEntropyRegression(stats) {
    const engine = new StrategyEngine(stats);
    const request = {
        strategyId: 'ensemble_weighted',
        params: {
            simulationCount: 1200,
            lookbackWindow: 20,
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: null,
            payoutMode: 'hybrid_dynamic_first'
        },
        filters: {}
    };

    const payload = withRuntimeSeed({ request });
    assert.equal(payload.request.params.seed, null, 'runtime entropy must not persist into the strategy seed');
    assert.ok(Number.isFinite(Number(payload.runtimeSeed)), 'no-seed requests must receive runtime entropy');

    const first = engine.recommendFromSimulation(request, {
        setCount: 3,
        rng: createRuntimeRng(request, 111)
    });
    const second = engine.recommendFromSimulation(request, {
        setCount: 3,
        rng: createRuntimeRng(request, 222)
    });
    assert.notDeepEqual(first.sets, second.sets, 'different runtime seeds must diversify no-seed recommendations');

    const seededRequest = {
        ...request,
        params: {
            ...request.params,
            seed: 777
        }
    };
    assert.equal(createRuntimeRng(seededRequest, 111), null, 'explicit seeds must ignore runtime entropy');
    assert.equal(
        Object.prototype.hasOwnProperty.call(withRuntimeSeed({ request: seededRequest }), 'runtimeSeed'),
        false,
        'explicit seeded requests must not receive runtime entropy'
    );

    const seededA = engine.recommendFromSimulation(seededRequest, { setCount: 3 });
    const seededB = engine.recommendFromSimulation(seededRequest, { setCount: 3 });
    assert.deepEqual(seededA.sets, seededB.sets, 'explicit seeds must remain reproducible');

    const zeroSeedRng = xorshift32(0);
    assert.notEqual(zeroSeedRng(), 0, 'zero seed must not degenerate into a constant-zero RNG');
}

async function runRecommendationRuntimePolicyRegression() {
    const [aiRenderingSource, workerSource, workerClientSource] = await Promise.all([
        readFile(resolve(process.cwd(), 'assets/modules/features/ai/rendering.js'), 'utf8'),
        readFile(resolve(process.cwd(), 'assets/strategy.worker.js'), 'utf8'),
        readFile(resolve(process.cwd(), 'assets/modules/core/StrategyWorkerClient.js'), 'utf8')
    ]);

    assert.match(
        aiRenderingSource,
        /if \(workerTimedOut && isAutoStrategyId\(request\.strategyId\)\)/,
        'auto strategy timeouts must short-circuit instead of falling back to main-thread recommendation'
    );
    assert.match(
        aiRenderingSource,
        /executionMode,\s*fallbackMode,\s*effectiveAdaptiveWindow/s,
        'AI rendering must read the richer diagnostics fields'
    );
    assert.match(
        workerSource,
        /executionMode:\s*'worker'/,
        'strategy worker must mark worker-based recommendation diagnostics'
    );
    assert.match(
        workerSource,
        /clampWorkerSetCount/,
        'strategy worker must defensively clamp GENERATE and RECOMMEND set counts'
    );
    assert.match(
        workerClientSource,
        /STRATEGY_WORKER_ASSET_VERSION = 'v23'/,
        'strategy worker asset version must be bumped when worker behavior changes'
    );
    assert.match(
        workerClientSource,
        /url\.searchParams\.set\('v', STRATEGY_WORKER_ASSET_VERSION\)/,
        'strategy worker asset version must be applied as a worker URL query'
    );
    assert.match(
        workerClientSource,
        /if \(isAutoStrategyId\(payload\?\.request\?\.strategyId\)\)/,
        'worker timeout calculation must treat auto recommendation strategies separately'
    );
}

async function runStrategyWorkerFinalTimeoutTerminatesRegression() {
    const client = new StrategyWorkerClient();
    let terminateCount = 0;
    client.ensureWorker = function ensureFakeWorker() {
        if (this.worker) return this.worker;
        this.worker = {
            postMessage() {},
            terminate() {
                terminateCount++;
            }
        };
        return this.worker;
    };

    await assert.rejects(
        () => client.post('GENERATE', { count: 1 }, 5, 0),
        /WORKER_TIMEOUT_FINAL/,
        'final worker timeout must reject with the final timeout code'
    );
    assert.equal(terminateCount, 1, 'final worker timeout must terminate the busy worker');
    assert.equal(client.worker, null, 'final worker timeout must clear the worker instance');
}

async function runStrategyWorkerStatsCacheEmptyRetryRegression() {
    const client = new StrategyWorkerClient();
    const posts = [];
    const statsData = [
        { draw_no: 2, date: '2026-05-10', numbers: [1, 2, 3, 4, 5, 6], bonus: 7 },
        { draw_no: 1, date: '2026-05-03', numbers: [8, 9, 10, 11, 12, 13], bonus: 14 }
    ];

    client.ensureWorker = function ensureFakeWorker() {
        if (this.worker) return this.worker;
        this.worker = {
            postMessage: (message) => {
                posts.push(message);
                queueMicrotask(() => {
                    if (posts.length === 1) {
                        client.handleMessage({
                            type: 'DONE',
                            requestId: message.requestId,
                            payload: { jobType: 'GENERATE', sets: [[1, 2, 3, 4, 5, 6]] }
                        });
                        return;
                    }

                    if (posts.length === 2 && !message.payload?.statsData) {
                        client.handleMessage({
                            type: 'ERROR',
                            requestId: message.requestId,
                            payload: {
                                code: 'STRATEGY_WORKER_CACHE_EMPTY',
                                message: 'Strategy worker data cache is empty.'
                            }
                        });
                        return;
                    }

                    client.handleMessage({
                        type: 'DONE',
                        requestId: message.requestId,
                        payload: { jobType: 'GENERATE', sets: [[7, 8, 9, 10, 11, 12]] }
                    });
                });
            },
            terminate() {}
        };
        return this.worker;
    };

    await client.post('GENERATE', { statsData, count: 1, request: {} }, 100, 0);
    const result = await client.post('GENERATE', { statsData, count: 1, request: {} }, 100, 0);

    assert.equal(posts.length, 3, 'cache-empty worker response must trigger exactly one full-payload retry');
    assert.ok(Array.isArray(posts[0].payload.statsData), 'initial worker request must include statsData');
    assert.equal(posts[1].payload.statsData, undefined, 'second request must use the stats cache fingerprint');
    assert.ok(Array.isArray(posts[2].payload.statsData), 'cache-empty retry must resend statsData');
    assert.deepEqual(result.sets[0], [7, 8, 9, 10, 11, 12], 'cache-empty retry result must resolve normally');
}

async function runStrategyWorkerStatsFingerprintRegression() {
    const client = new StrategyWorkerClient();
    const posts = [];
    const statsA = [
        { draw_no: 3, date: '2026-05-17', numbers: [1, 2, 3, 4, 5, 6], bonus: 7 },
        { draw_no: 2, date: '2026-05-10', numbers: [8, 9, 10, 11, 12, 13], bonus: 14 },
        { draw_no: 1, date: '2026-05-03', numbers: [15, 16, 17, 18, 19, 20], bonus: 21 }
    ];
    const statsB = [
        statsA[0],
        { draw_no: 2, date: '2026-05-10', numbers: [8, 9, 10, 11, 12, 45], bonus: 14 },
        statsA[2]
    ];

    client.ensureWorker = function ensureFakeWorker() {
        if (this.worker) return this.worker;
        this.worker = {
            postMessage: (message) => {
                posts.push(message);
                queueMicrotask(() => {
                    client.handleMessage({
                        type: 'DONE',
                        requestId: message.requestId,
                        payload: { jobType: 'GENERATE', sets: [[1, 2, 3, 4, 5, 6]] }
                    });
                });
            },
            terminate() {}
        };
        return this.worker;
    };

    await client.post('GENERATE', { statsData: statsA, count: 1, request: {} }, 100, 0);
    await client.post('GENERATE', { statsData: statsB, count: 1, request: {} }, 100, 0);

    assert.ok(Array.isArray(posts[0].payload.statsData), 'initial worker request must include statsData');
    assert.ok(
        Array.isArray(posts[1].payload.statsData),
        'changed middle draw data must invalidate the worker stats fingerprint'
    );
    assert.notEqual(posts[0].payload.statsKey, posts[1].payload.statsKey, 'stats fingerprint must include all rows');
}

function runBackupSmoke(stats) {
    const state = {
        theme: 'dark',
        customProxy: 'https://example-proxy.local/proxy/latest',
        favorites: [{ numbers: [1, 2, 3, 4, 5, 6], date: '2026-02-28T00:00:00.000Z' }],
        history: [{ numbers: [7, 8, 9, 10, 11, 12], date: '2026-02-28T00:00:00.000Z' }],
        ticketBook: [],
        campaigns: [],
        pension720Tickets: [
            {
                id: 'p720_1',
                group: 2,
                number: '060727',
                targetDrawNo: 316,
                campaignId: 'p720_campaign_1',
                createdAt: '2026-02-28T00:00:00.000Z'
            }
        ],
        pension720Campaigns: [
            {
                id: 'p720_campaign_1',
                name: 'p720 smoke',
                startDrawNo: 316,
                weeks: 1,
                setsPerDraw: 1,
                createdAt: '2026-02-28T00:00:00.000Z'
            }
        ],
        alertPrefs: { enableInApp: true, enableSystemNotification: false, notifyOnNewResult: true },
        strategyPrefs: {
            generator: buildSmokeRequest(),
            ai: buildSmokeRequest(),
            backtest: buildSmokeRequest(),
            pension720: {
                strategyId: 'mixed_balance',
                params: { seed: 720, lookbackWindow: 40, candidatePoolSize: 140 },
                filters: {}
            }
        },
        strategyPresets: [
            {
                id: 'preset_1',
                scope: 'backtest',
                name: 'smoke preset',
                request: buildSmokeRequest(),
                createdAt: '2026-02-28T00:00:00.000Z',
                updatedAt: '2026-02-28T00:00:00.000Z'
            }
        ]
    };
    const localUpdates = [stats.at(-1), stats.at(-1)];
    const payload = buildBackupPayload(state, {
        localUpdates,
        strategyPresets: state.strategyPresets
    });

    assert.equal(payload.version, 5, 'backup version must be 5');
    assert.ok(Array.isArray(payload.localUpdates), 'localUpdates must be array');
    assert.ok(Array.isArray(payload.strategyPresets), 'strategyPresets must be array');
    assert.ok(Array.isArray(payload.pension720Tickets), 'pension720Tickets must be array');
    assert.ok(Array.isArray(payload.pension720Campaigns), 'pension720Campaigns must be array');
    assert.ok(payload.localUpdates.length >= 1, 'localUpdates must include at least one item');
    assert.ok(payload.strategyPresets.length >= 1, 'strategyPresets must include at least one item');
    assert.equal(payload.pension720Tickets[0]?.number, '060727', 'pension720 backup must preserve leading zeroes');
    assert.equal(payload.pension720Campaigns[0]?.id, 'p720_campaign_1', 'pension720 campaign must be exported');
}

export {
    runAdaptiveRecommendationDiagnosticsRegression,
    runBacktestSmoke,
    runBackupSmoke,
    runCampaignDerivedSeedRegression,
    runGenerateMultipleSetsMaxCountRegression,
    runNoSeedRuntimeEntropyRegression,
    runRecommendationRuntimePolicyRegression,
    runStrategyWorkerFinalTimeoutTerminatesRegression,
    runStrategyWorkerStatsCacheEmptyRetryRegression,
    runStrategyWorkerStatsFingerprintRegression,
    runStrictFilterRegression,
    runWheelFixedNumbersRegression
};
