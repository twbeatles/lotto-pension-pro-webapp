import { StrategyPresetController } from '../utils/strategyPresets.js';
import { backtestUiMethods } from './backtest/ui.js';
import { backtestRunMethods } from './backtest/run.js';

export class BacktestModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.MAX_QTY = 1000;
        this.MAX_COMPARE_STRATEGIES = 5;
        this.worker = null;
        this.lastComparisons = [];
        this.lastSummary = null;
        this.lastDiagnostics = null;
        this.lastWinRows = [];
        this.lastProgressText = '';
        this.lastProgressAt = 0;
        this.winRowsBuffer = [];
        this.winFlushRaf = 0;
        this.isRunning = false;
        this.currentPayoutMode = 'hybrid_dynamic_first';
        this.runButtonOriginal = '';
        this.bindEvents();
        this.populateStrategySelect();
        this.applySavedStrategyPrefs();
        this.presetController = new StrategyPresetController({
            data: this.data,
            scope: 'backtest',
            selectId: 'btPresetSelect',
            loadBtnId: 'btPresetLoadBtn',
            saveBtnId: 'btPresetSaveBtn',
            deleteBtnId: 'btPresetDeleteBtn',
            getRequest: () => this.buildStrategyRequest(),
            applyRequest: (request) => this.applyStrategyRequest(request)
        });
    }
}

Object.assign(BacktestModule.prototype, backtestUiMethods, backtestRunMethods);
