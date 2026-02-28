import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { StrategyEngine } from '../../assets/modules/core/StrategyEngine.js';
import { buildBackupPayload } from '../../assets/modules/utils/backup.js';

function normalizeStats(raw) {
    const list = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
    return list
        .map((row) => ({
            draw_no: Number(row.draw_no),
            numbers: (row.numbers || []).map(Number).sort((a, b) => a - b),
            bonus: Number(row.bonus),
            date: row.date,
            prize_amount: Number(row.prize_amount || 0),
            winners_count: Number(row.winners_count || 0),
            total_sales: Number(row.total_sales || 0)
        }))
        .filter((row) => Number.isFinite(row.draw_no) && row.numbers.length === 6 && Number.isFinite(row.bonus))
        .sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
}

function buildSmokeRequest() {
    return {
        strategyId: 'ensemble_weighted',
        params: {
            simulationCount: 3000,
            lookbackWindow: 20,
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: 20260228,
            payoutMode: 'hybrid_dynamic_first'
        },
        filters: {
            oddEven: [2, 4],
            highLow: [2, 4],
            sumRange: [90, 200],
            acRange: [4, 9],
            maxConsecutivePairs: 2,
            endDigitUniqueMin: 3
        }
    };
}

function assertTicketShape(sets, expectedCount) {
    assert.ok(Array.isArray(sets), 'sets must be an array');
    assert.ok(sets.length > 0, 'sets must not be empty');
    assert.ok(sets.length <= expectedCount, 'sets must not exceed requested count');
    for (const set of sets) {
        assert.equal(set.length, 6, 'each set must contain 6 numbers');
        const sorted = [...set].sort((a, b) => a - b);
        assert.deepEqual(set, sorted, 'set must be sorted');
        assert.equal(new Set(set).size, 6, 'set must contain unique numbers');
        for (const n of set) assert.ok(n >= 1 && n <= 45, 'numbers must be in [1, 45]');
    }
}

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

function runBackupSmoke(stats) {
    const state = {
        theme: 'dark',
        customProxy: 'https://example-proxy.local/proxy/latest',
        favorites: [{ numbers: [1, 2, 3, 4, 5, 6], date: '2026-02-28T00:00:00.000Z' }],
        history: [{ numbers: [7, 8, 9, 10, 11, 12], date: '2026-02-28T00:00:00.000Z' }],
        ticketBook: [],
        campaigns: [],
        alertPrefs: { enableInApp: true, enableSystemNotification: false, notifyOnNewResult: true },
        strategyPrefs: {
            generator: buildSmokeRequest(),
            ai: buildSmokeRequest(),
            backtest: buildSmokeRequest()
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

    assert.equal(payload.version, 3, 'backup version must be 3');
    assert.ok(Array.isArray(payload.localUpdates), 'localUpdates must be array');
    assert.ok(Array.isArray(payload.strategyPresets), 'strategyPresets must be array');
    assert.ok(payload.localUpdates.length >= 1, 'localUpdates must include at least one item');
    assert.ok(payload.strategyPresets.length >= 1, 'strategyPresets must include at least one item');
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

    const backtest = runBacktestSmoke(stats);
    runBackupSmoke(stats);

    console.log(`[PASS] generate: ${generated.length} sets`);
    console.log(`[PASS] recommend: ${recommended.sets.length} sets`);
    console.log(`[PASS] backtest-smoke: tickets=${backtest.tickets}, wins=${backtest.wins}, prize=${backtest.totalPrize}`);
    console.log('[PASS] backup-v3 schema');
    console.log('[DONE] smoke checks passed');
}

main().catch((err) => {
    console.error('[FAIL] smoke check failed');
    console.error(err);
    process.exitCode = 1;
});
