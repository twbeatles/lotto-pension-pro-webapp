import { Pension720Engine } from '../../../core/Pension720Engine.js';
import { getPension720StrategyMeta } from '../../../core/Pension720StrategyCatalog.js';
import { UIManager } from '../../../core/UIManager.js';
import { CONFIG } from '../../../utils/config.js';

export const pension720CampaignGenerationMethods = {
    getCampaignRuntimeRequest(baseRequest, index = 0) {
        const seed = baseRequest?.params?.seed;
        const hasSeed = seed !== null && seed !== undefined && seed !== '' && Number.isFinite(Number(seed));
        return {
            ...baseRequest,
            params: {
                ...(baseRequest?.params || {}),
                seed: hasSeed ? Math.floor(Number(seed)) + Math.max(0, Math.floor(Number(index) || 0)) : null
            }
        };
    },

    async runCampaignRecommendation() {
        if (this.isRecommending || this.isGeneratingCampaign) return false;
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        if (!this.data.state.pension720Stats.length) {
            UIManager.toast('연금복권 데이터가 없습니다. 최신 데이터 확인을 먼저 실행해주세요.', 'error');
            return false;
        }

        const startDrawNo = Math.max(
            1,
            Math.floor(this.readNumberInput('pension720CampaignStartDraw', this.getSuggestedNextDrawNo()))
        );
        const weeks = Math.max(1, Math.floor(this.readNumberInput('pension720CampaignWeeks', 4)));
        const setsPerDraw = Math.max(1, Math.floor(this.readNumberInput('pension720CampaignSetsPerDraw', 3)));
        const totalRequested = weeks * setsPerDraw;

        if (weeks > CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS) {
            UIManager.toast(`캠페인 회차 수는 최대 ${CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS}회입니다.`, 'warning');
            return false;
        }
        if (setsPerDraw > CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK) {
            UIManager.toast(`회차당 세트 수는 최대 ${CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK}세트입니다.`, 'warning');
            return false;
        }
        if (totalRequested > CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS) {
            UIManager.toast(`캠페인 총 번호 수는 최대 ${CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS}개입니다.`, 'warning');
            return false;
        }

        const localToken = ++this.campaignToken;
        this.isGeneratingCampaign = true;
        this.syncBusyButtons();
        try {
            const engine = new Pension720Engine(this.data.state.pension720Stats);
            const baseRequest = this.getStrategyRequestFromUI();
            const campaignId = this.data.createId('p720_campaign');
            const strategyLabel = getPension720StrategyMeta(baseRequest.strategyId).label;
            const createdAt = new Date().toISOString();
            const tickets = [];
            let totalCreated = 0;

            for (let i = 0; i < weeks; i++) {
                const targetDrawNo = startDrawNo + i;
                const runtimeRequest = this.getCampaignRuntimeRequest(baseRequest, i);
                const recommendations = engine.recommend({
                    setCount: setsPerDraw,
                    request: runtimeRequest
                });
                recommendations.forEach((recommendation) => {
                    tickets.push({
                        group: recommendation.group,
                        number: recommendation.number,
                        score: recommendation.score,
                        source: 'campaign',
                        targetDrawNo,
                        campaignId,
                        strategyRequest: runtimeRequest,
                        memo: `${strategyLabel} · ${startDrawNo}-${startDrawNo + weeks - 1}회`,
                        createdAt
                    });
                    totalCreated++;
                });
            }

            if (localToken !== this.campaignToken) return false;
            const result = this.data.addPension720TicketsBulk(tickets, { silent: true });
            let campaign = null;
            if (result.inserted > 0) {
                campaign = this.data.addPension720Campaign({
                    id: campaignId,
                    name: `${startDrawNo}회 시작 ${weeks}회`,
                    startDrawNo,
                    weeks,
                    setsPerDraw,
                    strategyRequest: baseRequest,
                    createdAt
                });
            }
            this.data.setStrategyPrefs('pension720', baseRequest);
            this.data.save();
            this.renderSavedTickets();
            this.renderCampaigns();

            if (totalCreated < totalRequested) {
                UIManager.toast(`필터 조건으로 ${totalCreated}/${totalRequested}개만 생성되었습니다.`, 'warning', 3500);
            }
            if (campaign && result.inserted > 0) {
                UIManager.toast(`연금복권 캠페인 생성 완료: 저장 번호 ${result.inserted}개 반영`, 'success');
            } else if (totalCreated > 0) {
                UIManager.toast('생성된 연금복권 번호가 모두 중복되어 캠페인을 저장하지 않았습니다.', 'warning', 3500);
            } else {
                UIManager.toast('생성된 연금복권 번호가 없어 캠페인을 저장하지 않았습니다.', 'warning', 3500);
            }
            return Boolean(campaign);
        } finally {
            if (localToken === this.campaignToken) {
                this.isGeneratingCampaign = false;
                this.syncBusyButtons();
            }
        }
    }
};