import {
    assert,
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
} from './support.mjs';

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
        [CONFIG.KEYS.LOCAL_UPDATES, '[]']
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
        [CONFIG.KEYS.LOCAL_UPDATES, '[]']
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
        assert.equal(backupPrefix, 'lotto_before_replace', 'overwrite import must create a pre-replace backup');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
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

async function runPostImportRefreshRegression() {
    const calls = [];
    const data = {
        state: {
            winningStats: [{ draw_no: 1211 }]
        },
        dataHealth: {
            availability: 'none'
        },
        async fetchWinningStats(options) {
            calls.push(`fetchWinningStats:${JSON.stringify(options)}`);
            data.dataHealth = { availability: 'full' };
            return true;
        },
        markLocalRestoreSuccess(options) {
            calls.push(`markLocalRestoreSuccess:${JSON.stringify(options)}`);
        },
        markLocalRestoreFailure(message) {
            calls.push(`markLocalRestoreFailure:${message}`);
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
    assert.deepEqual(
        calls,
        [
            'fetchWinningStats:{"notifyTicketSettle":false,"preserveExistingOnFailure":false}',
            'markLocalRestoreSuccess:{"drawNo":1211}',
            'updateLatestWin',
            'refreshCurrentRoute',
            'renderDataLists'
        ],
        'post-import refresh order must be preserved'
    );
}

async function runPostImportRefreshFailureRegression() {
    const calls = [];
    const data = {
        state: {
            winningStats: []
        },
        dataHealth: {
            availability: 'none',
            message: '백업 복원 후 당첨 데이터를 다시 구성하지 못했습니다.'
        },
        async fetchWinningStats(options) {
            calls.push(`fetchWinningStats:${JSON.stringify(options)}`);
            return false;
        },
        markLocalRestoreSuccess(options) {
            calls.push(`markLocalRestoreSuccess:${JSON.stringify(options)}`);
        },
        markLocalRestoreFailure(message) {
            calls.push(`markLocalRestoreFailure:${message}`);
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
    assert.deepEqual(
        calls,
        [
            'fetchWinningStats:{"notifyTicketSettle":false,"preserveExistingOnFailure":false}',
            'markLocalRestoreFailure:백업 복원 후 당첨 데이터를 다시 구성하지 못했습니다.',
            'updateLatestWin',
            'refreshCurrentRoute',
            'renderDataLists'
        ],
        'post-import refresh must mark a local-restore failure when winning data rebuild fails'
    );
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
    runCheckTargetDrawRegression,
    runCleanupStoredRecordsRegression,
    runClearLocalUpdatesReconcileRegression,
    runHistoryActualLogRegression,
    runImmediateTicketSettlementRegression,
    runImportStoredListStrictNormalizationRegression,
    runImportAlertOptionRegression,
    runImportOrphanCampaignCleanupRegression,
    runImportPreviewAndOverwriteBackupRegression,
    runImportSafetyLimitsRegression,
    runLoadOrphanCampaignMigrationRegression,
    runLocalRestoreSyncMetaRegression,
    runLocalUpdatesFutureGuardRegression,
    runOrphanCampaignAutoCleanupRegression,
    runPostImportRefreshFailureRegression,
    runPostImportRefreshRegression,
    runPersistenceFlushRegression,
    runStorageSummaryByteAccountingRegression,
    runStoredListNormalizationRegression,
    runTicketDedupeRegression,
    runTicketQuantityGroupingRegression,
    runTicketReconcileRegression
};
