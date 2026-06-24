import { $ } from '../../utils/utils.js';
import { Pension720Engine } from '../../core/Pension720Engine.js';
import { getPension720StrategyMeta } from '../../core/Pension720StrategyCatalog.js';
import { createRuntimeSeed, hasExplicitSeed } from '../../core/strategy/runtimeEntropy.js';
import { UIManager } from '../../core/UIManager.js';
import { upsertReproductionCodeBar } from '../../utils/reproductionCode.js';
import { appendDigitBalls, clearElement, getAnalysisPresetLabelFromRequest, makeEl } from './dom.js';

export const pension720RecommendationMethods = {
    getRecommendationOptions() {
        const setCount = Math.max(1, Math.min(20, Number($('#pension720RecommendCount')?.value || 5)));
        return {
            setCount,
            request: this.getStrategyRequestFromUI()
        };
    },

    async runRecommendation() {
        if (this.isRecommending || this.isGeneratingCampaign) return;
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        if (!this.data.state.pension720Stats.length) {
            UIManager.toast('연금복권 데이터가 없습니다. 최신 데이터 확인을 먼저 실행해주세요.', 'error');
            return;
        }

        const output = $('#pension720Output');
        const options = this.getRecommendationOptions();
        const localToken = ++this.recommendationToken;
        this.isRecommending = true;
        this.syncBusyButtons();
        output?.setAttribute('aria-busy', 'true');
        try {
            this.lastRecommendations = [];
            this.data.state.pension720Results = [];
            this.data.persistTemporaryResultsToSession?.();
            const engine = new Pension720Engine(this.data.state.pension720Stats);
            this.data.setStrategyPrefs('pension720', options.request);
            this.data.save();
            this.lastRecommendationOptions = options;
            const recommendPayload = (() => {
                if (hasExplicitSeed(options.request)) {
                    this.lastRuntimeSeed = null;
                    return options;
                }
                const runtimeSeed = createRuntimeSeed();
                this.lastRuntimeSeed = runtimeSeed;
                return {
                    ...options,
                    seed: runtimeSeed,
                    request: {
                        ...options.request,
                        params: {
                            ...(options.request?.params || {}),
                            seed: runtimeSeed
                        }
                    }
                };
            })();
            this.lastRecommendations = engine.recommend(recommendPayload);
            if (localToken !== this.recommendationToken) return;
            this.data.state.pension720Results = this.lastRecommendations;
            this.data.persistTemporaryResultsToSession?.();
            this.renderRecommendations(this.lastRecommendations);
            UIManager.toast(`연금복권 추천 ${this.lastRecommendations.length}개를 만들었습니다.`, 'success');
        } finally {
            if (localToken === this.recommendationToken) {
                this.isRecommending = false;
                this.syncBusyButtons();
            }
            output?.setAttribute('aria-busy', 'false');
        }
    },

    renderRecommendations(recommendations = []) {
        const out = $('#pension720Output');
        clearElement(out);
        if (!out) return;
        const notice = $('#pension720ResultTempNotice');
        if (notice) notice.hidden = !recommendations.length;
        const request = this.lastRecommendationOptions?.request || this.getRecommendationOptions().request;
        upsertReproductionCodeBar({
            host: out,
            barId: 'pension720ReproductionCode',
            seed: this.lastRuntimeSeed,
            request
        });

        if (!recommendations.length) {
            out.appendChild(makeEl('p', 'empty-state', '추천 시작을 누르면 연금복권 번호가 표시됩니다.'));
            return;
        }

        const strategyLabel = getPension720StrategyMeta(request?.strategyId || 'mixed_balance').label;
        const analysisLabel = getAnalysisPresetLabelFromRequest(request);
        recommendations.forEach((item, index) => {
            const card = makeEl('article', 'p720-card');
            const head = makeEl('div', 'p720-card-head');
            head.appendChild(makeEl('span', 'rank-badge', `#${index + 1}`));
            head.appendChild(
                makeEl(
                    'span',
                    'badge',
                    `${item.strategyLabel || strategyLabel} · ${analysisLabel} · 점수 ${Number(item.score || 0).toFixed(1)}`
                )
            );
            card.appendChild(head);

            appendDigitBalls(card, item.number, { group: item.group });

            const reasons = makeEl('div', 'p720-reasons');
            (item.reasons || []).forEach((reason) => reasons.appendChild(makeEl('span', 'meta-badge', reason)));
            card.appendChild(reasons);

            const expansion = makeEl('p', 'p720-expansion');
            expansion.textContent = `확장 조 제안: ${item.expansionGroups.map((group) => `${group}조`).join(', ')}`;
            card.appendChild(expansion);

            const actions = makeEl('div', 'row-actions');
            const saveBtn = makeEl('button', 'btn ghost sm', '저장');
            saveBtn.type = 'button';
            saveBtn.dataset.p720Action = 'save';
            saveBtn.dataset.index = String(index);
            const expansionBtn = makeEl('button', 'btn ghost sm', '확장 조 모두 저장');
            expansionBtn.type = 'button';
            expansionBtn.dataset.p720Action = 'save-expansion';
            expansionBtn.dataset.index = String(index);
            actions.append(saveBtn, expansionBtn);
            card.appendChild(actions);

            card.appendChild(makeEl('p', 'result-disclaimer', '재미와 참고용이며 당첨을 보장하지 않습니다.'));
            out.appendChild(card);
        });
    },

    saveRecommendation(recommendation, group) {
        const strategyRequest = this.lastRecommendationOptions?.request || this.getStrategyRequestFromUI();
        const result = this.data.addPension720Ticket({
            group,
            number: recommendation.number,
            score: recommendation.score,
            source: 'recommendation',
            strategyRequest,
            memo: getPension720StrategyMeta(strategyRequest.strategyId).label
        });
        UIManager.toast(
            result.inserted ? '연금복권 번호를 저장했습니다.' : '이미 저장된 연금복권 번호입니다.',
            result.inserted ? 'success' : 'info'
        );
        this.renderSavedTickets();
    },

    saveExpansion(recommendation) {
        const groups = [recommendation.group, ...(recommendation.expansionGroups || [])];
        const now = new Date().toISOString();
        const strategyRequest = this.lastRecommendationOptions?.request || this.getStrategyRequestFromUI();
        const result = this.data.addPension720TicketsBulk(
            groups.map((group) => ({
                group,
                number: recommendation.number,
                score: recommendation.score,
                source: 'recommendation',
                strategyRequest,
                memo: getPension720StrategyMeta(strategyRequest.strategyId).label,
                createdAt: now
            }))
        );
        const truncatedText = result.truncated ? `, 보관 한도로 ${result.truncated}개는 제외됨` : '';
        UIManager.toast(
            result.inserted
                ? `확장 조 ${result.inserted}개를 저장했습니다${truncatedText}.`
                : '확장 조 번호가 모두 이미 저장되어 있습니다.',
            result.inserted ? 'success' : 'info'
        );
        this.renderSavedTickets();
    }
};
