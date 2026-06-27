import { AUTO_STRATEGY_IDS } from './constants.js';
import { clamp01, computeDeltaAffinity, normalizeAround, normalizeRatio } from './math.js';

export const strategyWeightComputeMethods = {
    computeWeightsFromNormalized(normalized, sourceData, options = {}) {
        const ctx =
            options.context ||
            this.buildContext(sourceData, normalized.params.lookbackWindow, {
                sourceDataSorted: options.sourceDataSorted
            });
        if (AUTO_STRATEGY_IDS.has(normalized.strategyId)) {
            const adaptive = this.resolveAdaptiveWeights(normalized, sourceData, ctx);
            return {
                weights: adaptive.weights,
                request: normalized,
                context: ctx,
                adaptive: adaptive.adaptive
            };
        }

        const {
            totalDraws,
            recentDrawCount,
            freq,
            recentFreq,
            pendingGap,
            averageGap,
            pairCounts,
            recentPairCounts,
            endDigitRecent,
            zoneRecent,
            lastDraw
        } = ctx;

        const weights = Array(46).fill(1);
        const freqMax = Math.max(...freq.slice(1), 1);
        const recentMax = Math.max(...recentFreq.slice(1), 1);
        const pairMax = Math.max(...pairCounts.slice(1), 1);
        const recentPairMax = Math.max(...recentPairCounts.slice(1), 1);
        const endMax = Math.max(...endDigitRecent, 1);
        const zoneMax = Math.max(...zoneRecent, 1);
        const totalWindow = Math.max(totalDraws, 1);
        const recentWindow = Math.max(recentDrawCount, 1);
        const isWheel = normalized.strategyId === 'wheel_full' || normalized.strategyId === 'wheel_reduced_t3';
        const isAdjacency = normalized.strategyId === 'adjacency_bias';
        const isDeltaPattern = normalized.strategyId === 'delta_gap_pattern';
        const lastDrawSet =
            isAdjacency || normalized.strategyId === 'carryover_repeat_control' ? new Set(lastDraw) : null;

        let avgDelta = 0;
        if (isDeltaPattern && lastDraw.length >= 2) {
            let deltaSum = 0;
            for (let i = 0; i < lastDraw.length - 1; i++) {
                deltaSum += lastDraw[i + 1] - lastDraw[i];
            }
            avgDelta = deltaSum / Math.max(lastDraw.length - 1, 1);
        }

        const bayesValues = Array(46).fill(0);
        for (let n = 1; n <= 45; n++) {
            bayesValues[n] = (freq[n] + recentFreq[n] * 1.5 + 1) / (totalWindow + recentWindow * 1.5 + 2);
        }
        const bayesMax = Math.max(...bayesValues.slice(1), 0.0001);

        for (let n = 1; n <= 45; n++) {
            const g = normalizeRatio(freq[n], freqMax);
            const r = normalizeRatio(recentFreq[n], recentMax);
            const gapCount = Number.isFinite(pendingGap[n]) ? pendingGap[n] : 0;
            const avgGap = Math.max(Number(averageGap[n] || 1), 1);
            const overdueRatio = Math.min((gapCount + 1) / avgGap, 3);
            const overdueNorm = clamp01(overdueRatio / 3);
            const gapBalance = normalizeAround(overdueRatio, 1.05, 1.45);
            const p = normalizeRatio(pairCounts[n], pairMax);
            const recentPair = normalizeRatio(recentPairCounts[n], recentPairMax);
            const zoneIdx = n <= 15 ? 0 : n <= 30 ? 1 : 2;
            const zoneBal = 1 - normalizeRatio(zoneRecent[zoneIdx], zoneMax);
            const endBal = 1 - normalizeRatio(endDigitRecent[n % 10], endMax);
            const longRate = freq[n] / totalWindow;
            const recentRate = recentFreq[n] / recentWindow;
            const liftRaw = longRate > 0 ? recentRate / longRate : recentRate > 0 ? 2 : 1;
            const momentumNorm = clamp01((liftRaw - 0.5) / 1.5);
            const reverseMomentum = 1 - momentumNorm;
            const stability = clamp01(1 - Math.abs(recentRate - longRate) / Math.max(longRate, 1 / totalWindow));
            const bayes = clamp01(bayesValues[n] / bayesMax);

            let adj = 0;
            if (lastDrawSet?.has(n)) adj += 0.2;
            if (lastDrawSet?.has(n - 1)) adj += 0.45;
            if (lastDrawSet?.has(n + 1)) adj += 0.45;

            const deltaAffinity = computeDeltaAffinity(n, lastDraw, avgDelta);
            const hotCore = g * 0.35 + r * 0.35 + momentumNorm * 0.3;
            const coldCore = overdueNorm * 0.55 + (1 - g) * 0.2 + reverseMomentum * 0.25;
            const balanceCore = zoneBal * 0.45 + endBal * 0.2 + stability * 0.15 + gapBalance * 0.2;
            const pairCore = recentPair * 0.55 + p * 0.3 + r * 0.15;
            const consensusCore = hotCore * 0.25 + coldCore * 0.2 + pairCore * 0.2 + balanceCore * 0.15 + bayes * 0.2;

            if (normalized.strategyId === 'random_baseline') {
                weights[n] = 1;
            } else if (normalized.strategyId === 'ensemble_weighted') {
                weights[n] =
                    0.6 +
                    bayes * 0.35 +
                    r * 0.35 +
                    overdueNorm * 0.2 +
                    gapBalance * 0.2 +
                    recentPair * 0.15 +
                    zoneBal * 0.1;
            } else if (normalized.strategyId === 'consensus_portfolio') {
                weights[n] = 0.65 + consensusCore * 1.1 + gapBalance * 0.15;
            } else if (normalized.strategyId === 'bayesian_smooth') {
                weights[n] = 0.7 + bayes * 0.8 + stability * 0.25 + r * 0.2 + zoneBal * 0.15;
            } else if (normalized.strategyId === 'momentum_recent') {
                weights[n] = 0.65 + hotCore * 0.95 + recentPair * 0.2 + bayes * 0.1;
            } else if (normalized.strategyId === 'mean_reversion_cycle') {
                weights[n] = 0.65 + coldCore * 1.0 + gapBalance * 0.25 + zoneBal * 0.1;
            } else if (normalized.strategyId === 'hot_frequency') {
                weights[n] = 0.7 + hotCore * 0.95 + bayes * 0.1;
            } else if (normalized.strategyId === 'cold_frequency') {
                weights[n] = 0.7 + coldCore * 0.95 + gapBalance * 0.25;
            } else if (normalized.strategyId === 'recency_gap') {
                weights[n] = 0.65 + r * 0.35 + overdueNorm * 0.65 + gapBalance * 0.35 + momentumNorm * 0.15;
            } else if (normalized.strategyId === 'balance_oe_hl') {
                weights[n] = 0.75 + balanceCore * 0.9 + bayes * 0.15;
            } else if (normalized.strategyId === 'stat_ac_sum') {
                weights[n] = 0.75 + bayes * 0.35 + pairCore * 0.25 + gapBalance * 0.15 + stability * 0.25;
            } else if (normalized.strategyId === 'pair_cooccurrence') {
                weights[n] = 0.7 + pairCore * 1.0 + bayes * 0.1;
            } else if (normalized.strategyId === 'adjacency_bias') {
                weights[n] = 0.65 + hotCore * 0.4 + adj * 0.9 + gapBalance * 0.1;
            } else if (normalized.strategyId === 'zone_split_3band') {
                weights[n] = 0.7 + zoneBal * 0.75 + endBal * 0.25 + r * 0.2 + bayes * 0.15;
            } else if (normalized.strategyId === 'wheel_full' || normalized.strategyId === 'wheel_reduced_t3') {
                weights[n] = 0.75 + bayes * 0.3 + hotCore * 0.35 + pairCore * 0.25;
            } else if (normalized.strategyId === 'skip_hit_weighted') {
                weights[n] = 0.65 + overdueNorm * 0.8 + gapBalance * 0.45 + reverseMomentum * 0.15;
            } else if (normalized.strategyId === 'last_digit_balance') {
                weights[n] = 0.7 + endBal * 0.85 + balanceCore * 0.2 + g * 0.15;
            } else if (normalized.strategyId === 'delta_gap_pattern') {
                weights[n] = 0.65 + deltaAffinity * 0.85 + bayes * 0.2 + r * 0.15;
            } else if (normalized.strategyId === 'carryover_repeat_control') {
                const repeatPenalty = lastDrawSet?.has(n) ? 0.45 : 1.0;
                weights[n] = (0.7 + coldCore * 0.45 + bayes * 0.15 + gapBalance * 0.2) * repeatPenalty;
            } else {
                weights[n] = 0.7 + consensusCore * 0.95;
            }
        }

        if (isWheel) {
            for (let n = 1; n <= 45; n++) {
                weights[n] = Math.max(weights[n], 0.1);
            }
        }

        return { weights, request: normalized, context: ctx, adaptive: null };
    }
};