import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { StrategyEngine } from '../../../assets/modules/core/StrategyEngine.js';
import { DataManager } from '../../../assets/modules/core/DataManager.js';
import { LottoApp } from '../../../assets/modules/core/LottoApp.js';
import { UIManager } from '../../../assets/modules/core/UIManager.js';
import { DataIOModule, runPostImportRefresh } from '../../../assets/modules/features/DataIO.js';
import { GeneratorModule } from '../../../assets/modules/features/Generator.js';
import { CheckModule } from '../../../assets/modules/features/Check.js';
import { buildBackupPayload, normalizeBackupPayload } from '../../../assets/modules/utils/backup.js';
import { passesFilters } from '../../../assets/modules/core/StrategyFilters.js';
import { CONFIG } from '../../../assets/modules/utils/config.js';
import { QrScannerModule } from '../../../assets/modules/features/QrScanner.js';
import { estimateLatestDrawKST } from '../../../assets/modules/utils/utils.js';

import {
    assertTicketShape,
    buildSmokeRequest,
    createDocumentStub,
    createField
} from '../helpers/common.mjs';

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
    assert.equal(ok[0].targetDrawNo, 861, 'QR parser must preserve draw number');
    assert.deepEqual(ok[0].numbers, [1, 2, 3, 4, 5, 6], 'QR parser must preserve ticket numbers');

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

    const campaignKeyA = dm.buildTicketKey({ ...base, campaignId: 'camp_a', strategyRequest: strategyRequestA });
    const campaignKeyB = dm.buildTicketKey({ ...base, campaignId: 'camp_b', strategyRequest: strategyRequestA });
    assert.notEqual(campaignKeyA, campaignKeyB, 'campaignId must participate in ticket dedupe key');
}

function runTicketQuantityGroupingRegression() {
    const dm = new DataManager();
    dm.save = () => {};

    const first = dm.addTicket([1, 2, 3, 4, 5, 6], {
        source: 'generator',
        targetDrawNo: 1210,
        strategyRequest: { strategyId: 'ensemble_weighted', params: {}, filters: {} }
    });
    const second = dm.addTicket([1, 2, 3, 4, 5, 6], {
        source: 'generator',
        targetDrawNo: 1210,
        strategyRequest: { strategyId: 'ensemble_weighted', params: {}, filters: {} }
    });

    assert.equal(first?.inserted, true, 'first addTicket call must insert a row');
    assert.equal(second?.incremented, true, 'duplicate addTicket call must increase quantity');
    assert.equal(dm.state.ticketBook.length, 1, 'duplicate single-ticket adds must keep one grouped row');
    assert.equal(dm.state.ticketBook[0].quantity, 2, 'duplicate single-ticket adds must increase quantity');

    const bulk = dm.addTicketsBulk([
        {
            id: 'ticket_camp_a_1',
            numbers: [7, 8, 9, 10, 11, 12],
            targetDrawNo: 1211,
            source: 'import',
            campaignId: 'camp_a'
        },
        {
            id: 'ticket_camp_a_2',
            numbers: [7, 8, 9, 10, 11, 12],
            targetDrawNo: 1211,
            source: 'import',
            campaignId: 'camp_a'
        },
        {
            id: 'ticket_camp_b_1',
            numbers: [7, 8, 9, 10, 11, 12],
            targetDrawNo: 1211,
            source: 'import',
            campaignId: 'camp_b'
        }
    ], { silent: true });

    assert.equal(bulk.insertedRows, 2, 'bulk add must keep separate rows when campaignId differs');
    assert.equal(bulk.incrementedRows, 1, 'bulk add must merge duplicate rows within the same campaign');
    assert.equal(bulk.addedQuantity, 3, 'bulk add must count physical ticket quantity');
    assert.equal(dm.countTicketsByCampaignId('camp_a'), 2, 'campaign ticket count must use physical ticket quantity');
    assert.equal(dm.countTicketsByCampaignId('camp_b'), 1, 'campaign ticket count must preserve separate campaign rows');

    const campATicket = dm.state.ticketBook.find((ticket) => ticket.campaignId === 'camp_a');
    assert.equal(campATicket?.quantity, 2, 'same-campaign duplicate tickets must merge into one grouped row');

    const removed = dm.removeTicket(campATicket?.id);
    assert.equal(removed.removedTickets, 2, 'ticket delete must remove the full grouped quantity at once');
}

function runImmediateTicketSettlementRegression() {
    const dm = new DataManager();
    dm.save = () => {};
    dm.state.winningStats = [{
        draw_no: 1209,
        date: '2026-03-07',
        numbers: [1, 2, 3, 4, 5, 6],
        bonus: 7
    }];

    const settled = dm.addTicket([1, 2, 3, 4, 5, 6], {
        source: 'generator',
        targetDrawNo: 1209
    });
    assert.equal(settled?.ticket?.checked?.drawNo, 1209, 'past-draw single ticket must settle immediately');
    assert.equal(settled?.ticket?.checked?.rank, 1, 'past-draw single ticket must calculate rank immediately');

    const pending = dm.addTicket([8, 9, 10, 11, 12, 13], {
        source: 'generator',
        targetDrawNo: 1210
    });
    assert.equal(pending?.ticket?.checked, null, 'future-draw single ticket must stay pending');

    const inserted = dm.addTicketsBulk([
        {
            id: 'ticket_bulk_past',
            numbers: [1, 2, 3, 4, 8, 9],
            targetDrawNo: 1209,
            source: 'import'
        },
        {
            id: 'ticket_bulk_future',
            numbers: [14, 15, 16, 17, 18, 19],
            targetDrawNo: 1210,
            source: 'import'
        }
    ], { silent: true });

    assert.equal(inserted.insertedRows, 2, 'bulk insert must keep both unique tickets');
    assert.equal(inserted.addedQuantity, 2, 'bulk insert must report physical ticket count');
    assert.equal(
        dm.state.ticketBook.find((ticket) => ticket.id === 'ticket_bulk_past')?.checked?.drawNo,
        1209,
        'past-draw bulk ticket must settle immediately'
    );
    assert.equal(
        dm.state.ticketBook.find((ticket) => ticket.id === 'ticket_bulk_future')?.checked,
        null,
        'future-draw bulk ticket must stay pending'
    );
}

async function runTicketReconcileRegression() {
    const dm = new DataManager();
    dm.save = () => {};
    dm.markDirty = () => {};
    dm.state.ticketBook = [
        dm.normalizeTicketEntry({
            id: 'ticket_checked_past',
            numbers: [1, 2, 3, 4, 5, 6],
            targetDrawNo: 1209,
            source: 'import',
            checked: { drawNo: 1209, rank: 1, checkedAt: '2026-03-08T00:00:00.000Z' }
        }),
        dm.normalizeTicketEntry({
            id: 'ticket_checked_future',
            numbers: [1, 2, 3, 4, 5, 6],
            targetDrawNo: 1210,
            source: 'import',
            checked: { drawNo: 1210, rank: 1, checkedAt: '2026-03-08T00:00:00.000Z' }
        })
    ].filter(Boolean);
    dm.state.winningStats = [{
        draw_no: 1209,
        date: '2026-03-07',
        numbers: [7, 8, 9, 10, 11, 12],
        bonus: 13
    }];

    const summary = await dm.reconcileTicketChecks({ silent: true });

    assert.equal(summary.rechecked, 1, 'reconcile must recompute currently drawable tickets');
    assert.equal(summary.resetToPending, 1, 'reconcile must reset invalid checked tickets to pending');
    assert.equal(summary.losses, 1, 'reconcile must classify recomputed losing tickets');
    assert.equal(
        dm.state.ticketBook.find((ticket) => ticket.id === 'ticket_checked_past')?.checked?.rank,
        0,
        'stale checked import ticket must be recalculated against current winning data'
    );
    assert.equal(
        dm.state.ticketBook.find((ticket) => ticket.id === 'ticket_checked_future')?.checked,
        null,
        'checked ticket beyond the latest winning draw must be reset to pending'
    );
}

function runCampaignResetAutofillRecoveryRegression() {
    const previousDocument = globalThis.document;
    const genTarget = createField({
        value: '1300',
        dataset: { userEdited: 'true', lastAutoValue: '1210' }
    });
    const campTarget = createField({
        value: '1300',
        dataset: { userEdited: 'true', lastAutoValue: '1210' }
    });
    const campWeeks = createField({ value: '9' });
    const campSetsPerWeek = createField({ value: '8' });

    globalThis.document = createDocumentStub({
        '#genTargetDrawNo': genTarget,
        '#campStartDraw': campTarget,
        '#campWeeks': campWeeks,
        '#campSetsPerWeek': campSetsPerWeek
    });

    try {
        const app = {
            data: {
                state: {
                    winningStats: [{ draw_no: 1210 }]
                }
            },
            targetDrawInputIds: ['genTargetDrawNo', 'campStartDraw'],
            getSuggestedNextDrawNo: LottoApp.prototype.getSuggestedNextDrawNo,
            setTargetDrawInputValue: LottoApp.prototype.setTargetDrawInputValue,
            resetTargetDrawInputs: LottoApp.prototype.resetTargetDrawInputs
        };

        GeneratorModule.prototype.resetCampaignOptions.call({ app }, true);

        assert.equal(genTarget.value, '1211', 'campaign reset must restore generator target draw to next draw');
        assert.equal(genTarget.dataset.userEdited, 'false', 'campaign reset must restore generator auto-follow state');
        assert.equal(campTarget.value, '1211', 'campaign reset must restore campaign start draw to next draw');
        assert.equal(campTarget.dataset.userEdited, 'false', 'campaign reset must restore campaign auto-follow state');
        assert.equal(String(campWeeks.value), '4', 'campaign reset must restore default week count');
        assert.equal(String(campSetsPerWeek.value), '3', 'campaign reset must restore default set count');

        const changed = LottoApp.prototype.setTargetDrawInputValue.call(app, 'campStartDraw', 1212, {
            force: false,
            userEdited: false
        });
        assert.equal(changed, true, 'campaign reset must allow later automatic target-draw updates');
        assert.equal(campTarget.value, '1212', 'restored campaign target must track the next auto value');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runCampaignCascadeRegression() {
    const dm = new DataManager();
    dm.save = () => {};
    dm.markDirty = () => {};
    dm.state.campaigns = [
        { id: 'camp_a', name: 'A', startDrawNo: 1200, weeks: 2, setsPerWeek: 2 },
        { id: 'camp_b', name: 'B', startDrawNo: 1202, weeks: 1, setsPerWeek: 1 }
    ];
    dm.state.ticketBook = [
        { id: 'ticket_a1', campaignId: 'camp_a' },
        { id: 'ticket_a2', campaignId: 'camp_a' },
        { id: 'ticket_b1', campaignId: 'camp_b' },
        { id: 'ticket_orphan', campaignId: 'camp_orphan' },
        { id: 'ticket_manual', campaignId: '' }
    ];

    const single = dm.removeCampaign('camp_a', { cascadeTickets: true });
    assert.equal(single.removedCampaign, true, 'single campaign delete must remove campaign');
    assert.equal(single.removedTickets, 2, 'single campaign delete must cascade linked tickets');
    assert.equal(dm.state.campaigns.length, 1, 'single campaign delete must keep unrelated campaigns');
    assert.equal(dm.state.ticketBook.some((ticket) => ticket.campaignId === 'camp_a'), false, 'linked camp_a tickets must be removed');
    assert.equal(dm.state.ticketBook.some((ticket) => ticket.id === 'ticket_orphan'), true, 'orphan tickets must be preserved');

    const cleared = dm.clearCampaigns({ cascadeTickets: true });
    assert.equal(cleared.removedCampaigns, 1, 'bulk campaign delete must report removed campaign count');
    assert.equal(cleared.removedTickets, 1, 'bulk campaign delete must remove remaining linked tickets');
    assert.equal(dm.state.campaigns.length, 0, 'all campaigns must be cleared');
    assert.equal(dm.state.ticketBook.some((ticket) => ticket.id === 'ticket_b1'), false, 'linked camp_b tickets must be removed');
    assert.equal(dm.state.ticketBook.some((ticket) => ticket.id === 'ticket_orphan'), true, 'orphan tickets must remain after bulk delete');
    assert.equal(dm.state.ticketBook.some((ticket) => ticket.id === 'ticket_manual'), true, 'manual tickets must remain after bulk delete');
}

function runOrphanCampaignAutoCleanupRegression() {
    const single = new DataManager();
    single.save = () => {};
    single.markDirty = () => {};
    single.state.campaigns = [
        { id: 'camp_single', name: 'Single', startDrawNo: 1210, weeks: 1, setsPerWeek: 1 }
    ];
    single.state.ticketBook = [
        { id: 'ticket_single', campaignId: 'camp_single', numbers: [1, 2, 3, 4, 5, 6], targetDrawNo: 1210 }
    ];

    const singleResult = single.removeTicket('ticket_single');
    assert.equal(singleResult.removed, true, 'single ticket delete must report success');
    assert.equal(singleResult.prunedCampaigns, 1, 'single ticket delete must auto-prune orphan campaign');
    assert.equal(single.state.campaigns.length, 0, 'single ticket delete must remove orphan campaign');

    const bulk = new DataManager();
    bulk.save = () => {};
    bulk.markDirty = () => {};
    bulk.state.campaigns = [
        { id: 'camp_bulk', name: 'Bulk', startDrawNo: 1211, weeks: 1, setsPerWeek: 1 }
    ];
    bulk.state.ticketBook = [
        { id: 'ticket_bulk', campaignId: 'camp_bulk', numbers: [1, 2, 3, 4, 5, 6], targetDrawNo: 1211 }
    ];

    const bulkResult = bulk.clearTicketBook('all');
    assert.equal(bulkResult.removedTickets, 1, 'bulk ticket clear must remove matching tickets');
    assert.equal(bulkResult.prunedCampaigns, 1, 'bulk ticket clear must auto-prune orphan campaigns');
    assert.equal(bulk.state.campaigns.length, 0, 'bulk ticket clear must leave no orphan campaigns');
}

function runCheckTargetDrawRegression() {
    const previousDocument = globalThis.document;
    const area = {
        innerHTML: '',
        classList: {
            add() {},
            remove() {}
        }
    };

    globalThis.document = {
        querySelector(selector) {
            if (selector === '#checkResultArea') return area;
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };

    try {
        const ctx = {
            data: {
                getTicketQuantity() {
                    return 1;
                },
                state: {
                    winningStats: [{
                        draw_no: 1209,
                        date: '2026-03-07',
                        numbers: [1, 2, 3, 4, 5, 6],
                        bonus: 7
                    }]
                }
            },
            currentTicket: null,
            currentDrawNo: null,
            _rank: CheckModule.prototype._rank,
            renderTicketBalls: CheckModule.prototype.renderTicketBalls,
            renderMissingTargetDraw: CheckModule.prototype.renderMissingTargetDraw
        };

        CheckModule.prototype.runLatest.call(ctx, {
            numbers: [1, 2, 3, 4, 5, 6],
            targetDrawNo: 1210
        });

        assert.match(area.innerHTML, /1210회 결과 데이터가 없습니다/, 'missing target draw must show unavailable state');
        assert.ok(!area.innerHTML.includes('1209회'), 'missing target draw must not fall back to latest draw');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runStoredListNormalizationRegression() {
    const previousDocument = globalThis.document;
    const previousStorage = globalThis.localStorage;
    const store = new Map([
        [CONFIG.KEYS.FAV, JSON.stringify([
            { numbers: [6, 5, 4, 3, 2, 1], date: '2026-03-01T00:00:00.000Z' },
            { foo: 'bar' }
        ])],
        [CONFIG.KEYS.HIST, JSON.stringify([
            { numbers: 'oops' }
        ])],
        [CONFIG.KEYS.SETTINGS, '{}'],
        [CONFIG.KEYS.TICKET_BOOK, '[]'],
        [CONFIG.KEYS.CAMPAIGNS, '[]'],
        [CONFIG.KEYS.ALERT_PREFS, '{}'],
        [CONFIG.KEYS.STRATEGY_PRESETS, '[]'],
        ['lotto_pro_updates_v2', '[]']
    ]);

    globalThis.document = {
        querySelector() {
            return null;
        }
    };
    globalThis.localStorage = {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        }
    };

    try {
        const dm = new DataManager();
        dm.load();

        assert.deepEqual(dm.state.favorites, [{
            numbers: [1, 2, 3, 4, 5, 6],
            date: '2026-03-01T00:00:00.000Z'
        }], 'favorites must be normalized during load');
        assert.deepEqual(dm.state.history, [], 'invalid history entries must be dropped during load');
        assert.deepEqual(JSON.parse(store.get(CONFIG.KEYS.FAV)), dm.state.favorites, 'normalized favorites must be persisted back');
        assert.deepEqual(JSON.parse(store.get(CONFIG.KEYS.HIST)), [], 'normalized history must be persisted back');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;

        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
}

function runLocalUpdatesFutureGuardRegression() {
    const dm = new DataManager();
    dm.save = () => {};
    dm.state.syncMeta = dm.getDefaultSyncMeta();
    const est = estimateLatestDrawKST();

    const manual = dm.setLocalUpdates([
        { draw_no: est, date: '2026-03-01', numbers: [1, 2, 3, 4, 5, 6], bonus: 7 },
        { draw_no: est + 3, date: '2026-03-08', numbers: [8, 9, 10, 11, 12, 13], bonus: 14 }
    ], { warningMode: 'manual' });

    assert.equal(manual.items.length, 1, 'future local updates must be dropped when saving');
    assert.equal(manual.droppedFuture, 1, 'future local update count must be reported');
    assert.equal(manual.items[0].draw_no, est, 'allowed local update must be preserved');
    assert.match(dm.state.syncMeta.lastWarningMessage, /로컬 업데이트 1개를 제외/, 'future local update drop must surface a warning');
}

async function runHistoryActualLogRegression() {
    const previousDocument = globalThis.document;
    const previousToast = UIManager.toast;
    const importMode = createField({ value: 'merge' });
    const importApplyTheme = createField();
    const importApplyProxy = createField();
    const importApplyStrategyPrefs = createField();
    const importApplyAlerts = createField();
    const toasts = [];

    UIManager.toast = (message, type = 'info') => {
        toasts.push(`${type}:${message}`);
    };

    globalThis.document = createDocumentStub({
        '#importMode': importMode,
        '#importApplyTheme': importApplyTheme,
        '#importApplyProxy': importApplyProxy,
        '#importApplyStrategyPrefs': importApplyStrategyPrefs,
        '#importApplyAlerts': importApplyAlerts,
        '#customProxyUrl': createField(),
        '#toast-container': null
    });

    try {
        const generatorData = new DataManager();
        generatorData.save = () => {};
        generatorData.markDirty = () => {};
        generatorData.state.generated = [
            [1, 2, 3, 4, 5, 6],
            [1, 2, 3, 4, 5, 6]
        ];
        generatorData.state.history = [];

        GeneratorModule.prototype.saveAll.call({
            data: generatorData,
            app: {
                renderDataLists() {}
            }
        });

        assert.equal(generatorData.state.history.length, 2, 'saveAll must preserve duplicate generated sets as separate history logs');
        assert.deepEqual(
            generatorData.state.history.map((entry) => entry.numbers),
            [
                [1, 2, 3, 4, 5, 6],
                [1, 2, 3, 4, 5, 6]
            ],
            'saveAll must append every generated set to history even when numbers match'
        );

        const payload = {
            version: 3,
            favorites: [],
            history: [
                { numbers: [1, 2, 3, 4, 5, 6], date: '2026-04-03T00:00:00.000Z' },
                { numbers: [1, 2, 3, 4, 5, 6], date: '2026-04-02T00:00:00.000Z' }
            ],
            ticketBook: [],
            campaigns: [],
            alertPrefs: {},
            settings: {},
            localUpdates: [],
            strategyPresets: []
        };
        const file = {
            async text() {
                return JSON.stringify(payload);
            }
        };

        const importData = new DataManager();
        importData.save = () => {};
        importData.state.history = [
            { numbers: [1, 2, 3, 4, 5, 6], date: '2026-04-01T00:00:00.000Z' }
        ];
        importData.setLocalUpdates = () => ({ items: [], droppedFuture: 0 });
        importData.getLocalUpdates = () => [];

        const ctx = Object.create(DataIOModule.prototype);
        ctx.data = importData;
        ctx.app = {
            applyTheme() {},
            renderSettingsPanel() {}
        };
        ctx.syncProxyInput = () => {};
        ctx.refreshPresetSelectors = () => {};
        ctx.runPostImportRefresh = async () => {};

        await DataIOModule.prototype.importAll.call(ctx, {
            currentTarget: {
                files: [file],
                value: 'history-merge.json'
            }
        });

        assert.equal(importData.state.history.length, 3, 'merge import must preserve duplicate history entries as distinct logs');
        assert.deepEqual(
            importData.state.history.map((entry) => entry.date),
            [
                '2026-04-03T00:00:00.000Z',
                '2026-04-02T00:00:00.000Z',
                '2026-04-01T00:00:00.000Z'
            ],
            'merge import must sort combined history logs by newest date first'
        );
        assert.ok(
            toasts.some((item) => item.includes('히스토리 저장 완료') || item.includes('병합 가져오기 완료')),
            'history regression should still emit save/import success feedback'
        );
    } finally {
        UIManager.toast = previousToast;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runClearLocalUpdatesReconcileRegression() {
    const previousDocument = globalThis.document;
    const statusText = createField();
    const statusDot = createField({ style: {} });
    const statusEl = {
        querySelector(selector) {
            if (selector === '.text') return statusText;
            if (selector === '.dot') return statusDot;
            return null;
        }
    };

    globalThis.document = createDocumentStub({
        '#syncStatus': statusEl
    });

    try {
        const dm = new DataManager();
        dm.save = () => {};
        dm.state.syncMeta = dm.mergeSyncMeta({
            ...dm.getDefaultSyncMeta(),
            mode: 'custom_proxy',
            currentSource: '정적 JSON + 로컬 업데이트',
            lastSuccessAt: '2026-04-01T00:00:00.000Z',
            lastSuccessDrawNo: 1210
        });
        dm.state.ticketBook = [
            dm.normalizeTicketEntry({
                id: 'ticket_checked_latest',
                numbers: [1, 2, 3, 4, 5, 6],
                targetDrawNo: 1210,
                source: 'import',
                checked: { drawNo: 1210, rank: 1, checkedAt: '2026-04-01T00:00:00.000Z' }
            })
        ].filter(Boolean);
        dm.localUpdatesCache = [{
            draw_no: 1210,
            date: '2026-04-01',
            numbers: [1, 2, 3, 4, 5, 6],
            bonus: 7
        }];
        dm.clearLocalUpdates();
        dm.fetchWithTimeout = async () => ({
            ok: true,
            async json() {
                return {
                    data: [{
                        draw_no: 1209,
                        date: '2026-03-29',
                        numbers: [7, 8, 9, 10, 11, 12],
                        bonus: 13
                    }]
                };
            }
        });

        const loaded = await dm.fetchWinningStats({ notifyTicketSettle: false });
        assert.equal(loaded, true, 'winning stats reload must succeed after clearing local updates');
        assert.equal(dm.state.ticketBook[0].checked, null, 'clearing local updates must reset invalid checked tickets to pending');
        assert.equal(dm.state.syncMeta.lastSuccessDrawNo, 1209, 'sync meta last success draw must clamp to current effective latest draw');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runRequestNumbersRegression() {
    const previousDocument = globalThis.document;
    const list = createField({ innerHTML: '<div>old</div>' });

    globalThis.document = createDocumentStub({
        '#genResultList': list,
        '#toast-container': null
    });

    try {
        const routeCalls = [];
        const ctx = {
            data: {
                state: {
                    generated: [[7, 8, 9, 10, 11, 12]]
                }
            },
            generator: {
                renderResultItem(nums, index, container) {
                    container.innerHTML += `<div class="result-item" data-idx="${index}">${nums.join(',')}</div>`;
                }
            },
            async route(target) {
                routeCalls.push(target);
            }
        };

        await LottoApp.prototype.requestNumbers.call(ctx, [1, 2, 3, 4, 5, 6]);

        assert.deepEqual(routeCalls, ['gen'], 'AI import must route to generator tab');
        assert.deepEqual(ctx.data.state.generated, [[1, 2, 3, 4, 5, 6]], 'AI import must replace generated state');
        assert.ok(!list.innerHTML.includes('old'), 'AI import must clear previous generator DOM rows');
        assert.equal((list.innerHTML.match(/data-idx=/g) || []).length, 1, 'AI import must render a single result row');
        assert.match(list.innerHTML, /1,2,3,4,5,6/, 'AI import must render the incoming numbers');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runTargetDrawAutofillRegression() {
    const previousDocument = globalThis.document;
    const latestDrawNo = createField();
    const latestWinBalls = createField();
    const latestWinMeta = createField();
    const genTarget = createField();
    const campTarget = createField();
    const aiTarget = createField();

    globalThis.document = createDocumentStub({
        '#latestDrawNo': latestDrawNo,
        '#latestWinBalls': latestWinBalls,
        '#latestWinMeta': latestWinMeta,
        '#genTargetDrawNo': genTarget,
        '#campStartDraw': campTarget,
        '#aiTargetDrawNo': aiTarget
    });

    try {
        const ctx = {
            data: {
                state: {
                    winningStats: [{
                        draw_no: 1209,
                        date: '2026-03-07',
                        numbers: [1, 2, 3, 4, 5, 6],
                        bonus: 7,
                        prize_amount: 0,
                        winners_count: 0
                    }]
                }
            },
            targetDrawInputIds: ['genTargetDrawNo', 'campStartDraw', 'aiTargetDrawNo'],
            renderLatestWinPlaceholder: LottoApp.prototype.renderLatestWinPlaceholder,
            getSuggestedNextDrawNo: LottoApp.prototype.getSuggestedNextDrawNo,
            setTargetDrawInputValue: LottoApp.prototype.setTargetDrawInputValue,
            bindTargetDrawInputs: LottoApp.prototype.bindTargetDrawInputs,
            resetTargetDrawInputs: LottoApp.prototype.resetTargetDrawInputs
        };

        LottoApp.prototype.bindTargetDrawInputs.call(ctx);
        LottoApp.prototype.updateLatestWin.call(ctx);
        assert.equal(genTarget.value, '1210', 'initial generator target draw must auto-fill to next draw');
        assert.equal(campTarget.value, '1210', 'initial campaign target draw must auto-fill to next draw');
        assert.equal(aiTarget.value, '1210', 'initial AI target draw must auto-fill to next draw');

        ctx.data.state.winningStats = [{
            draw_no: 1210,
            date: '2026-03-14',
            numbers: [2, 4, 6, 8, 10, 12],
            bonus: 14,
            prize_amount: 0,
            winners_count: 0
        }];
        LottoApp.prototype.updateLatestWin.call(ctx);
        assert.equal(genTarget.value, '1211', 'auto-managed generator target draw must follow latest sync');
        assert.equal(campTarget.value, '1211', 'auto-managed campaign target draw must follow latest sync');
        assert.equal(aiTarget.value, '1211', 'auto-managed AI target draw must follow latest sync');

        genTarget.value = '1300';
        genTarget.dataset.userEdited = 'true';
        ctx.data.state.winningStats = [{
            draw_no: 1211,
            date: '2026-03-21',
            numbers: [3, 6, 9, 12, 15, 18],
            bonus: 21,
            prize_amount: 0,
            winners_count: 0
        }];
        LottoApp.prototype.updateLatestWin.call(ctx);
        assert.equal(genTarget.value, '1300', 'manually edited generator target draw must be preserved');
        assert.equal(campTarget.value, '1212', 'still auto-managed campaign target draw must continue updating');
        assert.equal(aiTarget.value, '1212', 'still auto-managed AI target draw must continue updating');

        const changed = LottoApp.prototype.resetTargetDrawInputs.call(ctx, ['genTargetDrawNo'], { toast: false });
        assert.equal(changed, 1, 'reset action must restore manual target draw to suggested next draw');
        assert.equal(genTarget.value, '1212', 'reset action must restore suggested next draw value');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runLatestWinPlaceholderRegression() {
    const previousDocument = globalThis.document;
    const latestDrawNo = createField();
    const latestWinBalls = createField();
    const latestWinMeta = createField();

    globalThis.document = createDocumentStub({
        '#latestDrawNo': latestDrawNo,
        '#latestWinBalls': latestWinBalls,
        '#latestWinMeta': latestWinMeta
    });

    try {
        const ctx = {
            data: {
                state: {
                    winningStats: []
                }
            },
            renderLatestWinPlaceholder: LottoApp.prototype.renderLatestWinPlaceholder
        };
        LottoApp.prototype.updateLatestWin.call(ctx, { offline: true });
        assert.equal(latestDrawNo.textContent, '오프라인', 'latest draw badge must show offline state');
        assert.match(latestWinBalls.innerHTML, /최신 당첨결과를 불러오지 못했습니다/, 'latest win card must render offline placeholder');
        assert.match(latestWinMeta.innerHTML, /오프라인 상태입니다/, 'latest win card must explain offline placeholder');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runRefreshCurrentRouteStaleRegression() {
    const calls = [];
    let release;
    const pending = new Promise((resolve) => {
        release = resolve;
    });

    const ctx = {
        currentRoute: 'stats',
        routeToken: 3,
        renderSettingsPanel() {
            calls.push('renderSettingsPanel');
        },
        syncRouteDataNotice() {},
        renderRouteDataGate() {
            return false;
        },
        ensureModule(name) {
            calls.push(`ensureModule:${name}`);
            return pending;
        },
        stats: {
            render() {
                calls.push('stats.render');
            }
        },
        renderDataLists() {
            calls.push('renderDataLists');
        },
        check: {
            onEnter() {
                calls.push('check.onEnter');
            }
        },
        backtest: {
            resetUI() {
                calls.push('backtest.resetUI');
            }
        }
    };

    const task = LottoApp.prototype.refreshCurrentRoute.call(ctx);
    ctx.routeToken += 1;
    ctx.currentRoute = 'gen';
    release();
    await task;

    assert.deepEqual(calls, [
        'renderSettingsPanel',
        'ensureModule:stats'
    ], 'refreshCurrentRoute must stop rendering stale route work after route changes');
}

async function runSyncLatestWinRefreshRegression() {
    const previousDocument = globalThis.document;
    globalThis.document = createDocumentStub({
        '#toast-container': null
    });

    try {
        const dm = new DataManager();
        const estNo = estimateLatestDrawKST();
        const calls = [];

        dm.state.winningStats = [{
            draw_no: estNo - 1,
            date: '2026-03-07',
            numbers: [1, 2, 3, 4, 5, 6],
            bonus: 7,
            prize_amount: 0,
            winners_count: 0,
            total_sales: 0
        }];
        dm.resolveProxyConfig = () => ({ source: 'test', url: 'https://proxy.example/proxy/latest' });
        dm.fetchRangeChunkedFromProxy = async () => ({
            items: [{
                draw_no: estNo,
                date: '2026-03-14',
                numbers: [2, 4, 6, 8, 10, 12],
                bonus: 14,
                prize_amount: 0,
                winners_count: 0,
                total_sales: 0
            }],
            missing: new Set(),
            failedDraws: new Set()
        });
        dm.fetchMissingDraws = async () => [];
        dm.getLocalUpdates = () => [];
        dm.setLocalUpdates = (items) => {
            calls.push(`setLocalUpdates:${items.length}`);
            return { items, droppedFuture: 0 };
        };
        dm.fetchWinningStats = async () => {
            calls.push('fetchWinningStats');
            return true;
        };
        dm.app = {
            updateLatestWin() {
                calls.push('updateLatestWin');
            },
            async refreshCurrentRoute() {
                calls.push('refreshCurrentRoute');
            }
        };

        const result = await dm._fetchLatestFromAPIInternal({ trigger: 'manual' }, null);
        assert.equal(result, true, 'sync must succeed in regression scenario');
        assert.deepEqual(calls, [
            'setLocalUpdates:1',
            'fetchWinningStats',
            'updateLatestWin',
            'refreshCurrentRoute'
        ], 'sync success must refresh latest win card before route refresh');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runWinningStatsLoadClassificationRegression() {
    const previousDocument = globalThis.document;
    const statusText = createField();
    const statusDot = createField({ style: {} });
    const statusEl = {
        querySelector(selector) {
            if (selector === '.text') return statusText;
            if (selector === '.dot') return statusDot;
            return null;
        }
    };

    globalThis.document = createDocumentStub({
        '#syncStatus': statusEl
    });

    try {
        const dm = new DataManager();
        dm.fetchWithTimeout = async () => {
            throw new Error('network-timeout');
        };
        dm.app = {
            async isProbablyOffline() {
                return false;
            }
        };

        const result = await dm.fetchWinningStats({ notifyTicketSettle: false });
        assert.equal(result, false, 'winning stats fetch failure must still report false');
        assert.equal(dm.lastWinningStatsLoad.offline, false, 'online fetch failure must not be classified as offline');
        assert.equal(statusText.textContent, '데이터 없음', 'online fetch failure without fallback data must surface data-unavailable state');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runPartialWinningStatsRecoveryRegression() {
    const previousDocument = globalThis.document;
    const statusText = createField();
    const statusDot = createField({ style: {} });
    const statusEl = {
        querySelector(selector) {
            if (selector === '.text') return statusText;
            if (selector === '.dot') return statusDot;
            return null;
        }
    };

    globalThis.document = createDocumentStub({
        '#syncStatus': statusEl
    });

    try {
        const dm = new DataManager();
        dm.save = () => {};
        dm.localUpdatesCache = [{
            draw_no: 1210,
            date: '2026-03-07',
            numbers: [1, 2, 3, 4, 5, 6],
            bonus: 7
        }];
        dm.fetchWithTimeout = async () => {
            throw new Error('network-timeout');
        };

        const result = await dm.fetchWinningStats({ notifyTicketSettle: false });
        assert.equal(result, true, 'local-only winning stats must still hydrate partial recovery state');
        assert.equal(dm.dataHealth.availability, 'partial', 'local-only hydrate must report partial availability');
        assert.equal(dm.dataHealth.source, 'local_only', 'local-only hydrate must report local_only source');
        assert.equal(dm.state.winningStats[0]?.draw_no, 1210, 'local-only hydrate must rebuild winning stats from local updates');
        assert.equal(statusText.textContent, '부분 복구', 'partial recovery must surface a partial-recovery status label');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runLocalRestoreSyncMetaRegression() {
    const previousDocument = globalThis.document;
    const statusText = createField();
    const statusDot = createField({ style: {} });
    const statusEl = {
        querySelector(selector) {
            if (selector === '.text') return statusText;
            if (selector === '.dot') return statusDot;
            return null;
        }
    };

    globalThis.document = createDocumentStub({
        '#syncStatus': statusEl
    });

    try {
        const dm = new DataManager();
        dm.save = () => {};
        dm.fetchWithTimeout = async () => ({
            ok: true,
            async json() {
                return {
                    data: [{
                        draw_no: 1210,
                        date: '2026-03-07',
                        numbers: [1, 2, 3, 4, 5, 6],
                        bonus: 7
                    }]
                };
            }
        });

        const loaded = await dm.fetchWinningStats({ notifyTicketSettle: false });
        assert.equal(loaded, true, 'static winning stats fetch must succeed in local-restore regression');

        dm.markLocalRestoreSuccess({ drawNo: dm.state.winningStats[0]?.draw_no || 0 });

        assert.equal(dm.state.syncMeta.mode, 'local_restore', 'import refresh must mark sync meta as local_restore');
        assert.match(dm.state.syncMeta.currentSource, /로컬 복원/, 'local_restore sync meta must describe the reconstructed source');
        assert.equal(dm.state.syncMeta.lastSuccessDrawNo, 1210, 'local_restore sync meta must reuse effective winningStats draw number');
        assert.ok(dm.state.syncMeta.lastSuccessAt, 'local_restore sync meta must record success time');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runRouteDataGateRegression() {
    const previousDocument = globalThis.document;
    const pages = {};

    const createPage = () => {
        const state = {
            gate: null,
            banner: null
        };
        const header = {
            insertAdjacentElement(_position, element) {
                if (String(element.className || '').includes('data-health-gate')) {
                    state.gate = element;
                }
                if (String(element.className || '').includes('data-health-banner')) {
                    state.banner = element;
                }
                element.remove = () => {
                    if (state.gate === element) state.gate = null;
                    if (state.banner === element) state.banner = null;
                };
            }
        };
        return {
            state,
            classList: {
                values: new Set(),
                add(value) {
                    this.values.add(value);
                },
                remove(value) {
                    this.values.delete(value);
                },
                contains(value) {
                    return this.values.has(value);
                }
            },
            querySelector(selector) {
                if (selector === '.page-header') return header;
                if (selector === '.data-health-gate') return state.gate;
                if (selector === '.data-health-banner') return state.banner;
                return null;
            }
        };
    };

    pages['#page-stats'] = createPage();
    pages['#page-check'] = createPage();

    globalThis.document = {
        querySelector(selector) {
            return pages[selector] || null;
        },
        createElement() {
            return {
                className: '',
                innerHTML: '',
                remove() {}
            };
        }
    };

    try {
        const ctx = {
            data: {
                lastWinningStatsLoad: { updatedAt: '2026-04-07T00:00:00.000Z' },
                state: {
                    winningStats: [{ draw_no: 1210 }]
                },
                getDataFreshness() {
                    return {
                        availability: 'partial',
                        isPartial: true,
                        isUnavailable: false,
                        dataHealthMessage: '정적 JSON을 불러오지 못해 로컬 최신 회차 일부 데이터만 사용 중입니다.'
                    };
                }
            },
            routeRequiresFullData: LottoApp.prototype.routeRequiresFullData,
            getRouteDataHealthCopy: LottoApp.prototype.getRouteDataHealthCopy,
            clearRouteDataGate: LottoApp.prototype.clearRouteDataGate
        };

        const gated = LottoApp.prototype.renderRouteDataGate.call(ctx, 'stats');
        assert.equal(gated, true, 'stats route must render a gate when data availability is partial');
        assert.equal(pages['#page-stats'].classList.contains('route-data-gated'), true, 'gated route must add route-data-gated class');
        assert.match(pages['#page-stats'].state.gate?.innerHTML || '', /다시 동기화/, 'gate panel must expose a resync action');

        LottoApp.prototype.syncRouteDataNotice.call(ctx, 'check');
        assert.match(pages['#page-check'].state.banner?.innerHTML || '', /부분 복구/, 'check route must show a partial-recovery banner');

        ctx.data.getDataFreshness = () => ({
            availability: 'full',
            isPartial: false,
            isUnavailable: false,
            dataHealthMessage: ''
        });

        const cleared = LottoApp.prototype.renderRouteDataGate.call(ctx, 'stats');
        assert.equal(cleared, false, 'stats route gate must clear once full data is restored');
        assert.equal(pages['#page-stats'].classList.contains('route-data-gated'), false, 'full data must remove route-data-gated class');

        LottoApp.prototype.syncRouteDataNotice.call(ctx, 'check');
        assert.equal(pages['#page-check'].state.banner, null, 'full data must remove check-route availability banner');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runSyncInvalidPayloadRegression() {
    const dm = new DataManager();
    const syncLogs = [];
    const uiLogs = [];

    dm.buildCustomSingleFetchUrls = () => [{ label: 'test-proxy', url: 'https://proxy.example/proxy/latest?draw_no=1210' }];
    dm.buildBuiltInSingleFetchUrls = () => [];
    dm.fetchWithTimeout = async () => ({
        ok: true,
        async text() {
            return JSON.stringify({ foo: 'bar', meta: { ok: true } });
        }
    });
    dm.logSync = (code, message, meta = null) => {
        syncLogs.push({ code, message, meta });
    };

    const result = await dm.fetchOneDraw(1210, { url: 'https://proxy.example/proxy/latest' }, (message, code, meta) => {
        uiLogs.push({ message, code, meta });
    });

    assert.equal(result, null, 'unexpected payload shape must not be accepted as draw data');
    assert.ok(
        syncLogs.some((entry) => entry.code === 'SYNC_FETCH_ONE_INVALID_PAYLOAD'),
        'unexpected payload shape must emit a sync diagnostic log'
    );
    assert.ok(
        uiLogs.some((entry) => entry.code === 'SYNC_FETCH_ONE_INVALID_PAYLOAD'),
        'unexpected payload shape must surface through sync log callback'
    );
}

function runBuiltInSyncProviderRegression() {
    const dm = new DataManager();
    const urls = dm.buildBuiltInSingleFetchUrls(1215);

    assert.equal(urls[0]?.label, '공식 API', 'built-in sync must try the official API first');
    assert.match(
        urls[0]?.url || '',
        /https:\/\/www\.dhlottery\.co\.kr\/lt645\/selectPstLt645Info\.do\?srchLtEpsd=1215/,
        'official API candidate must target the requested draw number directly'
    );
    assert.ok(
        urls.some((item) => item.label === 'corsproxy.io'),
        'built-in sync must keep corsproxy.io as a fallback provider'
    );
    assert.ok(
        urls.some((item) => item.label === 'CodeTabs'),
        'built-in sync may still keep CodeTabs as a last fallback provider'
    );

    assert.equal(dm.isAbortError(dm.createAbortError()), true, 'explicit sync abort errors must still be recognized');
    assert.equal(
        dm.isAbortError({ name: 'TypeError', message: 'net::ERR_ABORTED' }),
        false,
        'generic provider failures must not be misclassified as user aborts'
    );
}

async function runImportAlertOptionRegression() {
    const previousDocument = globalThis.document;
    const importMode = createField({ value: 'merge' });
    const importApplyTheme = createField();
    const importApplyProxy = createField();
    const importApplyStrategyPrefs = createField();
    const importApplyAlerts = createField();

    globalThis.document = createDocumentStub({
        '#importMode': importMode,
        '#importApplyTheme': importApplyTheme,
        '#importApplyProxy': importApplyProxy,
        '#importApplyStrategyPrefs': importApplyStrategyPrefs,
        '#importApplyAlerts': importApplyAlerts,
        '#customProxyUrl': createField(),
        '#toast-container': null
    });

    try {
        const payload = {
            version: 3,
            favorites: [],
            history: [],
            ticketBook: [],
            campaigns: [],
            alertPrefs: {
                enableInApp: true,
                enableSystemNotification: true,
                notifyOnNewResult: false
            },
            settings: {
                theme: 'light',
                customProxy: 'https://proxy.example/proxy/latest',
                strategyPrefs: {
                    generator: buildSmokeRequest()
                }
            },
            localUpdates: [],
            strategyPresets: []
        };
        const file = {
            async text() {
                return JSON.stringify(payload);
            }
        };

        const createImportContext = (data) => {
            const ctx = Object.create(DataIOModule.prototype);
            ctx.data = data;
            ctx.app = { applyTheme() {} };
            ctx.syncProxyInput = () => {};
            ctx.refreshPresetSelectors = () => {};
            ctx.runPostImportRefresh = async () => {};
            return ctx;
        };

        const mergeData = new DataManager();
        mergeData.state.alertPrefs = {
            enableInApp: false,
            enableSystemNotification: false,
            notifyOnNewResult: true
        };
        mergeData.save = () => {};
        mergeData.setLocalUpdates = () => ({ items: [], droppedFuture: 0 });
        mergeData.getLocalUpdates = () => [];
        const mergeCtx = createImportContext(mergeData);

        DataIOModule.prototype.applyImportModeDefaults.call(mergeCtx, 'merge');
        assert.equal(importApplyTheme.checked, false, 'merge default must not apply theme');
        assert.equal(importApplyProxy.checked, false, 'merge default must not apply proxy');
        assert.equal(importApplyStrategyPrefs.checked, false, 'merge default must not apply strategy prefs');
        assert.equal(importApplyAlerts.checked, false, 'merge default must not apply alerts');

        await DataIOModule.prototype.importAll.call(mergeCtx, {
            currentTarget: {
                files: [file],
                value: 'merge.json'
            }
        });
        assert.deepEqual(mergeData.state.alertPrefs, {
            enableInApp: false,
            enableSystemNotification: false,
            notifyOnNewResult: true
        }, 'merge import must keep current alert prefs when alerts option is off');

        importMode.value = 'overwrite';
        const overwriteData = new DataManager();
        overwriteData.state.alertPrefs = {
            enableInApp: false,
            enableSystemNotification: false,
            notifyOnNewResult: true
        };
        overwriteData.save = () => {};
        overwriteData.setLocalUpdates = () => ({ items: [], droppedFuture: 0 });
        overwriteData.getLocalUpdates = () => [];
        const overwriteCtx = createImportContext(overwriteData);

        DataIOModule.prototype.applyImportModeDefaults.call(overwriteCtx, 'overwrite');
        assert.equal(importApplyTheme.checked, true, 'overwrite default must apply theme');
        assert.equal(importApplyProxy.checked, true, 'overwrite default must apply proxy');
        assert.equal(importApplyStrategyPrefs.checked, true, 'overwrite default must apply strategy prefs');
        assert.equal(importApplyAlerts.checked, true, 'overwrite default must apply alerts');

        await DataIOModule.prototype.importAll.call(overwriteCtx, {
            currentTarget: {
                files: [file],
                value: 'overwrite.json'
            }
        });
        assert.deepEqual(
            overwriteData.state.alertPrefs,
            overwriteData.mergeAlertPrefs(payload.alertPrefs),
            'overwrite import must apply incoming alert prefs when alerts option is on'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runImportOrphanCampaignCleanupRegression() {
    const previousDocument = globalThis.document;
    const previousToast = UIManager.toast;
    const importMode = createField({ value: 'merge' });
    const importApplyTheme = createField();
    const importApplyProxy = createField();
    const importApplyStrategyPrefs = createField();
    const importApplyAlerts = createField();
    const toasts = [];

    UIManager.toast = (message, type = 'info') => {
        toasts.push(`${type}:${message}`);
    };

    globalThis.document = createDocumentStub({
        '#importMode': importMode,
        '#importApplyTheme': importApplyTheme,
        '#importApplyProxy': importApplyProxy,
        '#importApplyStrategyPrefs': importApplyStrategyPrefs,
        '#importApplyAlerts': importApplyAlerts,
        '#customProxyUrl': createField(),
        '#toast-container': null
    });

    try {
        const payload = {
            version: 3,
            favorites: [],
            history: [],
            ticketBook: [],
            campaigns: [{
                id: 'camp_new',
                name: 'imported campaign',
                startDrawNo: 1210,
                weeks: 1,
                setsPerWeek: 1
            }],
            alertPrefs: {},
            settings: {},
            localUpdates: [],
            strategyPresets: []
        };
        const file = {
            async text() {
                return JSON.stringify(payload);
            }
        };

        const data = new DataManager();
        data.state.ticketBook = [{
            id: 'ticket_existing',
            numbers: [1, 2, 3, 4, 5, 6],
            targetDrawNo: 1210,
            source: 'import',
            campaignId: '',
            strategyRequest: null,
            memo: '',
            createdAt: '2026-03-01T00:00:00.000Z',
            checked: null
        }];
        data.save = () => {};
        data.setLocalUpdates = () => ({ items: [], droppedFuture: 0 });
        data.getLocalUpdates = () => [];

        const ctx = Object.create(DataIOModule.prototype);
        ctx.data = data;
        ctx.app = {
            applyTheme() {},
            renderSettingsPanel() {}
        };
        ctx.syncProxyInput = () => {};
        ctx.refreshPresetSelectors = () => {};
        ctx.runPostImportRefresh = async () => {};

        await DataIOModule.prototype.importAll.call(ctx, {
            currentTarget: {
                files: [file],
                value: 'merge.json'
            }
        });

        assert.equal(data.state.ticketBook.length, 1, 'merge import must preserve existing manual ticket rows');
        assert.equal(data.state.campaigns.length, 0, 'merge import must remove orphan campaigns with no linked tickets');
        assert.ok(
            toasts.some((item) => item.includes('정리 1개 캠페인')),
            'merge import toast must mention orphan campaign cleanup'
        );
    } finally {
        UIManager.toast = previousToast;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runStrategyPresetCrudRegression() {
    const dm = new DataManager();
    dm.save = () => {};

    const baseRequest = buildSmokeRequest();
    const first = dm.saveStrategyPreset('generator', '테스트 프리셋', baseRequest);
    assert.ok(first?.preset, 'preset save must return created preset');
    assert.equal(first.replaced, false, 'first preset save must not report replace');
    assert.equal(dm.getStrategyPresets('generator').length, 1, 'generator scope must contain saved preset');

    const overwrittenRequest = {
        ...baseRequest,
        strategyId: 'cold_frequency',
        params: {
            ...baseRequest.params,
            simulationCount: 9000
        }
    };
    const overwrite = dm.saveStrategyPreset('generator', '테스트 프리셋', overwrittenRequest);
    assert.equal(overwrite.replaced, true, 'preset overwrite must report replace');
    assert.equal(dm.findStrategyPreset('generator', '테스트 프리셋').request.strategyId, 'cold_frequency', 'preset overwrite must update request');

    const secondScope = dm.saveStrategyPreset('ai', 'AI 프리셋', baseRequest);
    assert.ok(secondScope?.preset, 'different scope preset must also save');
    assert.equal(dm.getStrategyPresets('ai').length, 1, 'AI scope must isolate its presets');

    const previousDocument = globalThis.document;
    const fields = {
        '#genSimulationCount': createField(),
        '#genLookbackWindow': createField(),
        '#genSeed': createField(),
        '#genOddMin': createField(),
        '#genOddMax': createField(),
        '#genHighMin': createField(),
        '#genHighMax': createField(),
        '#genSumMin': createField(),
        '#genSumMax': createField(),
        '#genAcMin': createField(),
        '#genAcMax': createField(),
        '#genMaxConsecutive': createField(),
        '#genEndDigitUnique': createField(),
        '#genStrategySelect': createField({
            value: 'ensemble_weighted',
            options: [
                { value: 'ensemble_weighted' },
                { value: 'cold_frequency' }
            ]
        })
    };
    globalThis.document = createDocumentStub(fields);

    try {
        let synced = 0;
        GeneratorModule.prototype.applyStrategyRequest.call({
            syncLegacyTogglesFromStrategy() {
                synced++;
            }
        }, dm.findStrategyPreset('generator', '테스트 프리셋').request);

        assert.equal(fields['#genStrategySelect'].value, 'cold_frequency', 'preset load must update strategy select');
        assert.equal(Number(fields['#genSimulationCount'].value), 9000, 'preset load must apply numeric params');
        assert.equal(Number(fields['#genLookbackWindow'].value), baseRequest.params.lookbackWindow, 'preset load must apply lookback window');
        assert.equal(synced, 1, 'preset load must resync legacy toggles');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }

    const generatorPresetId = dm.findStrategyPreset('generator', '테스트 프리셋').id;
    assert.equal(dm.deleteStrategyPreset(generatorPresetId), true, 'preset delete must succeed');
    assert.equal(dm.getStrategyPresets('generator').length, 0, 'preset delete must remove generator preset');
}

async function runRuntimeAssetLocalizationRegression() {
    const targets = [
        'index.html',
        'assets/app.css',
        'assets/modules/utils/loader.js'
    ];
    for (const target of targets) {
        const text = await readFile(resolve(process.cwd(), target), 'utf8');
        assert.ok(!/cdn\.jsdelivr\.net|unpkg\.com|@import url\(/.test(text), `${target} must not reference runtime CDN assets`);
    }
}

async function runCampaignEmptySaveRegression() {
    const previousDocument = globalThis.document;
    const calls = [];

    globalThis.document = {
        querySelector(selector) {
            if (selector === '#fixedNums' || selector === '#excludeNums') {
                return { value: '' };
            }
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };

    try {
        const ctx = {
            data: {
                state: { winningStats: [] },
                createId(prefix) {
                    return `${prefix}_test`;
                },
                addTicketsBulk() {
                    calls.push('addTicketsBulk');
                    return {
                        insertedRows: 0,
                        incrementedRows: 0,
                        addedQuantity: 0,
                        affectedRows: 0
                    };
                },
                addCampaign() {
                    calls.push('addCampaign');
                    return { id: 'campaign_test' };
                },
                save() {
                    calls.push('save');
                }
            },
            app: {
                data: { state: { winningStats: [] } },
                renderDataLists() {
                    calls.push('renderDataLists');
                }
            },
            workerClient: {
                async generate() {
                    return { sets: [] };
                }
            },
            readNumberInput(id, fallback) {
                const values = {
                    campStartDraw: 1210,
                    campWeeks: 4,
                    campSetsPerWeek: 3
                };
                return values[id] ?? fallback;
            },
            parseInput() {
                return [];
            },
            getStrategyRequestFromUI() {
                return {
                    strategyId: 'ensemble_weighted',
                    params: { simulationCount: 5000, lookbackWindow: 20 },
                    filters: {}
                };
            },
            isWorkerTimeoutError() {
                return false;
            }
        };

        await GeneratorModule.prototype.generateCampaign.call(ctx);

        assert.ok(!calls.includes('addCampaign'), 'campaign must not be saved when no tickets were inserted');
        assert.ok(!calls.includes('renderDataLists'), 'empty campaign must not trigger rerender');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runQrScanReentryGuardRegression() {
    const previousDocument = globalThis.document;
    const calls = [];

    globalThis.document = {
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };

    try {
        const ctx = {
            isHandlingSuccess: false,
            parseLottoQr() {
                calls.push('parse');
                return [{ targetDrawNo: 861, numbers: [1, 2, 3, 4, 5, 6] }];
            },
            async stop() {
                calls.push('stop');
                await new Promise((resolve) => setTimeout(resolve, 30));
            },
            app: {
                async route(target) {
                    calls.push(`route:${target}`);
                },
                check: {
                    setScannedNumbers(items) {
                        calls.push(`set:${items.length}`);
                    }
                }
            }
        };

        await Promise.all([
            QrScannerModule.prototype.onScanSuccess.call(ctx, 'qr'),
            QrScannerModule.prototype.onScanSuccess.call(ctx, 'qr')
        ]);

        assert.equal(calls.filter((x) => x === 'parse').length, 1, 'QR success handler must parse only once while busy');
        assert.equal(calls.filter((x) => x === 'stop').length, 1, 'QR success handler must stop scanner only once');
        assert.equal(calls.filter((x) => x === 'route:check').length, 1, 'QR success handler must route only once');
        assert.equal(calls.filter((x) => x === 'set:1').length, 1, 'QR success handler must set scanned numbers only once');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runQrRouteCleanupRegression() {
    const previousDocument = globalThis.document;
    const genPage = createField();
    genPage.classList = { add() {}, remove() {} };

    globalThis.document = createDocumentStub({
        '#page-gen': genPage
    });

    try {
        const calls = [];
        const ctx = {
            routeToken: 0,
            currentRoute: 'check',
            navItems: [],
            pageItems: [],
            navByTarget: new Map(),
            syncRouteDataNotice() {},
            renderRouteDataGate() {
                return false;
            },
            qr: {
                async stop() {
                    calls.push('qr.stop');
                }
            },
            updateLatestWin() {
                calls.push('updateLatestWin');
            }
        };

        await LottoApp.prototype.route.call(ctx, 'gen');
        assert.deepEqual(calls, ['qr.stop', 'updateLatestWin'], 'leaving check route must stop QR scanner before rendering next route');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
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
        state: {
            winningStats: [{ draw_no: 1211 }]
        },
        async fetchWinningStats(options) {
            calls.push(`fetchWinningStats:${JSON.stringify(options)}`);
        },
        markLocalRestoreSuccess(options) {
            calls.push(`markLocalRestoreSuccess:${JSON.stringify(options)}`);
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
        'markLocalRestoreSuccess:{"drawNo":1211}',
        'updateLatestWin',
        'refreshCurrentRoute',
        'renderDataLists'
    ], 'post-import refresh order must be preserved');
}

async function runAutoSyncFallbackRegression() {
    const previousDocument = globalThis.document;
    const dm = new DataManager();
    const est = estimateLatestDrawKST();
    dm.save = () => {};
    dm.state.winningStats = [{
        draw_no: Math.max(1, est - 2),
        date: '2026-03-07',
        numbers: [1, 2, 3, 4, 5, 6],
        bonus: 7
    }];
    dm.state.staticLatestDrawNo = dm.state.winningStats[0].draw_no;

    let rangeCalls = 0;
    let fallbackCalls = 0;
    dm.fetchRangeChunkedFromProxy = async () => {
        rangeCalls++;
        return { items: [], missing: [], failedDraws: [] };
    };
    dm.fetchMissingDraws = async () => {
        fallbackCalls++;
        return [];
    };

    globalThis.document = {
        querySelector(selector) {
            if (selector === '#customProxyUrl') return { value: '' };
            return null;
        }
    };

    try {
        const result = await dm._fetchLatestFromAPIInternal({ trigger: 'manual', silent: true }, null);
        assert.equal(result, false, 'manual sync must fail explicitly when automatic fallback sources return no data');
        assert.equal(rangeCalls, 1, 'range sync path must still run without configured custom proxy');
        assert.equal(fallbackCalls, 1, 'fallback single-draw sync must run without configured custom proxy');
        assert.equal(dm.state.syncMeta.mode, 'automatic_fallback', 'sync meta mode must reflect automatic fallback mode');
        assert.equal(dm.state.syncMeta.currentSource, '기본 자동 동기화', 'sync meta source must reflect automatic fallback source');
        assert.match(dm.state.syncMeta.lastFailureMessage, /최신 회차/, 'sync meta must explain automatic sync failure reason');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runOfflineProbeRecoveryRegression() {
    const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const previousFetch = globalThis.fetch;
    const previousWindow = globalThis.window;

    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { onLine: false }
    });
    globalThis.window = {
        location: {
            href: 'https://twbeatles.github.io/lotto---webapp/index.html'
        }
    };

    const fetchCalls = [];
    globalThis.fetch = async (url) => {
        fetchCalls.push(String(url));
        return {
            ok: true,
            headers: {
                get() {
                    return '';
                }
            }
        };
    };

    try {
        const app = new LottoApp();
        app.data.state.customProxy = 'https://proxy.example/proxy/latest';

        const offline = await app.isProbablyOffline({ forceProbe: true });
        assert.equal(offline, false, 'successful reachability probe must override false navigator.onLine state');
        assert.ok(fetchCalls.length >= 1, 'offline probe must issue a network reachability request');
        assert.match(fetchCalls[0], /manifest\.json\?__online_check=/, 'offline probe must prefer same-origin probe URL first');
    } finally {
        if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
        else delete globalThis.navigator;
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        globalThis.fetch = previousFetch;
    }
}

async function runBackgroundAutoSyncRegression() {
    const app = new LottoApp();
    const calls = [];

    app.data.fetchLatestFromAPI = async (options) => {
        calls.push(options);
        return true;
    };
    app.isProbablyOffline = async () => false;

    await app.runAutoSync({ reason: 'proxy-bootstrap', force: true });
    assert.deepEqual(calls, [
        { silent: true, trigger: 'auto', reason: 'proxy-bootstrap' }
    ], 'auto sync runner must dispatch a silent auto-triggered sync');

    app._lastAutoSyncAt = Date.now();
    await app.runAutoSync({ reason: 'resume' });
    assert.equal(calls.length, 1, 'background auto sync must throttle repeated resume checks');

    app.isProbablyOffline = async () => true;
    await app.runAutoSync({ reason: 'online', force: true });
    assert.equal(calls.length, 1, 'background auto sync must skip dispatch while offline');
}

function runPersistenceFlushRegression() {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const windowListeners = new Map();
    const documentListeners = new Map();
    const saveCalls = [];

    globalThis.window = {
        addEventListener(type, handler) {
            windowListeners.set(type, handler);
        }
    };
    globalThis.document = {
        visibilityState: 'visible',
        addEventListener(type, handler) {
            documentListeners.set(type, handler);
        }
    };

    try {
        LottoApp.prototype.bindPersistenceEvents.call({
            data: {
                save(immediate) {
                    saveCalls.push(immediate);
                }
            }
        });

        windowListeners.get('pagehide')?.();
        globalThis.document.visibilityState = 'hidden';
        documentListeners.get('visibilitychange')?.();

        assert.deepEqual(saveCalls, [true, true], 'pagehide/visibilitychange must flush save(true)');
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;

        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runNotificationPermissionRegression() {
    const previousToast = UIManager.toast;
    const toasts = [];
    UIManager.toast = (message, type = 'info') => {
        toasts.push(`${type}:${message}`);
    };

    try {
        const deniedCalls = [];
        await LottoApp.prototype.handleSystemNotificationToggle.call({
            data: {
                async requestNotificationPermission() {
                    deniedCalls.push('request');
                    return { code: 'denied', label: '차단됨' };
                },
                setAlertPrefs(next) {
                    deniedCalls.push(`set:${JSON.stringify(next)}`);
                }
            },
            renderDataLists() {
                deniedCalls.push('render');
            }
        }, true);

        assert.deepEqual(deniedCalls, [
            'request',
            'set:{"enableSystemNotification":false}',
            'render'
        ], 'denied notification permission must revert the toggle state');
        assert.ok(toasts.some((item) => item.startsWith('info:')), 'denied flow must show 안내 toast');

        toasts.length = 0;
        const grantedCalls = [];
        await LottoApp.prototype.handleSystemNotificationToggle.call({
            data: {
                async requestNotificationPermission() {
                    grantedCalls.push('request');
                    return { code: 'granted', label: '허용됨' };
                },
                setAlertPrefs(next) {
                    grantedCalls.push(`set:${JSON.stringify(next)}`);
                }
            },
            renderDataLists() {
                grantedCalls.push('render');
            }
        }, true);

        assert.deepEqual(grantedCalls, [
            'request',
            'set:{"enableSystemNotification":true}',
            'render'
        ], 'granted notification permission must keep system notifications enabled');
        assert.ok(toasts.some((item) => item.startsWith('success:')), 'granted flow must show success toast');
    } finally {
        UIManager.toast = previousToast;
    }
}

function runDataListPaginationRegression() {
    const ctx = {
        dataListPageSize: 20,
        dataListState: {
            ticket: { query: '', page: 3 }
        },
        getDataListState: LottoApp.prototype.getDataListState
    };
    const items = Array.from({ length: 55 }, (_, idx) => idx + 1);
    const page = LottoApp.prototype.paginateItems.call(ctx, 'ticket', items);
    assert.equal(page.page, 3, 'existing page must be preserved when in range');
    assert.equal(page.items.length, 15, 'last page must render only remaining items');
    assert.equal(page.items[0], 41, 'last page must start from the correct offset');

    LottoApp.prototype.setDataListQuery.call(ctx, 'ticket', '1210');
    assert.equal(ctx.dataListState.ticket.page, 1, 'changing search query must reset the page to 1');
}

function runDataListDomRegression() {
    const previousDocument = globalThis.document;
    const favSearch = createField();
    const historySearch = createField();
    const ticketSearch = createField();
    const campaignSearch = createField();
    const favList = createField();
    const historyList = createField();
    const ticketList = createField();
    const campaignList = createField();
    const favPagination = createField();
    const historyPagination = createField();
    const ticketPagination = createField();
    const campaignPagination = createField();
    const ticketFilter = createField({ value: 'all' });
    const localUpdatesSummary = createField();
    const localUpdatesMeta = createField();
    const clearLocalUpdatesBtn = createField();

    globalThis.document = createDocumentStub({
        '#favSearch': favSearch,
        '#historySearch': historySearch,
        '#ticketSearch': ticketSearch,
        '#campaignSearch': campaignSearch,
        '#favList': favList,
        '#historyList': historyList,
        '#ticketList': ticketList,
        '#campaignList': campaignList,
        '#favPagination': favPagination,
        '#historyPagination': historyPagination,
        '#ticketPagination': ticketPagination,
        '#campaignPagination': campaignPagination,
        '#ticketFilter': ticketFilter,
        '#localUpdatesSummary': localUpdatesSummary,
        '#localUpdatesMeta': localUpdatesMeta,
        '#clearLocalUpdatesBtn': clearLocalUpdatesBtn
    });

    try {
        const ctx = {
            data: {
                state: {
                    favorites: Array.from({ length: 25 }, (_, idx) => ({
                        numbers: [1, 2, 3, 4, 5, idx + 6],
                        date: `2026-03-${String((idx % 25) + 1).padStart(2, '0')}T00:00:00.000Z`
                    })),
                    history: [
                        { numbers: [6, 7, 8, 9, 10, 11], date: '2026-02-01T00:00:00.000Z' }
                    ],
                    ticketBook: [
                        { id: 'ticket<&"\'', numbers: [1, 2, 3, 4, 5, 6], targetDrawNo: 1210, checked: null, quantity: 2 }
                    ],
                    campaigns: [
                        { id: 'campaign_1', name: '테스트 캠페인', startDrawNo: 1210, weeks: 4, setsPerWeek: 3 }
                    ]
                },
                getTicketQuantity(ticket) {
                    return Number(ticket?.quantity || 1);
                },
                getTotalTicketCount(tickets = []) {
                    return (tickets || []).reduce((sum, ticket) => sum + Number(ticket?.quantity || 1), 0);
                },
                getLocalUpdates() {
                    return [{ draw_no: 1211 }];
                }
            },
            dateFormatter: new Intl.DateTimeFormat('ko-KR'),
            dataListPageSize: 20,
            dataListState: {
                fav: { query: '2026-03-10', page: 1 },
                history: { query: '', page: 1 },
                ticket: { query: '', page: 1 },
                campaign: { query: '', page: 1 }
            },
            renderSettingsPanel() {},
            escapeHtml: LottoApp.prototype.escapeHtml,
            getDataListState: LottoApp.prototype.getDataListState,
            matchesSearch: LottoApp.prototype.matchesSearch,
            paginateItems: LottoApp.prototype.paginateItems,
            renderPagination: LottoApp.prototype.renderPagination,
            getTicketStatusMeta: LottoApp.prototype.getTicketStatusMeta,
            formatDate: LottoApp.prototype.formatDate
        };

        LottoApp.prototype.renderDataLists.call(ctx);

        assert.equal(favSearch.value, '2026-03-10', 'favorite search input must reflect list state');
        assert.match(favList.innerHTML, /data-raw-index="/, 'favorite rows must keep raw index for delegated actions');
        assert.ok(!favList.innerHTML.includes('2026. 3. 11.'), 'favorite search must filter out unmatched rows');
        assert.match(favPagination.innerHTML, /총 1개/, 'favorite pagination summary must render');
        assert.match(favPagination.innerHTML, /1 \/ 1/, 'favorite pagination page text must render');
        assert.match(ticketList.innerHTML, /data-id="ticket&lt;&amp;&quot;&#39;"/, 'ticket data-id must be HTML-escaped');
        assert.match(ticketList.innerHTML, /x2/, 'ticket list must render grouped quantity badge');
        assert.match(ticketPagination.innerHTML, /총 2개 티켓/, 'ticket pagination summary must use physical ticket count');
        assert.match(localUpdatesSummary.textContent, /1개/, 'local updates summary must reflect stored local update count');
        assert.match(localUpdatesMeta.textContent, /1211회/, 'local updates meta must show latest local draw number');
        assert.equal(clearLocalUpdatesBtn.disabled, false, 'local updates clear button must be enabled when updates exist');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runProxyPolicyRegression() {
    const dm = new DataManager();

    const supported = dm.validateCustomProxyUrl('https://worker.example/proxy/latest?foo=1');
    assert.equal(supported.valid, true, 'official /proxy/latest proxy must be supported');
    assert.equal(supported.normalizedUrl, 'https://worker.example/proxy/latest?foo=1', 'supported proxy must be normalized');

    const prefixStyle = dm.validateCustomProxyUrl('https://worker.example/?url=');
    assert.equal(prefixStyle.valid, false, 'generic ?url= proxy must no longer be supported');

    dm.state.customProxy = 'https://worker.example/{url}';
    const resolved = dm.resolveProxyConfig();
    assert.equal(resolved.invalid, true, 'unsupported stored proxy must be marked invalid');
    assert.equal(resolved.url, '', 'unsupported stored proxy must not be used at runtime');
    assert.equal(dm.getSyncMode(resolved), 'automatic_fallback', 'unsupported proxy must fall back to automatic sync mode');
    assert.equal(dm.getSyncSourceLabel(resolved), '기본 자동 동기화', 'unsupported proxy must report automatic sync source');
}

async function runServiceWorkerReloadPolicyRegression() {
    const pwaSource = await readFile(resolve(process.cwd(), 'assets/modules/bootstrap/pwa.js'), 'utf8');
    assert.match(pwaSource, /let reloadOnControllerChange = false;/, 'SW script must gate reloads behind explicit update acceptance');
    assert.match(
        pwaSource,
        /navigator\.serviceWorker\.register\('sw\.js', \{ updateViaCache: 'none' \}\)/,
        'SW registration must bypass stale HTTP cache when checking for updates'
    );
    assert.match(pwaSource, /reloadOnControllerChange = true;/, 'update acceptance must arm controllerchange reload');
    assert.match(pwaSource, /if \(refreshing \|\| !reloadOnControllerChange\) return;/, 'controllerchange must ignore first-install activation');
    assert.match(
        pwaSource,
        /if \(e\.data\?\.type === 'SW_ACTIVATED' && e\.data\?\.senderId !== channelClientId\)/,
        'remote tabs must reload only after activation-complete broadcast from another tab'
    );
    assert.match(
        pwaSource,
        /updateChannel\?\.postMessage\(\{ type: 'SW_ACTIVATED', senderId: channelClientId \}\);/,
        'activation-complete broadcast must happen after controllerchange'
    );
    assert.doesNotMatch(pwaSource, /SW_UPDATED/, 'legacy immediate reload broadcast must be removed');
    assert.match(pwaSource, /if \(reg\.waiting && navigator\.serviceWorker\.controller\) \{\s*showUpdateToast\(reg\.waiting\);/m, 'existing waiting SW must surface the update toast immediately');
    assert.match(pwaSource, /reg\.update\(\)\.catch\(\(\) => \{\}\);/, 'registration flow must proactively check for a newer SW script');
}

async function runServiceWorkerCoreDataPrecacheRegression() {
    const swSource = await readFile(resolve(process.cwd(), 'sw.js'), 'utf8');
    assert.match(swSource, /const CACHE_VERSION = 'v17';/, 'service worker cache version must be bumped');
    assert.match(swSource, /const DATA_CORE_ASSETS = \[/, 'service worker must define core data precache assets');
    assert.match(swSource, /\.\/data\/winning_stats\.json/, 'winning_stats.json must be precached during install');
    assert.match(swSource, /const dataCache = await caches\.open\(CACHE_DATA\);/, 'data cache must be opened during install precache');
    assert.match(swSource, /networkFirstWithTimeout\(event\.request, CACHE_DATA, 5000\)/, 'data cache must allow a longer mobile timeout before offline fallback');
    assert.match(swSource, /function isAppShellCodeRequest\(request, url\)/, 'service worker must classify JS/CSS/font assets separately');
    assert.match(swSource, /networkFirstWithTimeout\(event\.request, CACHE_APP_SHELL, 3500\)/, 'app-shell code assets must prefer network-first delivery');
    assert.doesNotMatch(swSource, /__network_probe/, 'service worker must not special-case the deprecated probe route anymore');
}

async function runHiddenAttributeStyleRegression() {
    const layoutSource = await readFile(resolve(process.cwd(), 'assets/styles/layout.css'), 'utf8');
    const htmlSource = await readFile(resolve(process.cwd(), 'index.html'), 'utf8');
    assert.match(
        layoutSource,
        /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/,
        'hidden elements must stay visually hidden even when inline styles set display'
    );
    assert.match(
        htmlSource,
        /<div id="offlineBanner" hidden aria-hidden="true"/,
        'offline banner must still default to the hidden state in markup'
    );
}

async function runLocalFontPathRegression() {
    const tokensSource = await readFile(resolve(process.cwd(), 'assets/styles/tokens.css'), 'utf8');
    assert.match(
        tokensSource,
        /src:\s*url\('\.\.\/vendor\/pretendard\/PretendardVariable\.woff2'\)/,
        'Pretendard font path must stay relative to the deployed assets/styles directory'
    );
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

export {
    runBacktestSmoke,
    runStrictFilterRegression,
    runWheelFixedNumbersRegression,
    runDrawNormalizationRegression,
    runCampaignLimitRegression,
    runQrValidationRegression,
    runTicketDedupeRegression,
    runTicketQuantityGroupingRegression,
    runImmediateTicketSettlementRegression,
    runTicketReconcileRegression,
    runCampaignResetAutofillRecoveryRegression,
    runCampaignCascadeRegression,
    runOrphanCampaignAutoCleanupRegression,
    runCheckTargetDrawRegression,
    runStoredListNormalizationRegression,
    runLocalUpdatesFutureGuardRegression,
    runHistoryActualLogRegression,
    runClearLocalUpdatesReconcileRegression,
    runRequestNumbersRegression,
    runTargetDrawAutofillRegression,
    runLatestWinPlaceholderRegression,
    runRefreshCurrentRouteStaleRegression,
    runSyncLatestWinRefreshRegression,
    runWinningStatsLoadClassificationRegression,
    runPartialWinningStatsRecoveryRegression,
    runLocalRestoreSyncMetaRegression,
    runRouteDataGateRegression,
    runSyncInvalidPayloadRegression,
    runBuiltInSyncProviderRegression,
    runImportAlertOptionRegression,
    runImportOrphanCampaignCleanupRegression,
    runStrategyPresetCrudRegression,
    runRuntimeAssetLocalizationRegression,
    runCampaignEmptySaveRegression,
    runQrScanReentryGuardRegression,
    runQrRouteCleanupRegression,
    runSyncGuardRegression,
    runPostImportRefreshRegression,
    runAutoSyncFallbackRegression,
    runOfflineProbeRecoveryRegression,
    runBackgroundAutoSyncRegression,
    runPersistenceFlushRegression,
    runNotificationPermissionRegression,
    runDataListPaginationRegression,
    runDataListDomRegression,
    runProxyPolicyRegression,
    runServiceWorkerReloadPolicyRegression,
    runServiceWorkerCoreDataPrecacheRegression,
    runHiddenAttributeStyleRegression,
    runLocalFontPathRegression,
    runBackupSmoke
};
