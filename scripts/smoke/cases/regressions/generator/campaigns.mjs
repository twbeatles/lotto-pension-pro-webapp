/* eslint-disable no-unused-vars */
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
} from '../support.mjs';

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
    assert.equal(
        dm.state.ticketBook.some((ticket) => ticket.campaignId === 'camp_a'),
        false,
        'linked camp_a tickets must be removed'
    );
    assert.equal(
        dm.state.ticketBook.some((ticket) => ticket.id === 'ticket_orphan'),
        true,
        'orphan tickets must be preserved'
    );

    const cleared = dm.clearCampaigns({ cascadeTickets: true });
    assert.equal(cleared.removedCampaigns, 1, 'bulk campaign delete must report removed campaign count');
    assert.equal(cleared.removedTickets, 1, 'bulk campaign delete must remove remaining linked tickets');
    assert.equal(dm.state.campaigns.length, 0, 'all campaigns must be cleared');
    assert.equal(
        dm.state.ticketBook.some((ticket) => ticket.id === 'ticket_b1'),
        false,
        'linked camp_b tickets must be removed'
    );
    assert.equal(
        dm.state.ticketBook.some((ticket) => ticket.id === 'ticket_orphan'),
        true,
        'orphan tickets must remain after bulk delete'
    );
    assert.equal(
        dm.state.ticketBook.some((ticket) => ticket.id === 'ticket_manual'),
        true,
        'manual tickets must remain after bulk delete'
    );
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

export {
    runDrawNormalizationRegression,
    runCampaignLimitRegression,
    runCampaignResetAutofillRecoveryRegression,
    runCampaignCascadeRegression,
    runCampaignEmptySaveRegression
};
