import { $ } from '../../../utils/utils.js';
import { makeEl } from '../dom.js';

export const pension720OptionBusyButtonMethods = {
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
            campaignBtn.append(icon, document.createTextNode(this.isGeneratingCampaign ? ' 생성 중' : ' 회차 묶음 생성'));
        }
        if (resetCampaignBtn) resetCampaignBtn.disabled = anyBusy;
        if (resetOptionsBtn) resetOptionsBtn.disabled = anyBusy;
    }
};