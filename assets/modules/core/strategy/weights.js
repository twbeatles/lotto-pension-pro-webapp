import { getStrategyMeta } from '../StrategyCatalog.js';

const AUTO_STRATEGY_IDS = new Set(['auto_recent_top', 'auto_ensemble_top3']);
const ADAPTIVE_SOURCE_STRATEGIES = Object.freeze([
    'consensus_portfolio',
    'ensemble_weighted',
    'bayesian_smooth',
    'momentum_recent',
    'mean_reversion_cycle',
    'zone_split_3band',
    'stat_ac_sum',
    'pair_cooccurrence',
    'adjacency_bias',
    'recency_gap',
    'balance_oe_hl',
    'hot_frequency',
    'cold_frequency'
]);

function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function normalizeRatio(value, max) {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
    return clamp01(value / max);
}

function normalizeAround(value, center = 1, radius = 1.25) {
    return clamp01(1 - (Math.abs(value - center) / radius));
}

function computeDeltaAffinity(number, lastDraw = [], avgDelta = 0) {
    if (!avgDelta || !Array.isArray(lastDraw) || !lastDraw.length) return 0.5;
    let best = 0;
    for (const base of lastDraw) {
        const diff = Math.abs(Math.abs(number - base) - avgDelta);
        const score = clamp01(1 - (diff / Math.max(avgDelta * 1.25, 4)));
        if (score > best) best = score;
    }
    return best;
}

function normalizeWeights(weights = []) {
    const max = Math.max(...weights.slice(1), 1);
    return weights.map((value, index) => (index === 0 ? 0 : Math.max(Number(value || 0), 0) / max));
}

function createAdaptiveKey(normalized, sourceData = []) {
    const lastDrawNo = Number(sourceData[sourceData.length - 1]?.draw_no || 0);
    return JSON.stringify({
        strategyId: normalized.strategyId,
        lookbackWindow: normalized.params?.lookbackWindow,
        simulationCount: normalized.params?.simulationCount,
        seed: normalized.params?.seed,
        filters: normalized.filters || {},
        sourceLength: sourceData.length,
        lastDrawNo
    });
}

export const strategyWeightMethods = {
    computeWeights(request, sourceData, options = {}) {
        const normalized = this.normalizeRequest(request);
        return this.computeWeightsFromNormalized(normalized, sourceData, options);
    },

    getAdaptiveCandidateStrategies() {
        return [...ADAPTIVE_SOURCE_STRATEGIES];
    },

    createStrategyVariantRequest(normalized, strategyId) {
        return {
            ...normalized,
            strategyId,
            evidenceTier: getStrategyMeta(strategyId).tier,
            params: { ...(normalized.params || {}) },
            filters: { ...(normalized.filters || {}) }
        };
    },

    evaluateRecentStrategyPerformance(normalized, sourceData, strategyId, options = {}) {
        const evaluationWindow = Math.min(Math.max(Number(options.evaluationWindow || normalized.params?.lookbackWindow || 20), 10), 30);
        const evaluationSetCount = Math.min(Math.max(Number(options.evaluationSetCount || 5), 3), 5);
        const simulationCount = Math.min(Math.max(Number(options.simulationCount || normalized.params?.simulationCount || 5000), 1200), 2400);
        const startIdx = Math.max(1, sourceData.length - evaluationWindow);
        let draws = 0;
        let totalSets = 0;
        let totalHitCount = 0;
        let totalBestHit = 0;
        let best4PlusDraws = 0;
        let best3PlusDraws = 0;
        const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        for (let idx = startIdx; idx < sourceData.length; idx++) {
            const history = sourceData.slice(0, idx);
            const actual = sourceData[idx];
            if (!history.length || !actual?.numbers?.length) continue;

            const engine = new this.constructor(history);
            const evalRequest = this.createStrategyVariantRequest(normalized, strategyId);
            const seedBase = Number.isFinite(Number(normalized.params?.seed)) ? Number(normalized.params.seed) : 2026;
            evalRequest.params = {
                ...evalRequest.params,
                simulationCount,
                seed: seedBase + (idx * 37) + (strategyId.length * 17)
            };

            const result = engine.recommendFromSimulation(evalRequest, { setCount: evaluationSetCount });
            const sets = Array.isArray(result?.sets) ? result.sets : [];
            if (!sets.length) continue;

            draws++;
            totalSets += sets.length;

            let bestHit = 0;
            for (const set of sets) {
                const hitCount = set.reduce((acc, value) => acc + (actual.numbers.includes(value) ? 1 : 0), 0);
                totalHitCount += hitCount;
                bestHit = Math.max(bestHit, hitCount);

                const rank = engine.rankTicket(set, actual.numbers, actual.bonus);
                if (rank >= 1 && rank <= 5) {
                    rankCounts[rank] += 1;
                }
            }

            totalBestHit += bestHit;
            if (bestHit >= 4) best4PlusDraws++;
            if (bestHit >= 3) best3PlusDraws++;
        }

        const avgBestHit = totalBestHit / Math.max(draws, 1);
        const avgHitPerSet = totalHitCount / Math.max(totalSets, 1);
        const drawRateBest4Plus = (best4PlusDraws / Math.max(draws, 1)) * 100;
        const drawRateBest3Plus = (best3PlusDraws / Math.max(draws, 1)) * 100;
        const compositeScore = (
            (avgBestHit * 100) +
            (drawRateBest4Plus * 4.0) +
            (drawRateBest3Plus * 1.5) +
            (avgHitPerSet * 12)
        );

        return {
            strategyId,
            draws,
            avgBestHit: Number(avgBestHit.toFixed(4)),
            avgHitPerSet: Number(avgHitPerSet.toFixed(4)),
            drawRateBest4Plus: Number(drawRateBest4Plus.toFixed(2)),
            drawRateBest3Plus: Number(drawRateBest3Plus.toFixed(2)),
            compositeScore: Number(compositeScore.toFixed(4)),
            rankCounts
        };
    },

    resolveAdaptiveWeights(normalized, sourceData, ctx) {
        const cacheKey = createAdaptiveKey(normalized, sourceData);
        if (this._analysisCache?.has(cacheKey)) {
            return this._analysisCache.get(cacheKey);
        }

        const evaluationWindow = Math.min(Math.max(Number(normalized.params?.lookbackWindow || 20), 10), 30);
        const ranking = this.getAdaptiveCandidateStrategies()
            .map((strategyId) => this.evaluateRecentStrategyPerformance(normalized, sourceData, strategyId, {
                evaluationWindow
            }))
            .filter((row) => row.draws > 0)
            .sort((a, b) => {
                const scoreDelta = Number(b.compositeScore || 0) - Number(a.compositeScore || 0);
                if (scoreDelta !== 0) return scoreDelta;
                const bestHitDelta = Number(b.avgBestHit || 0) - Number(a.avgBestHit || 0);
                if (bestHitDelta !== 0) return bestHitDelta;
                return String(a.strategyId).localeCompare(String(b.strategyId));
            });

        const fallbackId = 'consensus_portfolio';
        const selectedRows = normalized.strategyId === 'auto_recent_top'
            ? ranking.slice(0, 1)
            : ranking.slice(0, 3);
        if (!selectedRows.length) {
            selectedRows.push({
                strategyId: fallbackId,
                draws: 0,
                avgBestHit: 0,
                avgHitPerSet: 0,
                drawRateBest4Plus: 0,
                drawRateBest3Plus: 0,
                compositeScore: 1,
                rankCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
            });
        }

        const selectedStrategies = selectedRows.map((row) => {
            const request = this.createStrategyVariantRequest(normalized, row.strategyId);
            const computed = this.computeWeightsFromNormalized(request, sourceData, { context: ctx });
            return {
                ...row,
                weights: computed.weights
            };
        });

        let weights = selectedStrategies[0].weights;
        if (normalized.strategyId === 'auto_ensemble_top3') {
            const strengths = selectedStrategies.map((item, index) => Math.max(Number(item.compositeScore || 0), 1 + (selectedStrategies.length - index)));
            const strengthSum = strengths.reduce((acc, value) => acc + value, 0) || 1;
            const normalizedVectors = selectedStrategies.map((item) => normalizeWeights(item.weights));
            weights = Array(46).fill(0);
            for (let n = 1; n <= 45; n++) {
                let next = 0;
                for (let i = 0; i < selectedStrategies.length; i++) {
                    next += normalizedVectors[i][n] * (strengths[i] / strengthSum);
                }
                weights[n] = Math.max(next, 0.0001);
            }
        }

        const adaptive = {
            mode: normalized.strategyId === 'auto_recent_top' ? 'recent_top_1' : 'recent_top_3_blend',
            evaluationWindow,
            selectedStrategies: selectedStrategies.map((item) => ({
                strategyId: item.strategyId,
                avgBestHit: item.avgBestHit,
                avgHitPerSet: item.avgHitPerSet,
                drawRateBest4Plus: item.drawRateBest4Plus,
                drawRateBest3Plus: item.drawRateBest3Plus,
                compositeScore: item.compositeScore
            })),
            ranking: ranking.slice(0, 5).map((item) => ({
                strategyId: item.strategyId,
                avgBestHit: item.avgBestHit,
                avgHitPerSet: item.avgHitPerSet,
                drawRateBest4Plus: item.drawRateBest4Plus,
                drawRateBest3Plus: item.drawRateBest3Plus,
                compositeScore: item.compositeScore
            }))
        };

        const resolved = { weights, adaptive };
        this._analysisCache?.set(cacheKey, resolved);
        return resolved;
    },

    computeWeightsFromNormalized(normalized, sourceData, options = {}) {
        const ctx = options.context || this.buildContext(sourceData, normalized.params.lookbackWindow);
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
        const lastDrawSet = isAdjacency || normalized.strategyId === 'carryover_repeat_control'
            ? new Set(lastDraw)
            : null;

        let avgDelta = 0;
        if (isDeltaPattern && lastDraw.length >= 2) {
            let deltaSum = 0;
            for (let i = 0; i < lastDraw.length - 1; i++) {
                deltaSum += (lastDraw[i + 1] - lastDraw[i]);
            }
            avgDelta = deltaSum / Math.max(lastDraw.length - 1, 1);
        }

        const bayesValues = Array(46).fill(0);
        for (let n = 1; n <= 45; n++) {
            bayesValues[n] = (freq[n] + (recentFreq[n] * 1.5) + 1) / (totalWindow + (recentWindow * 1.5) + 2);
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
            const zoneIdx = n <= 15 ? 0 : (n <= 30 ? 1 : 2);
            const zoneBal = 1 - normalizeRatio(zoneRecent[zoneIdx], zoneMax);
            const endBal = 1 - normalizeRatio(endDigitRecent[n % 10], endMax);
            const longRate = freq[n] / totalWindow;
            const recentRate = recentFreq[n] / recentWindow;
            const liftRaw = longRate > 0 ? (recentRate / longRate) : (recentRate > 0 ? 2 : 1);
            const momentumNorm = clamp01((liftRaw - 0.5) / 1.5);
            const reverseMomentum = 1 - momentumNorm;
            const stability = clamp01(1 - (Math.abs(recentRate - longRate) / Math.max(longRate, 1 / totalWindow)));
            const bayes = clamp01(bayesValues[n] / bayesMax);

            let adj = 0;
            if (lastDrawSet?.has(n)) adj += 0.2;
            if (lastDrawSet?.has(n - 1)) adj += 0.45;
            if (lastDrawSet?.has(n + 1)) adj += 0.45;

            const deltaAffinity = computeDeltaAffinity(n, lastDraw, avgDelta);
            const hotCore = (g * 0.35) + (r * 0.35) + (momentumNorm * 0.30);
            const coldCore = (overdueNorm * 0.55) + ((1 - g) * 0.20) + (reverseMomentum * 0.25);
            const balanceCore = (zoneBal * 0.45) + (endBal * 0.20) + (stability * 0.15) + (gapBalance * 0.20);
            const pairCore = (recentPair * 0.55) + (p * 0.30) + (r * 0.15);
            const consensusCore = (hotCore * 0.25) + (coldCore * 0.20) + (pairCore * 0.20) + (balanceCore * 0.15) + (bayes * 0.20);

            if (normalized.strategyId === 'random_baseline') {
                weights[n] = 1;
            } else if (normalized.strategyId === 'ensemble_weighted') {
                weights[n] = 0.6 + (bayes * 0.35) + (r * 0.35) + (overdueNorm * 0.20) + (gapBalance * 0.20) + (recentPair * 0.15) + (zoneBal * 0.10);
            } else if (normalized.strategyId === 'consensus_portfolio') {
                weights[n] = 0.65 + (consensusCore * 1.10) + (gapBalance * 0.15);
            } else if (normalized.strategyId === 'bayesian_smooth') {
                weights[n] = 0.7 + (bayes * 0.80) + (stability * 0.25) + (r * 0.20) + (zoneBal * 0.15);
            } else if (normalized.strategyId === 'momentum_recent') {
                weights[n] = 0.65 + (hotCore * 0.95) + (recentPair * 0.20) + (bayes * 0.10);
            } else if (normalized.strategyId === 'mean_reversion_cycle') {
                weights[n] = 0.65 + (coldCore * 1.00) + (gapBalance * 0.25) + (zoneBal * 0.10);
            } else if (normalized.strategyId === 'hot_frequency') {
                weights[n] = 0.7 + (hotCore * 0.95) + (bayes * 0.10);
            } else if (normalized.strategyId === 'cold_frequency') {
                weights[n] = 0.7 + (coldCore * 0.95) + (gapBalance * 0.25);
            } else if (normalized.strategyId === 'recency_gap') {
                weights[n] = 0.65 + (r * 0.35) + (overdueNorm * 0.65) + (gapBalance * 0.35) + (momentumNorm * 0.15);
            } else if (normalized.strategyId === 'balance_oe_hl') {
                weights[n] = 0.75 + (balanceCore * 0.90) + (bayes * 0.15);
            } else if (normalized.strategyId === 'stat_ac_sum') {
                weights[n] = 0.75 + (bayes * 0.35) + (pairCore * 0.25) + (gapBalance * 0.15) + (stability * 0.25);
            } else if (normalized.strategyId === 'pair_cooccurrence') {
                weights[n] = 0.7 + (pairCore * 1.00) + (bayes * 0.10);
            } else if (normalized.strategyId === 'adjacency_bias') {
                weights[n] = 0.65 + (hotCore * 0.40) + (adj * 0.90) + (gapBalance * 0.10);
            } else if (normalized.strategyId === 'zone_split_3band') {
                weights[n] = 0.7 + (zoneBal * 0.75) + (endBal * 0.25) + (r * 0.20) + (bayes * 0.15);
            } else if (normalized.strategyId === 'wheel_full' || normalized.strategyId === 'wheel_reduced_t3') {
                weights[n] = 0.75 + (bayes * 0.30) + (hotCore * 0.35) + (pairCore * 0.25);
            } else if (normalized.strategyId === 'skip_hit_weighted') {
                weights[n] = 0.65 + (overdueNorm * 0.80) + (gapBalance * 0.45) + (reverseMomentum * 0.15);
            } else if (normalized.strategyId === 'last_digit_balance') {
                weights[n] = 0.7 + (endBal * 0.85) + (balanceCore * 0.20) + (g * 0.15);
            } else if (normalized.strategyId === 'delta_gap_pattern') {
                weights[n] = 0.65 + (deltaAffinity * 0.85) + (bayes * 0.20) + (r * 0.15);
            } else if (normalized.strategyId === 'carryover_repeat_control') {
                const repeatPenalty = lastDrawSet?.has(n) ? 0.45 : 1.0;
                weights[n] = (0.7 + (coldCore * 0.45) + (bayes * 0.15) + (gapBalance * 0.20)) * repeatPenalty;
            } else {
                weights[n] = 0.7 + (consensusCore * 0.95);
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
