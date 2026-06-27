import { AdvancedMonteCarlo } from '../../MonteCarlo.js';
import { clamp01, getRecommendationMix, scoreByDistance, sortCandidate } from './helpers.js';

export const strategyEvaluationScoreMethods = {
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
    }
};