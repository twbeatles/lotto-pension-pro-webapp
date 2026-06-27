import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { syncAnalysisPresetSelect } from '../../../utils/analysisPresets.js';

export const generatorFormOptionMethods = {
    resetCampaignOptions(force = true) {
        const defaults = {
            genTargetDrawNo: (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1,
            campStartDraw: (this.app.data.state.winningStats?.[0]?.draw_no || 0) + 1,
            campWeeks: 4,
            campSetsPerWeek: 3
        };
        const targetDrawIds = ['genTargetDrawNo', 'campStartDraw'];

        targetDrawIds.forEach((id) => {
            const el = $(`#${id}`);
            if (!el) return;
            if (!force && String(el.value || '').trim()) return;

            if (typeof this.app?.setTargetDrawInputValue === 'function') {
                this.app.setTargetDrawInputValue(id, defaults[id], { force: true, userEdited: false });
                return;
            }
            el.value = defaults[id];
        });

        ['campWeeks', 'campSetsPerWeek'].forEach((id) => {
            const el = $(`#${id}`);
            if (!el) return;
            if (force || !String(el.value || '').trim()) el.value = defaults[id];
        });
    },

    resetOptions() {
        $('#setCount').value = 5;
        $('#fixedNums').value = '';
        $('#excludeNums').value = '';
        $('#limitConsecutive').checked = true;
        $('#smartMode').checked = true;
        $('#preferHot').checked = true;
        $('#balanceMode').checked = true;
        const map = {
            genSimulationCount: 5000,
            genLookbackWindow: 20,
            genSeed: '',
            genOddMin: '',
            genOddMax: '',
            genHighMin: '',
            genHighMax: '',
            genSumMin: '',
            genSumMax: '',
            genAcMin: '',
            genAcMax: '',
            genMaxConsecutive: '',
            genEndDigitUnique: ''
        };
        Object.entries(map).forEach(([id, v]) => {
            const el = $(`#${id}`);
            if (el) el.value = v;
        });
        syncAnalysisPresetSelect('gen');
        if ($('#genStrategySelect')) $('#genStrategySelect').value = 'ensemble_weighted';
        this.syncLegacyTogglesFromStrategy();
        this.data.setStrategyPrefs('generator', this.getStrategyRequestFromUI());
        this.data.save();
        UIManager.toast('옵션이 초기화되었습니다.');
    },

    readNumberInput(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const v = String(el.value || '').trim();
        if (!v) return fallback;
        const n = Number(v);
        if (!Number.isFinite(n)) return fallback;
        return n;
    },

    isWorkerTimeoutError(err) {
        return String(err?.message || '').includes('WORKER_TIMEOUT');
    },

    buildRange(minId, maxId) {
        const min = this.readNumberInput(minId, null);
        const max = this.readNumberInput(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    },

    parseInput(val) {
        return [
            ...new Set(
                val
                    .split(/[^0-9]+/)
                    .filter(Boolean)
                    .map(Number)
                    .filter((n) => n >= 1 && n <= 45)
            )
        ];
    }
};