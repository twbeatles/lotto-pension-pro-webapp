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

function buildLargeBackupFixture() {
    const strategyRequest = {
        strategyId: 'ensemble_weighted',
        params: {
            simulationCount: 5000,
            lookbackWindow: 20,
            note: 'x'.repeat(CONFIG.LIMITS.MAX_STRATEGY_REQUEST_BYTES - 900)
        },
        filters: {
            sumRange: [100, 175],
            oddEven: [2, 4]
        }
    };

    const makeNumbers = (index) => {
        const start = (index % 39) + 1;
        return [start, start + 1, start + 2, start + 3, start + 4, start + 5];
    };

    const ticketBook = Array.from({ length: CONFIG.LIMITS.MAX_IMPORT_TICKETS }, (_, index) => ({
        id: `ticket_large_${index}`,
        numbers: makeNumbers(index),
        targetDrawNo: 1200 + (index % 80),
        source: 'import',
        quantity: 1,
        campaignId: `campaign_${index % 40}`,
        strategyRequest,
        memo: `large lotto backup row ${index}`,
        createdAt: `2026-05-20T00:${String(index % 60).padStart(2, '0')}:00.000Z`
    }));

    const pension720Tickets = Array.from({ length: CONFIG.LIMITS.MAX_PENSION720_TICKETS }, (_, index) => ({
        id: `p720_large_${index}`,
        group: (index % 5) + 1,
        number: String(100000 + index).padStart(6, '0'),
        source: 'import',
        targetDrawNo: 300 + (index % 40),
        campaignId: `p720_campaign_${index % 20}`,
        strategyRequest,
        memo: `large pension backup row ${index}`,
        createdAt: `2026-05-20T01:${String(index % 60).padStart(2, '0')}:00.000Z`
    }));

    return buildBackupPayload(
        {
            theme: 'dark',
            customProxy: 'https://example.com/proxy/latest',
            favorites: [],
            history: [],
            ticketBook,
            campaigns: [],
            pension720Tickets,
            pension720Campaigns: [],
            alertPrefs: {},
            strategyPrefs: {
                generator: buildSmokeRequest(),
                ai: buildSmokeRequest()
            },
            strategyPresets: []
        },
        {
            localUpdates: [],
            strategyPresets: []
        }
    );
}

async function runImportSafetyLimitsRegression() {
    const previousToast = UIManager.toast;

    const toasts = [];

    UIManager.toast = (message, type = 'info') => {
        toasts.push(`${type}:${message}`);
    };

    try {
        const ctx = Object.create(DataIOModule.prototype);

        ctx.data = new DataManager();

        await DataIOModule.prototype.importAll.call(ctx, {
            currentTarget: {
                files: [
                    {
                        size: CONFIG.LIMITS.MAX_IMPORT_BYTES + 1,

                        async text() {
                            return '{}';
                        }
                    }
                ],

                value: 'too-large.json'
            }
        });

        assert.ok(
            toasts.some((item) => item.includes('백업 파일은 최대')),

            'import must reject files larger than the configured size limit'
        );

        const data = new DataManager();

        const oversizedStrategyRequest = {
            strategyId: 'ensemble_weighted',

            params: {
                note: 'x'.repeat(CONFIG.LIMITS.MAX_STRATEGY_REQUEST_BYTES + 100)
            },

            filters: {}
        };

        const ticket = data.normalizeTicketEntry({
            id: 'ticket_big_strategy',

            numbers: [1, 2, 3, 4, 5, 6],

            targetDrawNo: 1210,

            source: 'import',

            strategyRequest: oversizedStrategyRequest
        });

        assert.ok(ticket, 'oversized strategy snapshot must not drop an otherwise valid ticket');

        assert.equal(
            ticket.strategyRequest,
            null,
            'oversized strategy snapshots must be stripped during normalization'
        );

        const largeBackupPayload = buildLargeBackupFixture();
        const largeBackupBytes = new TextEncoder().encode(JSON.stringify(largeBackupPayload, null, 2)).length;
        const normalizedLargeBackup = normalizeBackupPayload(largeBackupPayload);

        assert.equal(
            normalizedLargeBackup.ticketBook.length,
            CONFIG.LIMITS.MAX_IMPORT_TICKETS,
            'max lotto ticket backup fixture must preserve the app-supported ticket count'
        );
        assert.equal(
            normalizedLargeBackup.pension720Tickets.length,
            CONFIG.LIMITS.MAX_PENSION720_TICKETS,
            'max pension720 ticket backup fixture must preserve the app-supported ticket count'
        );
        assert.ok(
            largeBackupBytes < CONFIG.LIMITS.MAX_IMPORT_BYTES,
            `app-created max backup (${largeBackupBytes} bytes) must fit under MAX_IMPORT_BYTES`
        );
    } finally {
        UIManager.toast = previousToast;
    }
}

function runLoadOrphanCampaignMigrationRegression() {
    const previousDocument = globalThis.document;

    const previousStorage = globalThis.localStorage;

    const store = new Map([
        [CONFIG.KEYS.FAV, '[]'],

        [CONFIG.KEYS.HIST, '[]'],

        [CONFIG.KEYS.SETTINGS, '{}'],

        [CONFIG.KEYS.TICKET_BOOK, '[]'],

        [
            CONFIG.KEYS.CAMPAIGNS,

            JSON.stringify([
                {
                    id: 'camp_orphan',

                    name: 'orphan',

                    startDrawNo: 1210,

                    weeks: 1,

                    setsPerWeek: 1
                }
            ])
        ],

        [CONFIG.KEYS.ALERT_PREFS, '{}'],

        [CONFIG.KEYS.STRATEGY_PRESETS, '[]'],

        [CONFIG.KEYS.SYNC_META, '{}'],

        [CONFIG.KEYS.LOCAL_UPDATES, '[]'],

        [CONFIG.KEYS.PENSION720_TICKETS, '[]'],

        [CONFIG.KEYS.PENSION720_CAMPAIGNS, '[]']
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

        assert.equal(dm.state.campaigns.length, 0, 'cold-start load must prune orphan campaigns from persisted state');

        assert.deepEqual(
            JSON.parse(store.get(CONFIG.KEYS.CAMPAIGNS)),

            [],

            'orphan-campaign migration must persist the cleaned campaign list'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;

        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
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

        assert.deepEqual(
            mergeData.state.alertPrefs,

            {
                enableInApp: false,

                enableSystemNotification: false,

                notifyOnNewResult: true
            },

            'merge import must keep current alert prefs when alerts option is off'
        );

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

        overwriteCtx.exportAll = () => ({ downloaded: true, filename: 'before-overwrite.json' });

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

            campaigns: [
                {
                    id: 'camp_new',

                    name: 'imported campaign',

                    startDrawNo: 1210,

                    weeks: 1,

                    setsPerWeek: 1
                }
            ],

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

        data.state.ticketBook = [
            {
                id: 'ticket_existing',

                numbers: [1, 2, 3, 4, 5, 6],

                targetDrawNo: 1210,

                source: 'import',

                campaignId: '',

                strategyRequest: null,

                memo: '',

                createdAt: '2026-03-01T00:00:00.000Z',

                checked: null
            }
        ];

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

        assert.equal(
            data.state.campaigns.length,

            0,

            'merge import must remove orphan campaigns with no linked tickets'
        );

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

async function runImportPreviewAndOverwriteBackupRegression() {
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

        '#importApplyAlerts': importApplyAlerts
    });

    try {
        const data = new DataManager();

        data.save = () => {};

        data.state.favorites = [{ numbers: [1, 2, 3, 4, 5, 6], date: '2026-04-01T00:00:00.000Z' }];

        data.state.ticketBook = [];

        data.localUpdatesCache = [];

        const ctx = Object.create(DataIOModule.prototype);

        ctx.data = data;

        ctx.app = { applyTheme() {}, renderSettingsPanel() {} };

        ctx.syncProxyInput = () => {};

        ctx.refreshPresetSelectors = () => {};

        ctx.runPostImportRefresh = async () => {};

        const payload = normalizeBackupPayload({
            version: 3,

            favorites: [
                { numbers: [1, 2, 3, 4, 5, 6], date: '2026-04-02T00:00:00.000Z' },

                { numbers: [2, 3, 4, 5, 6, 7], date: '2026-04-03T00:00:00.000Z' }
            ],

            history: [{ numbers: [8, 9, 10, 11, 12, 13], date: '2026-04-04T00:00:00.000Z' }],

            ticketBook: [
                {
                    id: 'ticket_import_preview',

                    numbers: [3, 4, 5, 6, 7, 8],

                    targetDrawNo: 1300,

                    source: 'import',

                    createdAt: '2026-04-01T00:00:00.000Z',

                    quantity: 2
                }
            ],

            campaigns: [{ id: 'camp_orphan_import', name: 'orphan', startDrawNo: 1300, weeks: 1, setsPerWeek: 1 }],

            alertPrefs: {},

            settings: { theme: 'light', customProxy: 'https://example.com/proxy/latest' },

            localUpdates: [
                {
                    draw_no: estimateLatestDrawKST() + 3,

                    date: '2099-01-01',

                    numbers: [1, 2, 3, 4, 5, 6],

                    bonus: 7
                }
            ],

            strategyPresets: []
        });

        const incoming = DataIOModule.prototype.normalizeImportPayload.call(ctx, payload);

        const prepared = DataIOModule.prototype.buildImportPreview.call(ctx, incoming, {
            mode: 'merge',

            applyTheme: false,

            applyProxy: false,

            applyStrategyPrefs: false,

            applyAlerts: false
        });

        assert.equal(prepared.preview.cleaned, 1, 'import preview must count orphan campaign cleanup');

        assert.equal(prepared.preview.futureDropped, 1, 'import preview must count future local updates');

        assert.equal(prepared.preview.projectedTicketTotal, 2, 'import preview must estimate ticket quantity');

        assert.ok(prepared.preview.added >= 4, 'import preview must count new favorites/history/tickets');

        assert.ok(prepared.preview.duplicate >= 1, 'import preview must count duplicate incoming records');

        importMode.value = 'overwrite';

        DataIOModule.prototype.applyImportModeDefaults.call(ctx, 'overwrite');

        let backupPrefix = '';

        ctx.exportAll = (options = {}) => {
            backupPrefix = options.prefix || '';

            return { downloaded: true, filename: 'test.json' };
        };

        ctx.confirmPreparedImport = async () => true;

        const file = {
            size: 1,

            async text() {
                return JSON.stringify({
                    version: 3,

                    favorites: [],

                    history: [],

                    ticketBook: [],

                    campaigns: [],

                    alertPrefs: {},

                    settings: {},

                    localUpdates: [],

                    strategyPresets: []
                });
            }
        };

        await DataIOModule.prototype.importAll.call(ctx, {
            currentTarget: {
                files: [file],

                value: 'overwrite.json'
            }
        });

        assert.equal(
            backupPrefix,

            'lotto_pension_pro_before_replace',

            'overwrite import must create a rebranded pre-replace backup'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

export {
    runImportSafetyLimitsRegression,
    runLoadOrphanCampaignMigrationRegression,
    runImportAlertOptionRegression,
    runImportOrphanCampaignCleanupRegression,
    runImportPreviewAndOverwriteBackupRegression
};
