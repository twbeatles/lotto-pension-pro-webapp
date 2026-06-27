import { $ } from '../../../utils/utils.js';
import { resolvePension720StrategyId } from '../../../core/Pension720StrategyCatalog.js';

export const pension720OptionStrategyRequestMethods = {
    getStrategyRequestFromUI() {
        const strategyId = resolvePension720StrategyId($('#pension720StrategySelect')?.value || 'mixed_balance');
        const seed = this.readNumberInput('pension720Seed', null);
        return {
            strategyId,
            params: {
                seed: Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : null,
                lookbackWindow: this.readNumberInput('pension720LookbackWindow', 40),
                candidatePoolSize: this.readNumberInput('pension720CandidatePoolSize', 140)
            },
            filters: {
                groups: this.parseGroups($('#pension720AllowedGroups')?.value || ''),
                fixedDigits: this.parseFixedDigits($('#pension720FixedDigits')?.value || ''),
                excludedDigitsByPosition: this.parseExcludedDigits($('#pension720ExcludedDigits')?.value || ''),
                digitSumRange: this.buildRange('pension720DigitSumMin', 'pension720DigitSumMax'),
                oddDigitRange: this.buildRange('pension720OddMin', 'pension720OddMax'),
                highDigitRange: this.buildRange('pension720HighMin', 'pension720HighMax'),
                uniqueDigitMin: this.readNumberInput('pension720UniqueDigitMin', null),
                maxSameDigit: this.readNumberInput('pension720MaxSameDigit', null)
            }
        };
    },

    applyStrategyRequest(saved) {
        if (!saved) return;
        const assign = (id, value) => {
            const el = $(`#${id}`);
            if (el && value !== undefined && value !== null) el.value = value;
        };
        const strategyId = resolvePension720StrategyId(saved.strategyId || 'mixed_balance');
        const select = $('#pension720StrategySelect');
        if (select && [...select.options].some((item) => item.value === strategyId)) select.value = strategyId;
        assign('pension720Seed', saved.params?.seed ?? '');
        assign('pension720LookbackWindow', saved.params?.lookbackWindow);
        assign('pension720CandidatePoolSize', saved.params?.candidatePoolSize);
        assign('pension720AllowedGroups', Array.isArray(saved.filters?.groups) ? saved.filters.groups.join(',') : '');
        assign('pension720FixedDigits', this.formatFixedDigits(saved.filters?.fixedDigits));
        assign('pension720ExcludedDigits', this.formatExcludedDigits(saved.filters?.excludedDigitsByPosition));
        this.applyRangeToFields('pension720DigitSumMin', 'pension720DigitSumMax', saved.filters?.digitSumRange);
        this.applyRangeToFields('pension720OddMin', 'pension720OddMax', saved.filters?.oddDigitRange);
        this.applyRangeToFields('pension720HighMin', 'pension720HighMax', saved.filters?.highDigitRange);
        assign('pension720UniqueDigitMin', saved.filters?.uniqueDigitMin);
        assign('pension720MaxSameDigit', saved.filters?.maxSameDigit);
        this.syncAnalysisPresetSelect();
    },

    applyRangeToFields(minId, maxId, pair) {
        const minEl = $(`#${minId}`);
        const maxEl = $(`#${maxId}`);
        if (!minEl || !maxEl) return;
        if (Array.isArray(pair) && pair.length >= 2) {
            minEl.value = pair[0];
            maxEl.value = pair[1];
        } else {
            minEl.value = '';
            maxEl.value = '';
        }
    },

    formatFixedDigits(value) {
        if (!value) return '';
        const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
        return [...entries]
            .filter(([, digit]) => digit !== null && digit !== undefined && digit !== '')
            .map(([pos, digit]) => `${Number(pos) + 1}=${digit}`)
            .join(', ');
    },

    formatExcludedDigits(value) {
        if (!value) return '';
        const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
        return [...entries]
            .filter(([, digits]) => Array.isArray(digits) && digits.length)
            .map(([pos, digits]) => `${Number(pos) + 1}=${digits.join(',')}`)
            .join('; ');
    }
};