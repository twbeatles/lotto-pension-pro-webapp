import {
    assert,
    buildSmokeRequest,
    CONFIG,
    createDocumentStub,
    createField,
    DataManager,
    GeneratorModule,
    LottoApp,
    normalizeBackupPayload
} from './support.mjs';

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

async function runRequestNumbersRegression() {
    const previousDocument = globalThis.document;
    const list = createField({ innerHTML: '<div>old</div>' });

    globalThis.document = createDocumentStub({
        '#genResultList': list,
        '#toast-container': null
    });

    try {
        const routeCalls = [];
        const data = new DataManager();
        const ctx = {
            data,
            generator: {
                renderResultItem(nums, index, container) {
                    container.innerHTML += `<div class="result-item" data-idx="${index}">${nums.join(',')}</div>`;
                }
            },
            async route(target) {
                routeCalls.push(target);
            }
        };
        data.setGeneratedEntries([{ numbers: [7, 8, 9, 10, 11, 12], source: 'generator' }]);

        await LottoApp.prototype.requestNumbers.call(ctx, [1, 2, 3, 4, 5, 6], {
            source: 'ai',
            createdAt: '2026-04-14T00:00:00.000Z',
            strategyRequest: {
                strategyId: 'auto_recent_top',
                params: { simulationCount: 1200 },
                filters: { sumRange: [100, 180] }
            }
        });

        assert.deepEqual(routeCalls, ['gen'], 'AI import must route to generator tab');
        assert.deepEqual(
            ctx.data.state.generated,
            [{
                numbers: [1, 2, 3, 4, 5, 6],
                strategyRequest: {
                    strategyId: 'auto_recent_top',
                    params: { simulationCount: 1200 },
                    filters: { sumRange: [100, 180] }
                },
                createdAt: '2026-04-14T00:00:00.000Z',
                source: 'ai'
            }],
            'AI import must replace generated state with provenance-preserving entries'
        );
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

async function runGeneratorStrategySelectionRegression() {
    const previousDocument = globalThis.document;
    const setCount = createField({ value: '2' });
    const fixedNums = createField({ value: '' });
    const excludeNums = createField({ value: '' });
    const limitConsecutive = createField({ checked: false });
    const genResultList = createField();
    const campStartDraw = createField({ value: '1210' });
    const campWeeks = createField({ value: '2' });
    const campSetsPerWeek = createField({ value: '1' });

    globalThis.document = createDocumentStub({
        '#setCount': setCount,
        '#fixedNums': fixedNums,
        '#excludeNums': excludeNums,
        '#limitConsecutive': limitConsecutive,
        '#genResultList': genResultList,
        '#campStartDraw': campStartDraw,
        '#campWeeks': campWeeks,
        '#campSetsPerWeek': campSetsPerWeek
    });

    try {
        const data = new DataManager();
        data.save = () => {};
        data.state.winningStats = [{
            draw_no: 1209,
            date: '2026-04-12',
            numbers: [1, 2, 3, 4, 5, 6],
            bonus: 7
        }];

        const workerRequests = [];
        const ctx = {
            data,
            app: { data, renderDataLists() {} },
            isGenerating: false,
            isGeneratingCampaign: false,
            generationToken: 0,
            campaignToken: 0,
            uiStrings: { workerFallback: '', workerFallbackCampaign: '' },
            syncBusyButtons() {},
            parseInput() {
                return [];
            },
            getStrategyRequestFromUI() {
                return {
                    strategyId: 'consensus_portfolio',
                    params: { simulationCount: 1200, lookbackWindow: 20, seed: 20260414 },
                    filters: {}
                };
            },
            syncStrategyFromLegacyToggles() {
                throw new Error('generate must not rewrite strategy selection from legacy toggles');
            },
            workerClient: {
                async generate(payload) {
                    workerRequests.push(payload.request.strategyId);
                    return { sets: [[1, 2, 3, 4, 5, 6]] };
                }
            },
            renderResultItem() {},
            readNumberInput(id, fallback = null) {
                const map = {
                    campStartDraw: 1210,
                    campWeeks: 2,
                    campSetsPerWeek: 1
                };
                return map[id] ?? fallback;
            },
            isWorkerTimeoutError() {
                return false;
            }
        };

        await GeneratorModule.prototype.generate.call(ctx);
        assert.equal(workerRequests[0], 'consensus_portfolio', 'generate must execute the currently selected strategy');
        assert.equal(
            data.state.generated[0]?.strategyRequest?.strategyId,
            'consensus_portfolio',
            'generated entries must preserve the selected strategy request'
        );

        await GeneratorModule.prototype.generateCampaign.call(ctx);
        assert.deepEqual(
            workerRequests.slice(1),
            ['consensus_portfolio', 'consensus_portfolio'],
            'campaign generation must keep the selected strategy for every generated week'
        );
        assert.deepEqual(
            data.state.ticketBook
                .map((ticket) => ticket.strategyRequest?.params?.seed)
                .sort((a, b) => a - b),
            [20260414, 20260415],
            'campaign tickets must preserve the per-week runtime strategy request'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runGeneratedTicketProvenanceRegression() {
    const data = new DataManager();
    data.save = () => {};
    data.state.winningStats = [{
        draw_no: 1209,
        date: '2026-04-12',
        numbers: [1, 2, 3, 4, 5, 6],
        bonus: 7
    }];
    data.setGeneratedEntries([{
        numbers: [7, 8, 9, 10, 11, 12],
        strategyRequest: {
            strategyId: 'auto_recent_top',
            params: { simulationCount: 5500, lookbackWindow: 20 },
            filters: { sumRange: [100, 170] }
        },
        createdAt: '2026-04-14T01:00:00.000Z',
        source: 'ai'
    }]);

    const ctx = {
        data,
        app: { data },
        getStrategyRequestFromUI() {
            return {
                strategyId: 'hot_frequency',
                params: { simulationCount: 1000 },
                filters: {}
            };
        }
    };

    const result = GeneratorModule.prototype.saveGeneratedEntryToTicket.call(ctx, data.state.generated[0], 1210);
    assert.equal(result?.ticket?.source, 'ai', 'saving a generated entry as ticket must preserve the original source');
    assert.equal(
        result?.ticket?.strategyRequest?.strategyId,
        'auto_recent_top',
        'saving a generated entry as ticket must preserve the original strategy request'
    );
}

export {
    runCampaignCascadeRegression,
    runCampaignEmptySaveRegression,
    runCampaignLimitRegression,
    runCampaignResetAutofillRecoveryRegression,
    runDrawNormalizationRegression,
    runGeneratedTicketProvenanceRegression,
    runGeneratorStrategySelectionRegression,
    runRequestNumbersRegression,
    runStrategyPresetCrudRegression,
    runTargetDrawAutofillRegression
};
