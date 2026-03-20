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
        };
        dm.fetchWinningStats = async () => {
            calls.push('fetchWinningStats');
            return true;
        };
        dm.settlePendingTickets = async () => {
            calls.push('settlePendingTickets');
            return { settled: 0, wins: 0, latestDrawNo: estNo };
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
            'settlePendingTickets',
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
        assert.equal(statusText.textContent, '데이터 확인 실패', 'status text must not show offline for online fetch failures');
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
        mergeData.setLocalUpdates = () => {};
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
        overwriteData.setLocalUpdates = () => {};
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
                    return 0;
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
                        { id: 'ticket<&"\'', numbers: [1, 2, 3, 4, 5, 6], targetDrawNo: 1210, checked: null }
                    ],
                    campaigns: [
                        { id: 'campaign_1', name: '테스트 캠페인', startDrawNo: 1210, weeks: 4, setsPerWeek: 3 }
                    ]
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
}

async function runServiceWorkerCoreDataPrecacheRegression() {
    const swSource = await readFile(resolve(process.cwd(), 'sw.js'), 'utf8');
    assert.match(swSource, /const CACHE_VERSION = 'v17';/, 'service worker cache version must be bumped');
    assert.match(swSource, /const DATA_CORE_ASSETS = \[/, 'service worker must define core data precache assets');
    assert.match(swSource, /\.\/data\/winning_stats\.json/, 'winning_stats.json must be precached during install');
    assert.match(swSource, /const dataCache = await caches\.open\(CACHE_DATA\);/, 'data cache must be opened during install precache');
    assert.match(swSource, /networkFirstWithTimeout\(event\.request, CACHE_DATA, 5000\)/, 'data cache must allow a longer mobile timeout before offline fallback');
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
    runCampaignCascadeRegression,
    runCheckTargetDrawRegression,
    runStoredListNormalizationRegression,
    runRequestNumbersRegression,
    runTargetDrawAutofillRegression,
    runLatestWinPlaceholderRegression,
    runRefreshCurrentRouteStaleRegression,
    runSyncLatestWinRefreshRegression,
    runWinningStatsLoadClassificationRegression,
    runSyncInvalidPayloadRegression,
    runBuiltInSyncProviderRegression,
    runImportAlertOptionRegression,
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
