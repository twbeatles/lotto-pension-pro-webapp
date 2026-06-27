import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';

export const pension720OptionResetMethods = {
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