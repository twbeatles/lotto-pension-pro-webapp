import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { StrategyEngine } from '../../assets/modules/core/StrategyEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function loadStats() {
    const raw = fs.readFileSync(path.join(repoRoot, 'data', 'winning_stats.json'), 'utf8');
    return JSON.parse(raw);
}

function time(label, task) {
    const t0 = performance.now();
    const result = task();
    const t1 = performance.now();
    return { label, ms: t1 - t0, result };
}

function avg(list) {
    if (!list.length) return 0;
    return list.reduce((a, b) => a + b, 0) / list.length;
}

function runGenerateBench(stats) {
    const request = {
        strategyId: 'ensemble_weighted',
        params: { simulationCount: 5000, lookbackWindow: 20, wheelPoolSize: null, wheelGuarantee: null, seed: 42 },
        filters: {
            oddEven: null,
            highLow: null,
            sumRange: null,
            acRange: null,
            maxConsecutivePairs: null,
            endDigitUniqueMin: null
        }
    };
    const engine = new StrategyEngine(stats);
    const rounds = 20;
    const ms = [];
    for (let i = 0; i < rounds; i++) {
        const run = time('generate', () => engine.generateMultipleSets(500, request, { maxAttempts: 60000 }));
        ms.push(run.ms);
    }
    return {
        rounds,
        avgMs: avg(ms),
        minMs: Math.min(...ms),
        maxMs: Math.max(...ms)
    };
}

function runRecommendBench(stats) {
    const request = {
        strategyId: 'ensemble_weighted',
        params: { simulationCount: 5000, lookbackWindow: 20, wheelPoolSize: null, wheelGuarantee: null, seed: 2026 },
        filters: {
            oddEven: null,
            highLow: null,
            sumRange: null,
            acRange: null,
            maxConsecutivePairs: null,
            endDigitUniqueMin: null
        }
    };
    const engine = new StrategyEngine(stats);
    const rounds = 30;
    const ms = [];
    for (let i = 0; i < rounds; i++) {
        const run = time('recommend', () => engine.recommendFromSimulation(request, { setCount: 5 }));
        ms.push(run.ms);
    }
    return {
        rounds,
        avgMs: avg(ms),
        minMs: Math.min(...ms),
        maxMs: Math.max(...ms)
    };
}

function runBacktestLikeBench(stats) {
    const requests = ['ensemble_weighted', 'hot_frequency', 'cold_frequency', 'balance_oe_hl', 'stat_ac_sum'].map(
        (strategyId, idx) => ({
            strategyId,
            params: {
                simulationCount: 5000,
                lookbackWindow: 20,
                wheelPoolSize: null,
                wheelGuarantee: null,
                seed: 100 + idx
            },
            filters: {
                oddEven: null,
                highLow: null,
                sumRange: null,
                acRange: null,
                maxConsecutivePairs: null,
                endDigitUniqueMin: null
            }
        })
    );

    const sorted = [...stats].sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
    const drawIndex = new Map();
    sorted.forEach((draw, idx) => drawIndex.set(Number(draw.draw_no), idx));
    const engine = new StrategyEngine(sorted);

    const startDraw = 1160;
    const endDraw = 1209;
    const qty = 500;
    const run = time('backtest_like', () => {
        let tickets = 0;
        for (const req of requests) {
            for (let drawNo = startDraw; drawNo <= endDraw; drawNo++) {
                const idx = drawIndex.get(drawNo);
                if (!Number.isFinite(idx) || idx <= 0) continue;
                const history = sorted.slice(0, idx);
                const sets = engine.generateMultipleSets(qty, req, {
                    sourceData: history,
                    sourceDataSorted: true,
                    maxAttempts: qty * 120
                });
                tickets += sets.length;
            }
        }
        return tickets;
    });

    return {
        strategies: requests.length,
        draws: endDraw - startDraw + 1,
        qtyPerDraw: qty,
        totalTickets: run.result,
        totalMs: run.ms
    };
}

function assertThreshold(name, actual, threshold) {
    const ok = actual <= threshold;
    return {
        name,
        actualMs: Number(actual.toFixed(2)),
        thresholdMs: threshold,
        ok
    };
}

function parseArgs(argv = []) {
    const out = { baseline: null, save: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--baseline' && argv[i + 1]) {
            out.baseline = argv[i + 1];
            i++;
            continue;
        }
        if (arg === '--save' && argv[i + 1]) {
            out.save = argv[i + 1];
            i++;
        }
    }
    return out;
}

function readBaseline(pathOrNull) {
    if (!pathOrNull) return null;
    try {
        const raw = fs.readFileSync(path.resolve(repoRoot, pathOrNull), 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function compareWithBaseline(report, baseline) {
    if (!baseline) return null;
    const oldGenerate = Number(baseline?.generate?.avgMs || 0);
    const oldRecommend = Number(baseline?.recommend?.avgMs || 0);
    const oldBacktest = Number(baseline?.backtestLike?.totalMs || 0);
    if (!oldGenerate || !oldRecommend || !oldBacktest) return null;

    const metric = (oldV, newV) => {
        const deltaMs = Number((newV - oldV).toFixed(2));
        const slowdownPct = Number((((newV - oldV) / oldV) * 100).toFixed(2));
        return {
            baselineMs: Number(oldV.toFixed(2)),
            currentMs: Number(newV.toFixed(2)),
            deltaMs,
            slowdownPct,
            improvementPct: Number((slowdownPct * -1).toFixed(2))
        };
    };

    return {
        baselineTimestamp: baseline.timestamp || null,
        generateAvgMs: metric(oldGenerate, report.generate.avgMs),
        recommendAvgMs: metric(oldRecommend, report.recommend.avgMs),
        backtestTotalMs: metric(oldBacktest, report.backtestLike.totalMs)
    };
}

function buildRegressionChecks(comparison, maxSlowdownPct = 10) {
    if (!comparison) return [];
    const checks = [
        { key: 'generateAvgMs', label: 'generate.avgMs' },
        { key: 'recommendAvgMs', label: 'recommend.avgMs' },
        { key: 'backtestTotalMs', label: 'backtestLike.totalMs' }
    ];

    return checks.map((item) => {
        const slowdownPct = Number(comparison?.[item.key]?.slowdownPct || 0);
        return {
            name: `${item.label}.baseline_slowdown`,
            slowdownPct,
            maxAllowedPct: maxSlowdownPct,
            ok: slowdownPct <= maxSlowdownPct
        };
    });
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const stats = loadStats();

    const generate = runGenerateBench(stats);
    const recommend = runRecommendBench(stats);
    const backtestLike = runBacktestLikeBench(stats);

    const thresholdChecks = [
        assertThreshold('generate.avgMs', generate.avgMs, 50),
        assertThreshold('recommend.avgMs', recommend.avgMs, 35),
        assertThreshold('backtestLike.totalMs', backtestLike.totalMs, 7000)
    ];
    const baseline = readBaseline(args.baseline);
    const comparison = compareWithBaseline(
        {
            generate,
            recommend,
            backtestLike
        },
        baseline
    );
    const regressionChecks = buildRegressionChecks(comparison, 10);
    const pass = [...thresholdChecks, ...regressionChecks].every((x) => x.ok);

    const report = {
        timestamp: new Date().toISOString(),
        statsCount: stats.length,
        generate: {
            rounds: generate.rounds,
            avgMs: Number(generate.avgMs.toFixed(2)),
            minMs: Number(generate.minMs.toFixed(2)),
            maxMs: Number(generate.maxMs.toFixed(2))
        },
        recommend: {
            rounds: recommend.rounds,
            avgMs: Number(recommend.avgMs.toFixed(2)),
            minMs: Number(recommend.minMs.toFixed(2)),
            maxMs: Number(recommend.maxMs.toFixed(2))
        },
        backtestLike: {
            strategies: backtestLike.strategies,
            draws: backtestLike.draws,
            qtyPerDraw: backtestLike.qtyPerDraw,
            totalTickets: backtestLike.totalTickets,
            totalMs: Number(backtestLike.totalMs.toFixed(2))
        },
        thresholds: thresholdChecks,
        pass
    };

    if (comparison) {
        report.comparison = comparison;
        report.regression = {
            maxAllowedSlowdownPct: 10,
            checks: regressionChecks
        };
    }

    if (args.save) {
        const outPath = path.resolve(repoRoot, args.save);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    }

    console.log(JSON.stringify(report, null, 2));
    if (!pass) process.exitCode = 1;
}

main();
