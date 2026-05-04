import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { UI_STRINGS } from '../../utils/strings.js';
import { applyAnalysisPresetToFields, syncAnalysisPresetSelect } from '../../utils/analysisPresets.js';

export const backtestEventMethods = {
    bindEvents() {
        $('#runBacktest')?.addEventListener('click', () => this.run());
        $('#stopBacktest')?.addEventListener('click', () => this.stop());
        $('#btShowExperimental')?.addEventListener('change', () => this.populateStrategySelect());
        $('#btExportCsv')?.addEventListener('click', () => this.exportComparisonCsv());
        $('#btCompareMode')?.addEventListener('change', () => this.toggleCompareMode());
        $('#btAnalysisPreset')?.addEventListener('change', (e) => {
            if (e.currentTarget.value === 'custom') return;
            applyAnalysisPresetToFields('bt', e.currentTarget.value);
        });
        ['#btSimulationCount', '#btLookbackWindow'].forEach((selector) => {
            $(selector)?.addEventListener('input', () => syncAnalysisPresetSelect('bt'));
        });
    },

    onEnter() {
        this.renderPersistedState();
    },

    toggleCompareMode() {
        const enabled = Boolean($('#btCompareMode')?.checked);
        const box = $('#btComparePanel');
        if (box) box.style.display = enabled ? 'block' : 'none';
    },

    clearPersistedResults() {
        this.lastSummary = null;
        this.lastComparisons = [];
        this.lastDiagnostics = null;
        this.lastWinRows = [];
        this.lastProgressText = '';
    },

    resetUI({ clearPersisted = false } = {}) {
        const sum = $('#btSummaryList');
        if (sum) sum.innerHTML = '<li>실행 대기 중...</li>';

        const tbody = $('#btResultTable tbody');
        if (tbody) tbody.innerHTML = '';
        const compareTbody = $('#btCompareTable tbody');
        if (compareTbody) compareTbody.innerHTML = '';
        const winner = $('#btWinnerBadge');
        if (winner) winner.textContent = '-';
        this.setProgressStatus('', { persist: false });
        this.currentPayoutMode = this.readPayoutMode();
        this.winRowsBuffer = [];
        if (this.winFlushRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.winFlushRaf);
        }
        this.winFlushRaf = 0;
        const notice = $('#btPayoutNotice');
        if (notice) notice.textContent = '';
        const charts = $('#btMiniCharts');
        if (charts) charts.innerHTML = '';
        if (clearPersisted) {
            this.clearPersistedResults();
        }
    },

    setProgressStatus(text, { persist = true } = {}) {
        const el = $('#btProgressMeta');
        if (persist) {
            this.lastProgressText = text || '';
        }
        if (el) el.textContent = text || '';
    },

    setRunningState(nextRunning) {
        this.isRunning = Boolean(nextRunning);
        const runBtn = $('#runBacktest');
        const stopBtn = $('#stopBacktest');
        if (runBtn) runBtn.disabled = this.isRunning;
        if (stopBtn) stopBtn.disabled = !this.isRunning;
    },

    cleanupWorker() {
        if (!this.worker) return;
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.terminate();
        this.worker = null;
    },

    stop() {
        if (!this.worker) return;
        this.cleanupWorker();
        if (this.winFlushRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.winFlushRaf);
        }
        this.winFlushRaf = 0;
        this.winRowsBuffer = [];
        this.setRunningState(false);
        this.setProgressStatus('중지됨');
        const runBtn = $('#runBacktest');
        if (runBtn && this.runButtonOriginal) runBtn.innerHTML = this.runButtonOriginal;
        UIManager.toast(UI_STRINGS.backtest.stopped, 'info');
    }
};
