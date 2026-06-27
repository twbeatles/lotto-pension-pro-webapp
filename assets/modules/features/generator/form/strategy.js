import { $ } from '../../../utils/utils.js';
import { listStrategies, resolveStrategyId } from '../../../core/StrategyCatalog.js';
import { syncAnalysisPresetSelect } from '../../../utils/analysisPresets.js';

export const generatorFormStrategyMethods = {
    populateStrategySelect() {
        const select = $('#genStrategySelect');
        if (!select) return;
        const current = select.value || 'ensemble_weighted';
        const includeExperimental = Boolean($('#genShowExperimental')?.checked);
        const items = listStrategies({ includeExperimental, scope: 'generator' });
        select.innerHTML = '';
        items.forEach((item) => {
            const opt = document.createElement('option');
            const exp = item.experimental ? ' [실험]' : '';
            opt.value = item.id;
            opt.textContent = `${item.label} (등급 ${item.tier})${exp}`;
            select.appendChild(opt);
        });
        const resolved = resolveStrategyId(current);
        if ([...select.options].some((x) => x.value === resolved)) {
            select.value = resolved;
        }
        this.syncLegacyTogglesFromStrategy();
    },

    syncLegacyTogglesFromStrategy() {
        const strategyId = resolveStrategyId($('#genStrategySelect')?.value || 'ensemble_weighted');
        const smart = $('#smartMode');
        const hot = $('#preferHot');
        const balance = $('#balanceMode');
        if (!smart || !hot || !balance) return;
        if (strategyId === 'random_baseline') {
            smart.checked = false;
            hot.checked = true;
            balance.checked = false;
            return;
        }
        smart.checked = true;
        hot.checked = strategyId !== 'cold_frequency';
        balance.checked = strategyId === 'balance_oe_hl' || strategyId === 'stat_ac_sum';
    },

    syncStrategyFromLegacyToggles() {
        const select = $('#genStrategySelect');
        if (!select) return;
        const smart = Boolean($('#smartMode')?.checked);
        const hot = Boolean($('#preferHot')?.checked);
        const balance = Boolean($('#balanceMode')?.checked);
        let strategyId = 'ensemble_weighted';
        if (!smart) strategyId = 'random_baseline';
        else if (balance) strategyId = 'balance_oe_hl';
        else if (!hot) strategyId = 'cold_frequency';
        else strategyId = 'hot_frequency';

        if ([...select.options].some((x) => x.value === strategyId)) {
            select.value = strategyId;
        }
    },

    getStrategyRequestFromUI() {
        const strategyId = resolveStrategyId($('#genStrategySelect')?.value || 'ensemble_weighted');
        const params = {
            simulationCount: this.readNumberInput('genSimulationCount', 5000),
            lookbackWindow: this.readNumberInput('genLookbackWindow', 20),
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: this.readNumberInput('genSeed', null)
        };

        const filters = {
            oddEven: this.buildRange('genOddMin', 'genOddMax'),
            highLow: this.buildRange('genHighMin', 'genHighMax'),
            sumRange: this.buildRange('genSumMin', 'genSumMax'),
            acRange: this.buildRange('genAcMin', 'genAcMax'),
            maxConsecutivePairs: this.readNumberInput('genMaxConsecutive', null),
            endDigitUniqueMin: this.readNumberInput('genEndDigitUnique', null)
        };

        return { strategyId, params, filters };
    },

    applyStrategyRequest(saved) {
        if (!saved) return;
        const assign = (id, value) => {
            const el = $(`#${id}`);
            if (el && value !== undefined && value !== null) el.value = value;
        };
        assign('genSimulationCount', saved.params?.simulationCount);
        assign('genLookbackWindow', saved.params?.lookbackWindow);
        assign('genSeed', saved.params?.seed ?? '');
        syncAnalysisPresetSelect('gen');

        const setPair = (minId, maxId, pair) => {
            const minEl = $(`#${minId}`);
            const maxEl = $(`#${maxId}`);
            if (!minEl || !maxEl) return;
            if (Array.isArray(pair) && pair.length >= 2) {
                minEl.value = pair[0];
                maxEl.value = pair[1];
            }
        };
        setPair('genOddMin', 'genOddMax', saved.filters?.oddEven);
        setPair('genHighMin', 'genHighMax', saved.filters?.highLow);
        setPair('genSumMin', 'genSumMax', saved.filters?.sumRange);
        setPair('genAcMin', 'genAcMax', saved.filters?.acRange);
        assign('genMaxConsecutive', saved.filters?.maxConsecutivePairs);
        assign('genEndDigitUnique', saved.filters?.endDigitUniqueMin);

        const strategyId = resolveStrategyId(saved.strategyId || 'ensemble_weighted');
        const select = $('#genStrategySelect');
        if (select && [...select.options].some((x) => x.value === strategyId)) {
            select.value = strategyId;
        }
        this.syncLegacyTogglesFromStrategy();
    },

    applySavedStrategyPrefs() {
        this.applyStrategyRequest(this.data.state.strategyPrefs?.generator);
    }
};