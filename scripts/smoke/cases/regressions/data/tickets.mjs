/* eslint-disable no-unused-vars */
import {
    assert,
    buildBackupPayload,
    buildSmokeRequest,
    CheckModule,
    CONFIG,
    createDocumentStub,
    createField,
    DataIOModule,
    DataManager,
    estimateLatestDrawKST,
    GeneratorModule,
    LottoApp,
    normalizeBackupPayload,
    runPostImportRefresh,
    UIManager
} from '../support.mjs';

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

    const keyA = dm.buildTicketKey({
        ...base,

        strategyRequest: strategyRequestA
    });

    const keyB = dm.buildTicketKey({
        ...base,

        strategyRequest: strategyRequestB
    });

    assert.equal(keyA, keyB, 'ticket dedupe key must be stable across key order differences');

    const campaignKeyA = dm.buildTicketKey({
        ...base,

        campaignId: 'camp_a',

        strategyRequest: strategyRequestA
    });

    const campaignKeyB = dm.buildTicketKey({
        ...base,

        campaignId: 'camp_b',

        strategyRequest: strategyRequestA
    });

    assert.notEqual(campaignKeyA, campaignKeyB, 'campaignId must participate in ticket dedupe key');
}

function runTicketQuantityGroupingRegression() {
    const dm = new DataManager();

    dm.save = () => {};

    const first = dm.addTicket([1, 2, 3, 4, 5, 6], {
        source: 'generator',

        targetDrawNo: 1210,

        strategyRequest: {
            strategyId: 'ensemble_weighted',

            params: {},

            filters: {}
        }
    });

    const second = dm.addTicket([1, 2, 3, 4, 5, 6], {
        source: 'generator',

        targetDrawNo: 1210,

        strategyRequest: {
            strategyId: 'ensemble_weighted',

            params: {},

            filters: {}
        }
    });

    assert.equal(first?.inserted, true, 'first addTicket call must insert a row');

    assert.equal(second?.incremented, true, 'duplicate addTicket call must increase quantity');

    assert.equal(dm.state.ticketBook.length, 1, 'duplicate single-ticket adds must keep one grouped row');

    assert.equal(dm.state.ticketBook[0].quantity, 2, 'duplicate single-ticket adds must increase quantity');

    const bulk = dm.addTicketsBulk(
        [
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
        ],

        { silent: true }
    );

    assert.equal(bulk.insertedRows, 2, 'bulk add must keep separate rows when campaignId differs');

    assert.equal(bulk.incrementedRows, 1, 'bulk add must merge duplicate rows within the same campaign');

    assert.equal(bulk.addedQuantity, 3, 'bulk add must count physical ticket quantity');

    assert.equal(dm.countTicketsByCampaignId('camp_a'), 2, 'campaign ticket count must use physical ticket quantity');

    assert.equal(
        dm.countTicketsByCampaignId('camp_b'),

        1,

        'campaign ticket count must preserve separate campaign rows'
    );

    const campATicket = dm.state.ticketBook.find((ticket) => ticket.campaignId === 'camp_a');

    assert.equal(campATicket?.quantity, 2, 'same-campaign duplicate tickets must merge into one grouped row');

    const removed = dm.removeTicket(campATicket?.id);

    assert.equal(removed.removedTickets, 2, 'ticket delete must remove the full grouped quantity at once');
}

function runImmediateTicketSettlementRegression() {
    const dm = new DataManager();

    dm.save = () => {};

    dm.state.winningStats = [
        {
            draw_no: 1209,

            date: '2026-03-07',

            numbers: [1, 2, 3, 4, 5, 6],

            bonus: 7
        }
    ];

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

    const inserted = dm.addTicketsBulk(
        [
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
        ],

        { silent: true }
    );

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

    dm.state.winningStats = [
        {
            draw_no: 1209,

            date: '2026-03-07',

            numbers: [7, 8, 9, 10, 11, 12],

            bonus: 13
        }
    ];

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
                    winningStats: [
                        {
                            draw_no: 1209,

                            date: '2026-03-07',

                            numbers: [1, 2, 3, 4, 5, 6],

                            bonus: 7
                        }
                    ]
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

        assert.match(
            area.innerHTML,

            /1210회 결과 데이터가 없습니다/,

            'missing target draw must show unavailable state'
        );

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
        [
            CONFIG.KEYS.FAV,

            JSON.stringify([{ numbers: [6, 5, 4, 3, 2, 1], date: '2026-03-01T00:00:00.000Z' }, { foo: 'bar' }])
        ],

        [CONFIG.KEYS.HIST, JSON.stringify([{ numbers: 'oops' }])],

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

        assert.deepEqual(
            dm.state.favorites,

            [
                {
                    numbers: [1, 2, 3, 4, 5, 6],

                    date: '2026-03-01T00:00:00.000Z'
                }
            ],

            'favorites must be normalized during load'
        );

        assert.deepEqual(dm.state.history, [], 'invalid history entries must be dropped during load');

        assert.deepEqual(
            JSON.parse(store.get(CONFIG.KEYS.FAV)),

            dm.state.favorites,

            'normalized favorites must be persisted back'
        );

        assert.deepEqual(JSON.parse(store.get(CONFIG.KEYS.HIST)), [], 'normalized history must be persisted back');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;

        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
}

function runImportStoredListStrictNormalizationRegression() {
    const data = new DataManager();

    const ctx = Object.create(DataIOModule.prototype);

    ctx.data = data;

    const normalized = DataIOModule.prototype.normalizeItems.call(ctx, [
        { numbers: [1, 2, 3, 4, 5, 6], date: '2026-04-01T00:00:00.000Z' },

        { numbers: [1.5, 2, 3, 4, 5, 6], date: '2026-04-01T00:00:00.000Z' },

        { numbers: [1, 1, 2, 3, 4, 5], date: '2026-04-01T00:00:00.000Z' },

        { numbers: [1, 2, 3, 4, 5, 46], date: '2026-04-01T00:00:00.000Z' },

        { numbers: [6, 5, 4, 3, 2, 1], date: 'not-a-date' }
    ]);

    assert.equal(
        normalized.length,

        2,

        'import list normalization must reject decimal, duplicate, and out-of-range numbers'
    );

    assert.deepEqual(normalized[0].numbers, [1, 2, 3, 4, 5, 6], 'valid imported list item must be normalized');

    assert.deepEqual(
        normalized[1].numbers,

        [1, 2, 3, 4, 5, 6],

        'valid numbers with invalid date must still normalize numbers'
    );

    assert.notEqual(normalized[1].date, 'not-a-date', 'invalid import dates must be replaced with a valid timestamp');
}

function runCleanupStoredRecordsRegression() {
    const dm = new DataManager();

    dm.save = () => {};

    dm.state.history = Array.from({ length: 205 }, (_, index) => ({
        numbers: [1, 2, 3, 4, 5, 6],

        date: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
    }));

    dm.state.ticketBook = [
        dm.normalizeTicketEntry({
            id: 'pending_ticket',

            numbers: [1, 2, 3, 4, 5, 6],

            targetDrawNo: 1300,

            source: 'import'
        }),

        dm.normalizeTicketEntry({
            id: 'winning_ticket',

            numbers: [7, 8, 9, 10, 11, 12],

            targetDrawNo: 1200,

            source: 'import',

            campaignId: 'camp_keep',

            checked: { drawNo: 1200, rank: 5, checkedAt: '2026-04-01T00:00:00.000Z' }
        }),

        dm.normalizeTicketEntry({
            id: 'loss_ticket',

            numbers: [13, 14, 15, 16, 17, 18],

            targetDrawNo: 1200,

            source: 'import',

            campaignId: 'camp_drop',

            quantity: 3,

            checked: { drawNo: 1200, rank: 0, checkedAt: '2026-04-01T00:00:00.000Z' }
        })
    ].filter(Boolean);

    dm.state.campaigns = [
        dm.normalizeCampaignEntry({ id: 'camp_keep', name: 'keep', startDrawNo: 1200, weeks: 1, setsPerWeek: 1 }),

        dm.normalizeCampaignEntry({ id: 'camp_drop', name: 'drop', startDrawNo: 1200, weeks: 1, setsPerWeek: 1 })
    ].filter(Boolean);

    const result = dm.cleanupStoredRecords({ keepHistory: 200, removeSettledLosses: true });

    assert.equal(result.historyTrimmed, 5, 'cleanup must trim history beyond the configured keep count');

    assert.equal(result.removedTickets, 3, 'cleanup must remove only settled losing ticket quantities');

    assert.equal(result.removedCampaigns, 1, 'cleanup must prune campaigns orphaned by losing-ticket cleanup');

    assert.equal(dm.state.history.length, 200, 'cleanup must leave exactly the requested history count');

    assert.deepEqual(
        dm.state.ticketBook.map((ticket) => ticket.id),

        ['pending_ticket', 'winning_ticket'],

        'cleanup must preserve pending and winning tickets'
    );

    assert.deepEqual(
        dm.state.campaigns.map((campaign) => campaign.id),

        ['camp_keep'],

        'cleanup must preserve campaigns with remaining tickets'
    );
}

export {
    runTicketDedupeRegression,
    runTicketQuantityGroupingRegression,
    runImmediateTicketSettlementRegression,
    runTicketReconcileRegression,
    runCheckTargetDrawRegression,
    runStoredListNormalizationRegression,
    runImportStoredListStrictNormalizationRegression,
    runCleanupStoredRecordsRegression
};
