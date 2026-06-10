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
            [
                {
                    numbers: [1, 2, 3, 4, 5, 6],
                    strategyRequest: {
                        strategyId: 'auto_recent_top',
                        params: { simulationCount: 1200 },
                        filters: { sumRange: [100, 180] }
                    },
                    createdAt: '2026-04-14T00:00:00.000Z',
                    source: 'ai'
                }
            ],
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
                    winningStats: [
                        {
                            draw_no: 1209,
                            date: '2026-03-07',
                            numbers: [1, 2, 3, 4, 5, 6],
                            bonus: 7,
                            prize_amount: 0,
                            winners_count: 0
                        }
                    ]
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

        ctx.data.state.winningStats = [
            {
                draw_no: 1210,
                date: '2026-03-14',
                numbers: [2, 4, 6, 8, 10, 12],
                bonus: 14,
                prize_amount: 0,
                winners_count: 0
            }
        ];
        LottoApp.prototype.updateLatestWin.call(ctx);
        assert.equal(genTarget.value, '1211', 'auto-managed generator target draw must follow latest sync');
        assert.equal(campTarget.value, '1211', 'auto-managed campaign target draw must follow latest sync');
        assert.equal(aiTarget.value, '1211', 'auto-managed AI target draw must follow latest sync');

        genTarget.value = '1300';
        genTarget.dataset.userEdited = 'true';
        ctx.data.state.winningStats = [
            {
                draw_no: 1211,
                date: '2026-03-21',
                numbers: [3, 6, 9, 12, 15, 18],
                bonus: 21,
                prize_amount: 0,
                winners_count: 0
            }
        ];
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
    assert.equal(
        dm.findStrategyPreset('generator', '테스트 프리셋').request.strategyId,
        'cold_frequency',
        'preset overwrite must update request'
    );

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
            options: [{ value: 'ensemble_weighted' }, { value: 'cold_frequency' }]
        })
    };
    globalThis.document = createDocumentStub(fields);

    try {
        let synced = 0;
        GeneratorModule.prototype.applyStrategyRequest.call(
            {
                syncLegacyTogglesFromStrategy() {
                    synced++;
                }
            },
            dm.findStrategyPreset('generator', '테스트 프리셋').request
        );

        assert.equal(fields['#genStrategySelect'].value, 'cold_frequency', 'preset load must update strategy select');
        assert.equal(Number(fields['#genSimulationCount'].value), 9000, 'preset load must apply numeric params');
        assert.equal(
            Number(fields['#genLookbackWindow'].value),
            baseRequest.params.lookbackWindow,
            'preset load must apply lookback window'
        );
        assert.equal(synced, 1, 'preset load must resync legacy toggles');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }

    const generatorPresetId = dm.findStrategyPreset('generator', '테스트 프리셋').id;
    assert.equal(dm.deleteStrategyPreset(generatorPresetId), true, 'preset delete must succeed');
    assert.equal(dm.getStrategyPresets('generator').length, 0, 'preset delete must remove generator preset');
}

export { runRequestNumbersRegression, runTargetDrawAutofillRegression, runStrategyPresetCrudRegression };
