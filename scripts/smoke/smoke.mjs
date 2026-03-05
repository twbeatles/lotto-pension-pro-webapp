import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { StrategyEngine } from '../../assets/modules/core/StrategyEngine.js';
import { DataManager } from '../../assets/modules/core/DataManager.js';
import { runPostImportRefresh } from '../../assets/modules/features/DataIO.js';
import { buildBackupPayload, normalizeBackupPayload } from '../../assets/modules/utils/backup.js';
import { passesFilters } from '../../assets/modules/core/StrategyFilters.js';
import { CONFIG } from '../../assets/modules/utils/config.js';
import { QrScannerModule } from '../../assets/modules/features/QrScanner.js';

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
    assert.ok(sets.every((set) => passesFilters(set, request.filters)), 'all generated sets must pass filters');
}

function runDrawNormalizationRegression() {
    const dm = new DataManager();
    const duplicateNumbers = dm.normalizeDrawItem({
        draw_no: 9999,
        date: '2026-03-01',
        numbers: [1, 1, 2, 3, 4, 5],
        bonus: 6
    });
    assert.equal(duplicateNumbers, null, 'duplicate numbers must be rejected');

    const bonusOverlap = dm.normalizeDrawItem({
        draw_no: 9999,
        date: '2026-03-01',
        numbers: [1, 2, 3, 4, 5, 6],
        bonus: 6
    });
    assert.equal(bonusOverlap, null, 'bonus overlap must be rejected');

    const payload = normalizeBackupPayload({
        version: 3,
        favorites: [],
        history: [],
        ticketBook: [],
        campaigns: [],
        alertPrefs: {},
        settings: {},
        localUpdates: [
            { draw_no: 9999, date: '2026-03-01', numbers: [1, 1, 2, 3, 4, 5], bonus: 6 },
            { draw_no: 10000, date: '2026-03-01', numbers: [1, 2, 3, 4, 5, 6], bonus: 6 },
            { draw_no: 10001, date: '2026-03-01', numbers: [1, 2, 3, 4, 5, 6], bonus: 7 }
        ],
        strategyPresets: []
    });
    assert.equal(payload.localUpdates.length, 1, 'backup normalization must keep only valid updates');
}

function runCampaignLimitRegression() {
    assert.equal(CONFIG.LIMITS.MAX_BACKTEST_SPAN, 300, 'MAX_BACKTEST_SPAN must be 300');
    assert.equal(CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS, 52, 'MAX_CAMPAIGN_WEEKS must be 52');
    assert.equal(CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK, 20, 'MAX_CAMPAIGN_SETS_PER_WEEK must be 20');
    assert.equal(CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS, 500, 'MAX_CAMPAIGN_TOTAL_TICKETS must be 500');

    const dm = new DataManager();
    assert.equal(
        dm.normalizeCampaignEntry({ startDrawNo: 1200, weeks: 53, setsPerWeek: 1 }),
        null,
        'campaign weeks over cap must be rejected'
    );
    assert.equal(
        dm.normalizeCampaignEntry({ startDrawNo: 1200, weeks: 52, setsPerWeek: 21 }),
        null,
        'campaign setsPerWeek over cap must be rejected'
    );
    assert.equal(
        dm.normalizeCampaignEntry({ startDrawNo: 1200, weeks: 26, setsPerWeek: 20 }),
        null,
        'campaign total tickets over cap must be rejected'
    );

    const valid = dm.normalizeCampaignEntry({ startDrawNo: 1200, weeks: 25, setsPerWeek: 20 });
    assert.ok(valid, 'campaign at cap boundary must be accepted');
}

function runQrValidationRegression() {
    const parse = (value) => QrScannerModule.prototype.parseLottoQr.call({}, value);

    const ok = parse('https://m.dhlottery.co.kr/?v=0861q010203040506');
    assert.equal(ok.length, 1, 'valid official QR must be parsed');

    assert.throws(
        () => parse('https://evil.example.com/?v=0861q010203040506'),
        /공식 큐알 코드/,
        'non-official host must be rejected'
    );

    assert.throws(
        () => parse('https://m.dhlottery.co.kr/?v=0861q010101020304'),
        /유효한 게임/,
        'duplicate-number game must be rejected'
    );
}

function runTicketDedupeRegression() {
    const dm = new DataManager();
    const base = {
        targetDrawNo: 1210,
        source: 'generator',
        numbers: [1, 2, 3, 4, 5, 6]
    };

    const strategyRequestA = {
        strategyId: 'ensemble_weighted',
        params: { simulationCount: 5000, lookbackWindow: 20 },
        filters: { sumRange: [100, 175], oddEven: [2, 4] }
    };
    const strategyRequestB = {
        filters: { oddEven: [2, 4], sumRange: [100, 175] },
        params: { lookbackWindow: 20, simulationCount: 5000 },
        strategyId: 'ensemble_weighted'
    };

    const keyA = dm.buildTicketKey({ ...base, strategyRequest: strategyRequestA });
    const keyB = dm.buildTicketKey({ ...base, strategyRequest: strategyRequestB });
    assert.equal(keyA, keyB, 'ticket dedupe key must be stable across key order differences');
}

async function runSyncGuardRegression() {
    const previousDocument = globalThis.document;
    globalThis.document = { querySelector: () => null };

    try {
        const dm = new DataManager();
        let callCount = 0;

        dm._fetchLatestFromAPIInternal = async () => {
            callCount++;
            await new Promise((resolve) => setTimeout(resolve, 40));
            return true;
        };

        const p1 = dm.fetchLatestFromAPI({ trigger: 'manual', silent: false });
        const p2 = dm.fetchLatestFromAPI({ trigger: 'manual', silent: false });
        await Promise.all([p1, p2]);
        assert.equal(callCount, 1, 'sync internal runner must execute only once while in-flight');

        dm.syncAbortController = new AbortController();
        dm.syncCancelable = true;
        assert.equal(dm.cancelActiveSync(), true, 'manual sync cancel must return true when abortable');
        assert.equal(dm.syncAbortController.signal.aborted, true, 'manual sync cancel must abort signal');

        dm.syncCancelable = false;
        assert.equal(dm.cancelActiveSync(), false, 'cancel must return false when not cancelable');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runPostImportRefreshRegression() {
    const calls = [];
    const data = {
        async fetchWinningStats(options) {
            calls.push(`fetchWinningStats:${JSON.stringify(options)}`);
        }
    };
    const app = {
        updateLatestWin() {
            calls.push('updateLatestWin');
        },
        async refreshCurrentRoute() {
            calls.push('refreshCurrentRoute');
        },
        renderDataLists() {
            calls.push('renderDataLists');
        }
    };
    await runPostImportRefresh({ data, app });
    assert.deepEqual(calls, [
        'fetchWinningStats:{"notifyTicketSettle":false}',
        'updateLatestWin',
        'refreshCurrentRoute',
        'renderDataLists'
    ], 'post-import refresh order must be preserved');
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
    runStrictFilterRegression(stats.slice(-180));
    runDrawNormalizationRegression();
    runCampaignLimitRegression();
    runQrValidationRegression();
    runTicketDedupeRegression();
    await runSyncGuardRegression();
    await runPostImportRefreshRegression();

    console.log(`[PASS] generate: ${generated.length} sets`);
    console.log(`[PASS] recommend: ${recommended.sets.length} sets`);
    console.log(`[PASS] backtest-smoke: tickets=${backtest.tickets}, wins=${backtest.wins}, prize=${backtest.totalPrize}`);
    console.log('[PASS] backup-v3 schema');
    console.log('[PASS] strict-filter regression');
    console.log('[PASS] draw-normalization regression');
    console.log('[PASS] campaign-limit regression');
    console.log('[PASS] qr-validation regression');
    console.log('[PASS] ticket-dedupe regression');
    console.log('[PASS] sync-guard regression');
    console.log('[PASS] post-import-refresh regression');
    console.log('[DONE] smoke checks passed');
}

main().catch((err) => {
    console.error('[FAIL] smoke check failed');
    console.error(err);
    process.exitCode = 1;
});
