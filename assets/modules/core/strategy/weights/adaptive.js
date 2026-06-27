import { getStrategyMeta } from '../../StrategyCatalog.js';
import { ADAPTIVE_SOURCE_STRATEGIES } from './constants.js';
import { createAdaptiveKey, normalizeWeights } from './math.js';

export const strategyWeightAdaptiveMethods = {
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
        const evaluationWindow = Math.min(
            Math.max(Number(options.evaluationWindow || normalized.params?.lookbackWindow || 20), 10),
            30
        );
        const evaluationSetCount = Math.min(Math.max(Number(options.evaluationSetCount || 5), 3), 5);
        const simulationCount = Math.min(
            Math.max(Number(options.simulationCount || normalized.params?.simulationCount || 5000), 1200),
            2400
        );
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
                seed: seedBase + idx * 37 + strategyId.length * 17
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
        const compositeScore = avgBestHit * 100 + drawRateBest4Plus * 4.0 + drawRateBest3Plus * 1.5 + avgHitPerSet * 12;

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
            .map((strategyId) =>
                this.evaluateRecentStrategyPerformance(normalized, sourceData, strategyId, {
                    evaluationWindow
                })
            )
            .filter((row) => row.draws > 0)
            .sort((a, b) => {
                const scoreDelta = Number(b.compositeScore || 0) - Number(a.compositeScore || 0);
                if (scoreDelta !== 0) return scoreDelta;
                const bestHitDelta = Number(b.avgBestHit || 0) - Number(a.avgBestHit || 0);
                if (bestHitDelta !== 0) return bestHitDelta;
                return String(a.strategyId).localeCompare(String(b.strategyId));
            });

        const fallbackId = 'consensus_portfolio';
        const selectedRows = normalized.strategyId === 'auto_recent_top' ? ranking.slice(0, 1) : ranking.slice(0, 3);
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
            const strengths = selectedStrategies.map((item, index) =>
                Math.max(Number(item.compositeScore || 0), 1 + (selectedStrategies.length - index))
            );
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
    }
};