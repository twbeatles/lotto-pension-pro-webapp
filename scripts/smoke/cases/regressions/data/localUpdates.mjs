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

function runOrphanCampaignAutoCleanupRegression() {
    const single = new DataManager();

    single.save = () => {};

    single.markDirty = () => {};

    single.state.campaigns = [
        {
            id: 'camp_single',

            name: 'Single',

            startDrawNo: 1210,

            weeks: 1,

            setsPerWeek: 1
        }
    ];

    single.state.ticketBook = [
        {
            id: 'ticket_single',

            campaignId: 'camp_single',

            numbers: [1, 2, 3, 4, 5, 6],

            targetDrawNo: 1210
        }
    ];

    const singleResult = single.removeTicket('ticket_single');

    assert.equal(singleResult.removed, true, 'single ticket delete must report success');

    assert.equal(singleResult.prunedCampaigns, 1, 'single ticket delete must auto-prune orphan campaign');

    assert.equal(single.state.campaigns.length, 0, 'single ticket delete must remove orphan campaign');

    const bulk = new DataManager();

    bulk.save = () => {};

    bulk.markDirty = () => {};

    bulk.state.campaigns = [
        {
            id: 'camp_bulk',

            name: 'Bulk',

            startDrawNo: 1211,

            weeks: 1,

            setsPerWeek: 1
        }
    ];

    bulk.state.ticketBook = [
        {
            id: 'ticket_bulk',

            campaignId: 'camp_bulk',

            numbers: [1, 2, 3, 4, 5, 6],

            targetDrawNo: 1211
        }
    ];

    const bulkResult = bulk.clearTicketBook('all');

    assert.equal(bulkResult.removedTickets, 1, 'bulk ticket clear must remove matching tickets');

    assert.equal(bulkResult.prunedCampaigns, 1, 'bulk ticket clear must auto-prune orphan campaigns');

    assert.equal(bulk.state.campaigns.length, 0, 'bulk ticket clear must leave no orphan campaigns');
}

function runLocalUpdatesFutureGuardRegression() {
    const dm = new DataManager();

    dm.save = () => {};

    dm.state.syncMeta = dm.getDefaultSyncMeta();

    const est = estimateLatestDrawKST();

    const manual = dm.setLocalUpdates(
        [
            {
                draw_no: est,

                date: '2026-03-01',

                numbers: [1, 2, 3, 4, 5, 6],

                bonus: 7
            },

            {
                draw_no: est + 3,

                date: '2026-03-08',

                numbers: [8, 9, 10, 11, 12, 13],

                bonus: 14
            }
        ],

        { warningMode: 'manual' }
    );

    assert.equal(manual.items.length, 1, 'future local updates must be dropped when saving');

    assert.equal(manual.droppedFuture, 1, 'future local update count must be reported');

    assert.equal(manual.items[0].draw_no, est, 'allowed local update must be preserved');

    assert.match(
        dm.state.syncMeta.lastWarningMessage,

        /로컬 업데이트 1개를 제외/,

        'future local update drop must surface a warning'
    );
}

function runStorageSummaryByteAccountingRegression() {
    const previousStorage = globalThis.localStorage;

    const store = new Map([
        [CONFIG.KEYS.FAV, JSON.stringify([{ numbers: [1, 2, 3, 4, 5, 6], date: '한글' }])],

        [CONFIG.KEYS.HIST, '[]'],

        [CONFIG.KEYS.SETTINGS, '{}'],

        [CONFIG.KEYS.TICKET_BOOK, '[]'],

        [CONFIG.KEYS.CAMPAIGNS, '[]'],

        [CONFIG.KEYS.ALERT_PREFS, '{}'],

        [CONFIG.KEYS.STRATEGY_PRESETS, '[]'],

        [CONFIG.KEYS.SYNC_META, '{}'],

        [CONFIG.KEYS.LOCAL_UPDATES, '[]'],

        [CONFIG.KEYS.PENSION720_TICKETS, '[]'],

        [CONFIG.KEYS.PENSION720_CAMPAIGNS, '[]']
    ]);

    globalThis.localStorage = {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        }
    };

    try {
        const dm = new DataManager();

        const summary = dm.getStorageSummary();

        const expectedBytes = [...store.entries()].reduce((sum, [key, value]) => {
            return sum + new TextEncoder().encode(key).length + new TextEncoder().encode(value).length;
        }, 0);

        assert.equal(summary.bytes, expectedBytes, 'storage summary must count UTF-8 bytes, not UTF-16 code units');

        assert.ok(
            summary.bytes > [...store.entries()].reduce((sum, [key, value]) => sum + key.length + value.length, 0),

            'non-ASCII storage usage must exceed raw string length'
        );
    } finally {
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
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

        generatorData.setGeneratedEntries([
            {
                numbers: [1, 2, 3, 4, 5, 6],

                strategyRequest: {
                    strategyId: 'ensemble_weighted',

                    params: {},

                    filters: {}
                },

                createdAt: '2026-04-14T00:00:00.000Z',

                source: 'generator'
            },

            {
                numbers: [1, 2, 3, 4, 5, 6],

                strategyRequest: {
                    strategyId: 'ensemble_weighted',

                    params: {},

                    filters: {}
                },

                createdAt: '2026-04-14T00:00:00.000Z',

                source: 'generator'
            }
        ]);

        generatorData.state.history = [];

        GeneratorModule.prototype.saveAll.call({
            data: generatorData,

            app: {
                renderDataLists() {}
            }
        });

        assert.equal(
            generatorData.state.history.length,

            2,

            'saveAll must preserve duplicate generated sets as separate history logs'
        );

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

        importData.state.history = [{ numbers: [1, 2, 3, 4, 5, 6], date: '2026-04-01T00:00:00.000Z' }];

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

        assert.equal(
            importData.state.history.length,

            3,

            'merge import must preserve duplicate history entries as distinct logs'
        );

        assert.deepEqual(
            importData.state.history.map((entry) => entry.date),

            ['2026-04-03T00:00:00.000Z', '2026-04-02T00:00:00.000Z', '2026-04-01T00:00:00.000Z'],

            'merge import must sort combined history logs by newest date first'
        );

        assert.ok(
            toasts.some((item) => item.includes('히스토리 저장 완료') || item.includes('합치기 가져오기')),

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

                checked: {
                    drawNo: 1210,

                    rank: 1,

                    checkedAt: '2026-04-01T00:00:00.000Z'
                }
            })
        ].filter(Boolean);

        dm.localUpdatesCache = [
            {
                draw_no: 1210,

                date: '2026-04-01',

                numbers: [1, 2, 3, 4, 5, 6],

                bonus: 7
            }
        ];

        dm.clearLocalUpdates();

        dm.fetchWithTimeout = async () => ({
            ok: true,

            async json() {
                return {
                    data: [
                        {
                            draw_no: 1209,

                            date: '2026-03-29',

                            numbers: [7, 8, 9, 10, 11, 12],

                            bonus: 13
                        }
                    ]
                };
            }
        });

        const loaded = await dm.fetchWinningStats({ notifyTicketSettle: false });

        assert.equal(loaded, true, 'winning stats reload must succeed after clearing local updates');

        assert.equal(
            dm.state.ticketBook[0].checked,

            null,

            'clearing local updates must reset invalid checked tickets to pending'
        );

        assert.equal(
            dm.state.syncMeta.lastSuccessDrawNo,

            1209,

            'sync meta last success draw must clamp to current effective latest draw'
        );
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
                    data: [
                        {
                            draw_no: 1210,

                            date: '2026-03-07',

                            numbers: [1, 2, 3, 4, 5, 6],

                            bonus: 7
                        }
                    ]
                };
            }
        });

        const loaded = await dm.fetchWinningStats({ notifyTicketSettle: false });

        assert.equal(loaded, true, 'static winning stats fetch must succeed in local-restore regression');

        dm.markLocalRestoreSuccess({
            drawNo: dm.state.winningStats[0]?.draw_no || 0
        });

        assert.equal(dm.state.syncMeta.mode, 'local_restore', 'import refresh must mark sync meta as local_restore');

        assert.match(
            dm.state.syncMeta.currentSource,

            /로컬 복원/,

            'local_restore sync meta must describe the reconstructed source'
        );

        assert.equal(
            dm.state.syncMeta.lastSuccessDrawNo,

            1210,

            'local_restore sync meta must reuse effective winningStats draw number'
        );

        assert.ok(dm.state.syncMeta.lastSuccessAt, 'local_restore sync meta must record success time');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
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

export {
    runOrphanCampaignAutoCleanupRegression,
    runLocalUpdatesFutureGuardRegression,
    runStorageSummaryByteAccountingRegression,
    runHistoryActualLogRegression,
    runClearLocalUpdatesReconcileRegression,
    runLocalRestoreSyncMetaRegression,
    runPersistenceFlushRegression
};
