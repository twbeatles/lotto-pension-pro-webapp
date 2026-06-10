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

function runGeneratedTicketProvenanceRegression() {
    const data = new DataManager();
    data.save = () => {};
    data.state.winningStats = [
        {
            draw_no: 1209,
            date: '2026-04-12',
            numbers: [1, 2, 3, 4, 5, 6],
            bonus: 7
        }
    ];
    data.setGeneratedEntries([
        {
            numbers: [7, 8, 9, 10, 11, 12],
            strategyRequest: {
                strategyId: 'auto_recent_top',
                params: { simulationCount: 5500, lookbackWindow: 20 },
                filters: { sumRange: [100, 170] }
            },
            createdAt: '2026-04-14T01:00:00.000Z',
            source: 'ai'
        }
    ]);

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

export { runGeneratedTicketProvenanceRegression };
