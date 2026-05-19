import {
    assert,
    CONFIG,
    createDocumentStub,
    createField,
    DataIOModule,
    DataManager,
    estimateLatestDrawKST,
    readFile,
    resolve,
    UIManager
} from './support.mjs';

function makeMemoryStorage(seed = {}) {
    const store = new Map(Object.entries(seed));
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        _store: store
    };
}

function runStorageDirtyRetainedOnFailureRegression() {
    const previousStorage = globalThis.localStorage;
    const previousToast = UIManager.toast;
    const previousConsoleError = console.error;
    const error = new Error('quota full');
    error.name = 'QuotaExceededError';

    globalThis.localStorage = {
        getItem() {
            return null;
        },
        setItem() {
            throw error;
        }
    };
    UIManager.toast = () => {};
    console.error = () => {};

    try {
        const dm = new DataManager();
        dm.state.favorites = [{ numbers: [1, 2, 3, 4, 5, 6], date: '2026-05-17T00:00:00.000Z' }];
        dm.markDirty('fav');
        dm.save(true);

        assert.equal(dm._dirtyKeys.fav, true, 'failed localStorage write must keep the dirty flag');
        assert.equal(dm.getStorageWriteFailures().length, 1, 'failed localStorage write must be tracked');
        assert.equal(dm.getStorageSummary().status, 'danger', 'storage summary must surface write failures');
    } finally {
        console.error = previousConsoleError;
        UIManager.toast = previousToast;
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
    }
}

async function runDestructiveBackupAbortRegression() {
    const previousDocument = globalThis.document;
    const previousToast = UIManager.toast;
    const previousConfirm = UIManager.confirm;
    const importMode = createField({ value: 'overwrite' });
    const importApplyTheme = createField({ checked: true });
    const importApplyProxy = createField({ checked: true });
    const importApplyStrategyPrefs = createField({ checked: true });
    const importApplyAlerts = createField({ checked: true });
    const toasts = [];

    UIManager.toast = (message, type = 'info') => {
        toasts.push(`${type}:${message}`);
    };
    globalThis.document = createDocumentStub({
        '#importMode': importMode,
        '#importApplyTheme': importApplyTheme,
        '#importApplyProxy': importApplyProxy,
        '#importApplyStrategyPrefs': importApplyStrategyPrefs,
        '#importApplyAlerts': importApplyAlerts
    });

    try {
        const data = new DataManager();
        data.state.favorites = [{ numbers: [1, 2, 3, 4, 5, 6], date: '2026-05-17T00:00:00.000Z' }];
        data.save = () => {
            throw new Error('save must not run after backup failure');
        };
        data.setLocalUpdates = () => ({ items: [], droppedFuture: 0 });
        data.getLocalUpdates = () => [];

        const ctx = Object.create(DataIOModule.prototype);
        ctx.data = data;
        ctx.app = { applyTheme() {}, renderSettingsPanel() {} };
        ctx.syncProxyInput = () => {};
        ctx.refreshPresetSelectors = () => {};
        ctx.runPostImportRefresh = async () => {};
        ctx.confirmPreparedImport = async () => true;
        ctx.exportAll = () => ({ downloaded: false, filename: '' });

        await DataIOModule.prototype.importAll.call(ctx, {
            currentTarget: {
                files: [
                    {
                        size: 1,
                        async text() {
                            return JSON.stringify({
                                version: 4,
                                favorites: [],
                                history: [],
                                ticketBook: [],
                                campaigns: [],
                                pension720Tickets: [],
                                alertPrefs: {},
                                settings: {},
                                localUpdates: [],
                                strategyPresets: []
                            });
                        }
                    }
                ],
                value: 'overwrite.json'
            }
        });

        assert.equal(data.state.favorites.length, 1, 'overwrite import must abort before replacing data');
        assert.ok(
            toasts.some((item) => item.startsWith('error:')),
            'backup failure must show an error toast'
        );

        const cancelData = new DataManager();
        cancelData.state.favorites = [{ numbers: [1, 2, 3, 4, 5, 6], date: '2026-05-17T00:00:00.000Z' }];
        cancelData.save = () => {
            throw new Error('save must not run after backup confirmation cancel');
        };
        cancelData.setLocalUpdates = () => ({ items: [], droppedFuture: 0 });
        cancelData.getLocalUpdates = () => [];

        const cancelCtx = Object.create(DataIOModule.prototype);
        cancelCtx.data = cancelData;
        cancelCtx.app = { applyTheme() {}, renderSettingsPanel() {} };
        cancelCtx.syncProxyInput = () => {};
        cancelCtx.refreshPresetSelectors = () => {};
        cancelCtx.runPostImportRefresh = async () => {};
        cancelCtx.confirmPreparedImport = async () => true;
        cancelCtx.exportAll = () => ({ downloaded: true, filename: 'before-overwrite.json' });
        UIManager.confirm = async () => false;

        await DataIOModule.prototype.importAll.call(cancelCtx, {
            currentTarget: {
                files: [
                    {
                        size: 1,
                        async text() {
                            return JSON.stringify({
                                version: 4,
                                favorites: [],
                                history: [],
                                ticketBook: [],
                                campaigns: [],
                                pension720Tickets: [],
                                alertPrefs: {},
                                settings: {},
                                localUpdates: [],
                                strategyPresets: []
                            });
                        }
                    }
                ],
                value: 'overwrite.json'
            }
        });

        assert.equal(
            cancelData.state.favorites.length,
            1,
            'overwrite import must abort when backup confirm is canceled'
        );
        assert.ok(
            toasts.some((item) => item.includes('백업 확인이 취소')),
            'backup confirmation cancel must show an abort toast'
        );

        const cleanupSource = await readFile(
            resolve(process.cwd(), 'assets/modules/core/app/dataLists/events.js'),
            'utf8'
        );
        assert.match(
            cleanupSource,
            /ensureBackupBeforeDestructive/,
            'backup-and-cleanup must also abort through the destructive backup helper'
        );
    } finally {
        UIManager.toast = previousToast;
        UIManager.confirm = previousConfirm;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runPension720OfficialCacheRegression() {
    const previousStorage = globalThis.localStorage;
    const previousFetch = globalThis.fetch;
    const cached = [
        {
            draw_no: 4,
            date: '2026-05-21',
            group: 1,
            number: '123456',
            bonus_number: '654321'
        }
    ];
    const staticRows = [
        {
            draw_no: 3,
            date: '2026-05-14',
            group: 2,
            number: '537530',
            bonus_number: '358127'
        }
    ];
    globalThis.localStorage = makeMemoryStorage({
        [CONFIG.KEYS.PENSION720_STATS_CACHE]: JSON.stringify({
            version: 1,
            updatedAt: '2026-05-21T00:00:00.000Z',
            items: cached
        })
    });
    globalThis.fetch = async () => ({
        ok: true,
        async json() {
            return staticRows;
        }
    });

    try {
        const dm = new DataManager();
        const ok = await dm.fetchPension720Stats({ remote: false });
        assert.equal(ok, true, 'pension720 fetch must succeed from static plus official cache');
        assert.equal(dm.state.pension720Stats[0]?.draw_no, 4, 'official cache must win when newer than static');
        assert.equal(dm.pension720DataHealth.source, 'official_cache', 'health source must expose official cache');
    } finally {
        if (previousStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previousStorage;
        if (previousFetch === undefined) delete globalThis.fetch;
        else globalThis.fetch = previousFetch;
    }
}

function runAutoSyncAvailabilityRegression() {
    const dm = new DataManager();
    const latest = Math.max(1, estimateLatestDrawKST() - 1);
    dm.state.winningStats = [{ draw_no: latest }];
    dm.state.staticLatestDrawNo = latest;
    dm.dataHealth = { availability: 'full', source: 'static', latestDrawNo: latest, message: '' };
    dm.state.syncMeta = dm.mergeSyncMeta({
        lastFailureAt: new Date().toISOString(),
        lastFailureMessage: 'network unavailable',
        lastSuccessAt: ''
    });

    assert.equal(dm.getDataFreshness().canAutoSync, false, 'recent sync failure must block auto-sync optimism');

    dm.state.customProxy = 'https://example.com/proxy/latest';
    assert.equal(dm.getDataFreshness().canAutoSync, true, 'valid custom proxy must restore auto-sync availability');
}

function runTemporaryResultsSessionRegression() {
    const previousSession = globalThis.sessionStorage;
    globalThis.sessionStorage = makeMemoryStorage();

    try {
        const dm = new DataManager();
        dm.state.generated = [{ numbers: [6, 5, 4, 3, 2, 1], source: 'generator' }];
        dm.state.aiResults = [[7, 8, 9, 10, 11, 12]];
        dm.state.pension720Results = [{ group: 2, number: '060727', score: 12.5, expansionGroups: [1, 3] }];
        assert.equal(dm.persistTemporaryResultsToSession(), true, 'temporary results must persist to sessionStorage');

        const restored = new DataManager();
        assert.equal(
            restored.loadTemporaryResultsFromSession(),
            true,
            'temporary results must restore from sessionStorage'
        );
        assert.deepEqual(restored.state.generated[0]?.numbers, [1, 2, 3, 4, 5, 6], 'generated results must normalize');
        assert.deepEqual(restored.state.aiResults[0], [7, 8, 9, 10, 11, 12], 'AI results must restore');
        assert.equal(restored.state.pension720Results[0]?.number, '060727', 'pension720 results must restore');
    } finally {
        if (previousSession === undefined) delete globalThis.sessionStorage;
        else globalThis.sessionStorage = previousSession;
    }
}

async function runDomSelectorContractRegression() {
    const indexSource = await readFile(resolve(process.cwd(), 'index.html'), 'utf8');
    const navTargets = [...indexSource.matchAll(/data-target="([^"]+)"/g)].map((match) => match[1]);
    navTargets.forEach((target) => {
        assert.match(indexSource, new RegExp(`id="page-${target}"`), `nav target ${target} must have a page section`);
    });

    [
        'genResultList',
        'aiOutput',
        'pension720Output',
        'dataStatusSummary',
        'settingsSyncStateBadge',
        'pwaCacheBadge',
        'pwaCacheNote'
    ].forEach((id) => {
        assert.match(indexSource, new RegExp(`id="${id}"`), `${id} must remain present in index.html`);
    });
}

async function runPwaCacheHealthRegression() {
    const [swSource, pwaSource, indexSource] = await Promise.all([
        readFile(resolve(process.cwd(), 'sw.js'), 'utf8'),
        readFile(resolve(process.cwd(), 'assets/modules/core/app/pwaInstall.js'), 'utf8'),
        readFile(resolve(process.cwd(), 'index.html'), 'utf8')
    ]);

    assert.match(swSource, /CACHE_HEALTH_PATH_SUFFIX = '\/__cache-health\.json'/, 'SW must expose cache health path');
    assert.match(swSource, /failures\.push/, 'SW precache must collect failed assets');
    assert.match(swSource, /lastPrecacheHealth/, 'SW must retain the last precache health payload');
    assert.match(pwaSource, /_refreshPwaCacheHealth/, 'settings code must fetch cache health');
    assert.match(indexSource, /id="pwaCacheBadge"/, 'settings modal must render cache health badge');
}

export {
    runAutoSyncAvailabilityRegression,
    runDestructiveBackupAbortRegression,
    runDomSelectorContractRegression,
    runPension720OfficialCacheRegression,
    runPwaCacheHealthRegression,
    runStorageDirtyRetainedOnFailureRegression,
    runTemporaryResultsSessionRegression
};
