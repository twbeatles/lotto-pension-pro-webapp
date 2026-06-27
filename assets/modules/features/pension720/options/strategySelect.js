import { $ } from '../../../utils/utils.js';
import { listPension720Strategies, resolvePension720StrategyId } from '../../../core/Pension720StrategyCatalog.js';
import { PENSION720_ANALYSIS_PRESETS } from '../dom.js';

export const pension720OptionStrategySelectMethods = {
    getSuggestedNextDrawNo() {
        return (this.data.state.pension720Stats?.[0]?.draw_no || 0) + 1;
    },

    populateStrategySelect() {
        const select = $('#pension720StrategySelect');
        if (!select) return;
        const current = select.value || 'mixed_balance';
        const includeExperimental = Boolean($('#pension720ShowExperimental')?.checked);
        const items = listPension720Strategies({ includeExperimental });
        select.replaceChildren();
        items.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.label} (등급 ${item.tier})${item.experimental ? ' [실험]' : ''}`;
            select.appendChild(opt);
        });
        const resolved = resolvePension720StrategyId(current);
        if ([...select.options].some((item) => item.value === resolved)) select.value = resolved;
    },

    applyAnalysisPreset(presetId = 'basic') {
        const preset = PENSION720_ANALYSIS_PRESETS[presetId] || PENSION720_ANALYSIS_PRESETS.basic;
        const lookback = $('#pension720LookbackWindow');
        const pool = $('#pension720CandidatePoolSize');
        const select = $('#pension720AnalysisPreset');
        if (lookback) lookback.value = String(preset.lookbackWindow);
        if (pool) pool.value = String(preset.candidatePoolSize);
        if (select) select.value = PENSION720_ANALYSIS_PRESETS[presetId] ? presetId : 'custom';
    },

    syncAnalysisPresetSelect() {
        const select = $('#pension720AnalysisPreset');
        if (!select) return 'custom';
        const lookback = Number($('#pension720LookbackWindow')?.value || 0);
        const pool = Number($('#pension720CandidatePoolSize')?.value || 0);
        const matched = Object.entries(PENSION720_ANALYSIS_PRESETS).find(([, preset]) => {
            return preset.lookbackWindow === lookback && preset.candidatePoolSize === pool;
        });
        select.value = matched?.[0] || 'custom';
        return select.value;
    }
};