import { passesFilters } from '../StrategyFilters.js';
import { AdvancedMonteCarlo } from '../MonteCarlo.js';
import { FIXED_PRIZE_BY_RANK, resolvePayoutMode } from './shared.js';
export const strategyEvaluationMethods = {
    explainSet(numbers, request, options = {}) {
        const candidate = [...(numbers || [])].map(Number).filter((n) => n >= 1 && n <= 45).sort((a, b) => a - b);
        const normalized = this.normalizeRequest(request);
        const sourceData = options.sourceData || this.data;
        const { weights } = this.computeWeightsFromNormalized(normalized, sourceData);
        const ctx = this.buildContext(sourceData, normalized.params.lookbackWindow);
        const totalDraws = Math.max(ctx.totalDraws, 1);
        const freqMax = Math.max(...ctx.freq.slice(1), 1);
        const recentMax = Math.max(...ctx.recentFreq.slice(1), 1);
        const pairMax = Math.max(...ctx.pairCounts.slice(1), 1);

        const numberSignals = candidate.map((n) => {
            const lastSeen = ctx.lastSeen[n];
            const gap = lastSeen >= 0 ? (ctx.totalDraws - 1 - lastSeen) : ctx.totalDraws;
            return {
                number: n,
                weight: Number((weights[n] || 0).toFixed(6)),
                frequencyScore: Number((ctx.freq[n] / freqMax).toFixed(4)),
                recencyScore: Number((ctx.recentFreq[n] / recentMax).toFixed(4)),
                gapScore: Number((gap / totalDraws).toFixed(4)),
                pairScore: Number((ctx.pairCounts[n] / pairMax).toFixed(4))
            };
        });

        const setWeight = candidate.reduce((acc, n) => acc + (weights[n] || 0), 0);
        const setSum = AdvancedMonteCarlo.calculateSum(candidate);
        const setAc = AdvancedMonteCarlo.calculateAC(candidate);
        const passFilter = passesFilters(candidate, normalized.filters);

        return {
            strategyId: normalized.strategyId,
            evidenceTier: normalized.evidenceTier,
            numbers: candidate,
            filtersPass: passFilter,
            summary: {
                setWeight: Number(setWeight.toFixed(6)),
                sum: setSum,
                ac: setAc
            },
            signals: numberSignals
        };
    },

    rankTicket(myNums, winNums, bonus) {
        let hit = 0;
        let hasBonus = false;
        myNums.forEach((n) => {
            if (winNums.includes(n)) hit++;
            if (n === bonus) hasBonus = true;
        });
        if (hit === 6) return 1;
        if (hit === 5 && hasBonus) return 2;
        if (hit === 5) return 3;
        if (hit === 4) return 4;
        if (hit === 3) return 5;
        return 0;
    },

    evaluateTicketSet(ticket, draw, options = {}) {
        if (!Array.isArray(ticket) || ticket.length !== 6) return { rank: 0, prize: 0 };
        if (!draw || !Array.isArray(draw.numbers)) return { rank: 0, prize: 0 };
        const rank = this.rankTicket(ticket, draw.numbers, draw.bonus);
        if (rank < 1 || rank > 5) return { rank: 0, prize: 0 };

        const payoutMode = resolvePayoutMode(options.payoutMode);
        if (rank === 1 && payoutMode === 'hybrid_dynamic_first') {
            const dynamicPrize = Number(draw.prize_amount || 0);
            if (Number.isFinite(dynamicPrize) && dynamicPrize > 0) {
                return { rank, prize: dynamicPrize };
            }
        }
        return { rank, prize: FIXED_PRIZE_BY_RANK[rank] || 0 };
    }
};
