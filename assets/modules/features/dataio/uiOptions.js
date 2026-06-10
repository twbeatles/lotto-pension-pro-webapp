import { $ } from '../../utils/utils.js';
import { runPostImportRefresh as executePostImportRefresh } from './postImportRefresh.js';

export const dataIoUiOptionMethods = {
    syncProxyInput() {
        this.app.renderSettingsPanel?.();
    },

    applyImportModeDefaults(mode = 'merge') {
        const applyTheme = $('#importApplyTheme');
        const applyProxy = $('#importApplyProxy');
        const applyStrategyPrefs = $('#importApplyStrategyPrefs');
        const applyAlerts = $('#importApplyAlerts');
        if (!applyTheme || !applyProxy || !applyStrategyPrefs || !applyAlerts) return;

        const isOverwrite = mode === 'overwrite';
        applyTheme.checked = isOverwrite;
        applyProxy.checked = isOverwrite;
        applyStrategyPrefs.checked = isOverwrite;
        applyAlerts.checked = isOverwrite;
    },

    getImportOptionsFromUI() {
        const modeRaw = String($('#importMode')?.value || 'merge').toLowerCase();
        const mode = modeRaw === 'overwrite' ? 'overwrite' : 'merge';
        return {
            mode,
            applyTheme: Boolean($('#importApplyTheme')?.checked),
            applyProxy: Boolean($('#importApplyProxy')?.checked),
            applyStrategyPrefs: Boolean($('#importApplyStrategyPrefs')?.checked),
            applyAlerts: Boolean($('#importApplyAlerts')?.checked)
        };
    },

    describeAppliedSettings(importOptions = {}) {
        const labels = [];
        if (importOptions.applyTheme) labels.push('테마');
        if (importOptions.applyProxy) labels.push('데이터 연결 주소');
        if (importOptions.applyStrategyPrefs) labels.push('전략 설정');
        if (importOptions.applyAlerts) labels.push('알림 설정');
        return labels;
    },

    async runPostImportRefresh() {
        await executePostImportRefresh({ data: this.data, app: this.app });
    },

    refreshPresetSelectors() {
        this.app.generator?.presetController?.render();
        this.app.ai?.presetController?.render();
        this.app.backtest?.presetController?.render();
        this.app.pension720?.presetController?.render();
    }
};
