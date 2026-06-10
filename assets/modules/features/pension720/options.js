import { $ } from '../../utils/utils.js';
import { listPension720Strategies, resolvePension720StrategyId } from '../../core/Pension720StrategyCatalog.js';
import { UIManager } from '../../core/UIManager.js';
import { makeEl, PENSION720_ANALYSIS_PRESETS } from './dom.js';

export const pension720OptionMethods = {
    syncBusyButtons() {
        const anyBusy = this.isRecommending || this.isGeneratingCampaign;
        const recommendBtn = $('#pension720RecommendBtn');
        const campaignBtn = $('#pension720CampaignBtn');
        const resetCampaignBtn = $('#pension720CampaignResetBtn');
        const resetOptionsBtn = $('#pension720ResetOptionsBtn');

        if (recommendBtn) {
            if (!this.recommendBtnOriginalText) this.recommendBtnOriginalText = recommendBtn.textContent || '추천 시작';
            recommendBtn.disabled = anyBusy;
            recommendBtn.textContent = this.isRecommending ? '추천 중' : this.recommendBtnOriginalText;
        }
        if (campaignBtn) {
            campaignBtn.disabled = anyBusy;
            campaignBtn.replaceChildren();
            const icon = makeEl('i', this.isGeneratingCampaign ? 'ph ph-spinner ph-spin' : 'ph ph-calendar-plus');
            campaignBtn.append(icon, document.createTextNode(this.isGeneratingCampaign ? ' 생성 중' : ' 캠페인 생성'));
        }
        if (resetCampaignBtn) resetCampaignBtn.disabled = anyBusy;
        if (resetOptionsBtn) resetOptionsBtn.disabled = anyBusy;
    },

    readNumberInput(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const value = String(el.value || '').trim();
        if (!value) return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    },

    buildRange(minId, maxId) {
        const min = this.readNumberInput(minId, null);
        const max = this.readNumberInput(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    },

    parseGroups(value = '') {
        const groups = [
            ...new Set(
                String(value || '')
                    .split(/[^0-9]+/)
                    .map(Number)
                    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 5)
            )
        ].sort((a, b) => a - b);
        return groups.length ? groups : null;
    },

    parseFixedDigits(value = '') {
        const text = String(value || '').trim();
        if (!text) return null;
        const out = Array(6).fill(null);
        let found = false;
        for (const match of text.matchAll(/([1-6])\s*[:=]\s*([0-9])/g)) {
            out[Number(match[1]) - 1] = Number(match[2]);
            found = true;
        }
        return found ? out : null;
    },

    parseExcludedDigits(value = '') {
        const text = String(value || '').trim();
        if (!text) return null;
        const out = Array.from({ length: 6 }, () => []);
        let found = false;
        for (const segment of text.split(/[;|/]+/)) {
            const match = segment.match(/([1-6])\s*[:=]\s*([0-9,\s]+)/);
            if (!match) continue;
            const pos = Number(match[1]) - 1;
            const digits = [
                ...new Set(
                    match[2]
                        .split(/[^0-9]+/)
                        .map(Number)
                        .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9)
                )
            ];
            if (digits.length) {
                out[pos] = digits;
                found = true;
            }
        }
        return found ? out : null;
    },

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
        if (select) select.value = PENSION720_ANALYSIS_PRESETS[presetId] ? presetId : 'basic';
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
    },

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
    },

    applySavedStrategyPrefs() {
        this.applyStrategyRequest(this.data.state.strategyPrefs?.pension720);
    },

    resetRecommendationOptions() {
        const assign = (id, value) => {
            const el = $(`#${id}`);
            if (el) el.value = value;
        };
        assign('pension720RecommendCount', 5);
        assign('pension720Seed', '');
        assign('pension720AllowedGroups', '');
        assign('pension720FixedDigits', '');
        assign('pension720ExcludedDigits', '');
        [
            'pension720DigitSumMin',
            'pension720DigitSumMax',
            'pension720OddMin',
            'pension720OddMax',
            'pension720HighMin',
            'pension720HighMax',
            'pension720UniqueDigitMin',
            'pension720MaxSameDigit'
        ].forEach((id) => {
            const el = $(`#${id}`);
            if (el) el.value = '';
        });
        if ($('#pension720StrategySelect')) $('#pension720StrategySelect').value = 'mixed_balance';
        this.applyAnalysisPreset('basic');
        const request = this.getStrategyRequestFromUI();
        this.data.setStrategyPrefs('pension720', request);
        this.data.save();
        UIManager.toast('연금복권 추천 옵션이 초기화되었습니다.');
    },

    resetCampaignOptions(force = true) {
        const defaults = {
            pension720CampaignStartDraw: this.getSuggestedNextDrawNo(),
            pension720CampaignWeeks: 4,
            pension720CampaignSetsPerDraw: 3
        };
        Object.entries(defaults).forEach(([id, value]) => {
            const el = $(`#${id}`);
            if (!el) return;
            if (!force && String(el.value || '').trim()) return;
            el.value = String(value);
        });
    }
};
