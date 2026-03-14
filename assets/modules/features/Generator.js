import { StrategyEngine } from '../core/StrategyEngine.js';
import { StrategyWorkerClient } from '../core/StrategyWorkerClient.js';
import { StrategyPresetController } from '../utils/strategyPresets.js';
import { generatorFormMethods } from './generator/form.js';
import { generatorActionMethods } from './generator/actions.js';

export class GeneratorModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.engine = new StrategyEngine(this.data.state.winningStats);
        this.workerClient = this.app.strategyWorker || new StrategyWorkerClient();
        this.boundDelegation = false;
        this.bindEvents();
        this.populateStrategySelect();
        this.applySavedStrategyPrefs();
        this.presetController = new StrategyPresetController({
            data: this.data,
            scope: 'generator',
            selectId: 'genPresetSelect',
            loadBtnId: 'genPresetLoadBtn',
            saveBtnId: 'genPresetSaveBtn',
            deleteBtnId: 'genPresetDeleteBtn',
            getRequest: () => this.getStrategyRequestFromUI(),
            applyRequest: (request) => this.applyStrategyRequest(request)
        });
        this.resetCampaignOptions(false);
    }
}

Object.assign(GeneratorModule.prototype,
    generatorFormMethods,
    generatorActionMethods
);
