import { passesFilters } from '../StrategyFilters.js';
import { AdvancedMonteCarlo } from '../MonteCarlo.js';
import { FIXED_PRIZE_BY_RANK, resolvePayoutMode } from './shared.js';

function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function sortCandidate(numbers) {
    const candidate = [...(numbers || [])]
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
        .sort((a, b) => a - b);
    if (candidate.length !== 6) return null;
    for (let i = 1; i < candidate.length; i++) {
        if (candidate[i] === candidate[i - 1]) return null;
    }
    return candidate;
}

function scoreByDistance(value, stats = {}, fallbackSpread = 10) {
    const median = Number.isFinite(stats?.median) ? stats.median : value;
    const std = Number.isFinite(stats?.std) ? stats.std : 1;
    const spread = Math.max(std * 1.6, fallbackSpread, 1);
    return clamp01(1 - Math.abs(value - median) / spread);
}

function getRecommendationMix(strategyId) {
    switch (strategyId) {
        case 'pair_cooccurrence':
            return { weight: 0.3, pair: 0.4, profile: 0.15, gap: 0.15 };
        case 'stat_ac_sum':
            return { weight: 0.3, pair: 0.15, profile: 0.4, gap: 0.15 };
        case 'balance_oe_hl':
        case 'zone_split_3band':
        case 'last_digit_balance':
            return { weight: 0.28, pair: 0.12, profile: 0.45, gap: 0.15 };
        case 'cold_frequency':
        case 'mean_reversion_cycle':
        case 'skip_hit_weighted':
            return { weight: 0.28, pair: 0.14, profile: 0.2, gap: 0.38 };
        case 'momentum_recent':
        case 'hot_frequency':
        case 'adjacency_bias':
            return { weight: 0.4, pair: 0.2, profile: 0.18, gap: 0.22 };
        case 'consensus_portfolio':
        case 'bayesian_smooth':
            return { weight: 0.34, pair: 0.22, profile: 0.24, gap: 0.2 };
        default:
            return { weight: 0.34, pair: 0.2, profile: 0.24, gap: 0.22 };
    }
}

export const strategyEvaluationMethods = {
    scoreSetCandidate(numbers, request, options = {}) {
        const candidate = sortCandidate(numbers);
        if (!candidate) return null;

        const normalized =
            options.normalizedRequest || options.execution?.normalizedRequest || this.normalizeRequest(request);
        const sourceData = options.sourceData || options.execution?.sourceData || this.data;
        const computed = options.execution
            ? {
                  weights: options.weights || options.execution.weights,
                  context: options.context || options.execution.context,
                  adaptive: options.execution.adaptive || null
              }
            : this.computeWeightsFromNormalized(normalized, sourceData, {
                  context: options.context
              });
        const weights = options.weights || computed.weights || Array(46).fill(1);
        const ctx =
            options.context || computed.context || this.buildContext(sourceData, normalized.params.lookbackWindow);
        const weightMax = Math.max(...weights.slice(1), 1);
        const pairMatrix = ctx.recentPairMatrix || ctx.pairMatrix || [];
        const pairMatrixMax = Math.max(ctx.recentPairMatrixMax || 0, ctx.pairMatrixMax || 0, 1);
        const pendingGap = ctx.pendingGap || [];
        const averageGap = ctx.averageGap || [];
        const lastDrawSet = new Set(ctx.lastDraw || []);
        const scoreMix = getRecommendationMix(normalized.strategyId);

        const weightScore = candidate.reduce((acc, n) => acc + (weights[n] || 0) / weightMax, 0) / candidate.length;

        let pairSynergyRaw = 0;
        let pairCount = 0;
        for (let i = 0; i < candidate.length; i++) {
            for (let j = i + 1; j < candidate.length; j++) {
                pairSynergyRaw += (pairMatrix?.[candidate[i]]?.[candidate[j]] || 0) / pairMatrixMax;
                pairCount++;
            }
        }
        const pairSynergy = pairCount > 0 ? pairSynergyRaw / pairCount : 0;

        const gapBalanceScore =
            candidate.reduce((acc, n) => {
                const ratio = Math.min(((pendingGap[n] || 0) + 1) / Math.max(averageGap[n] || 1, 1), 3);
                return acc + clamp01(1 - Math.abs(ratio - 1.05) / 1.45);
            }, 0) / candidate.length;

        const sum = AdvancedMonteCarlo.calculateSum(candidate);
        const ac = AdvancedMonteCarlo.calculateAC(candidate);
        const sumScore = scoreByDistance(sum, ctx.recentSumStats || ctx.drawSumStats, 24);
        const acScore = scoreByDistance(ac, ctx.recentAcStats || ctx.drawAcStats, 1.75);
        const zoneCoverage = new Set(candidate.map((n) => (n <= 15 ? 0 : n <= 30 ? 1 : 2))).size / 3;
        const endDigitScore = new Set(candidate.map((n) => n % 10)).size / 6;
        const overlapLast = candidate.reduce((acc, n) => acc + (lastDrawSet.has(n) ? 1 : 0), 0);
        const carryScore = clamp01(1 - Math.max(overlapLast - 1, 0) / 3);
        const profileScore =
            sumScore * 0.32 + acScore * 0.28 + zoneCoverage * 0.2 + endDigitScore * 0.1 + carryScore * 0.1;

        const totalScore =
            weightScore * scoreMix.weight +
            pairSynergy * scoreMix.pair +
            profileScore * scoreMix.profile +
            gapBalanceScore * scoreMix.gap;

        return {
            score: Number(totalScore.toFixed(6)),
            breakdown: {
                weightScore: Number(weightScore.toFixed(6)),
                pairSynergy: Number(pairSynergy.toFixed(6)),
                gapBalanceScore: Number(gapBalanceScore.toFixed(6)),
                profileScore: Number(profileScore.toFixed(6)),
                sumScore: Number(sumScore.toFixed(6)),
                acScore: Number(acScore.toFixed(6)),
                zoneCoverage: Number(zoneCoverage.toFixed(6)),
                endDigitScore: Number(endDigitScore.toFixed(6)),
                carryScore: Number(carryScore.toFixed(6)),
                overlapLast
            }
        };
    },

    explainSet(numbers, request, options = {}) {
        const candidate = sortCandidate(numbers);
        if (!candidate) return null;
        const normalized = this.normalizeRequest(request);
        const sourceData = options.sourceData || this.data;
        const {
            weights,
            context: ctx,
            adaptive
        } = this.computeWeightsFromNormalized(normalized, sourceData, {
            context: options.context
        });
        const totalDraws = Math.max(ctx.totalDraws, 1);
        const freqMax = Math.max(...ctx.freq.slice(1), 1);
        const recentMax = Math.max(...ctx.recentFreq.slice(1), 1);
        const pairMax = Math.max(...(ctx.recentPairCounts || ctx.pairCounts).slice(1), 1);
        const recentWindow = Math.max(ctx.recentDrawCount || 0, 1);
        const longWindow = Math.max(ctx.totalDraws || 0, 1);
        const ranking = this.scoreSetCandidate(candidate, normalized, {
            normalizedRequest: normalized,
            sourceData,
            context: ctx,
            weights
        });

        const numberSignals = candidate.map((n) => {
            const lastSeen = ctx.lastSeen[n];
            const gap = lastSeen >= 0 ? ctx.totalDraws - 1 - lastSeen : ctx.totalDraws;
            const longRate = ctx.freq[n] / longWindow;
            const recentRate = ctx.recentFreq[n] / recentWindow;
            const liftRaw = longRate > 0 ? recentRate / longRate : recentRate > 0 ? 2 : 1;
            const overdueRatio = Math.min((gap + 1) / Math.max(ctx.averageGap[n] || 1, 1), 3);
            const bayesScore = (ctx.freq[n] + ctx.recentFreq[n] * 1.5 + 1) / (longWindow + recentWindow * 1.5 + 2);
            return {
                number: n,
                weight: Number((weights[n] || 0).toFixed(6)),
                frequencyScore: Number((ctx.freq[n] / freqMax).toFixed(4)),
                recencyScore: Number((ctx.recentFreq[n] / recentMax).toFixed(4)),
                gapScore: Number((gap / totalDraws).toFixed(4)),
                pairScore: Number(((ctx.recentPairCounts || ctx.pairCounts)[n] / pairMax).toFixed(4)),
                trendScore: Number(clamp01((liftRaw - 0.5) / 1.5).toFixed(4)),
                overdueRatio: Number(overdueRatio.toFixed(4)),
                bayesScore: Number(bayesScore.toFixed(4))
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
                ac: setAc,
                recommendationScore: Number(ranking?.score || 0),
                pairSynergy: Number(ranking?.breakdown?.pairSynergy || 0),
                profileScore: Number(ranking?.breakdown?.profileScore || 0),
                gapBalanceScore: Number(ranking?.breakdown?.gapBalanceScore || 0)
            },
            adaptive: adaptive || null,
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
