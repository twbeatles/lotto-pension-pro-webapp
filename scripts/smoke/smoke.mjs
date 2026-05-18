import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { StrategyEngine } from '../../assets/modules/core/StrategyEngine.js';

import { assertTicketShape, buildSmokeRequest, normalizeStats } from './helpers/common.mjs';
import * as regressions from './cases/regressions.mjs';
import { regressionExecutionPlan } from './cases/regressions/manifest.mjs';

function getRegressionArgs(argKey, argMap) {
    if (!argKey) return [];
    if (!(argKey in argMap)) {
        throw new Error(`Unknown regression argKey: ${argKey}`);
    }
    return [argMap[argKey]];
}

async function runRegressionPlan(argMap) {
    for (const { name, argKey, awaited = false } of regressionExecutionPlan) {
        assert.equal(typeof regressions[name], 'function', `regression export ${name}() must exist`);
        const result = regressions[name](...getRegressionArgs(argKey, argMap));
        if (awaited) await result;
    }
}

async function main() {
    const dataPath = resolve(process.cwd(), 'data', 'winning_stats.json');
    const raw = JSON.parse(await readFile(dataPath, 'utf8'));
    const stats = normalizeStats(raw);
    assert.ok(stats.length > 100, 'winning_stats.json must contain enough draws');

    const request = buildSmokeRequest();
    const engine = new StrategyEngine(stats.slice(0, -1));

    const generated = engine.generateMultipleSets(3, request, { sourceData: stats.slice(-120) });
    assertTicketShape(generated, 3);

    const recommended = engine.recommendFromSimulation(request, {
        sourceData: stats.slice(-200),
        setCount: 3
    });
    assertTicketShape(recommended.sets, 3);

    const backtest = regressions.runBacktestSmoke(stats);
    regressions.runBackupSmoke(stats);

    await runRegressionPlan({
        stats180: stats.slice(-180)
    });

    console.log(`[PASS] generate: ${generated.length} sets`);
    console.log(`[PASS] recommend: ${recommended.sets.length} sets`);
    console.log(
        `[PASS] backtest-smoke: tickets=${backtest.tickets}, wins=${backtest.wins}, prize=${backtest.totalPrize}`
    );
    console.log('[PASS] backup-v5 schema');
    regressionExecutionPlan.forEach(({ label }) => {
        console.log(`[PASS] ${label}`);
    });
    console.log('[DONE] smoke checks passed');
}

main().catch((err) => {
    console.error('[FAIL] smoke check failed');
    console.error(err);
    process.exitCode = 1;
});
