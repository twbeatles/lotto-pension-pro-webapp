import { passesFilters } from '../../StrategyFilters.js';
import { AdvancedMonteCarlo } from '../../MonteCarlo.js';
import { clamp01, sortCandidate } from './helpers.js';

export const strategyEvaluationExplainMethods = {
    explainSet(numbers, request, options = {}) {
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
                  context: options.context,
                  sourceDataSorted: options.sourceDataSorted
              });
        const weights = options.weights || computed.weights || Array(46).fill(1);
        const ctx =
            options.context ||
            computed.context ||
            this.buildContext(sourceData, normalized.params.lookbackWindow, {
                sourceDataSorted: options.sourceDataSorted
            });
        const adaptive = computed.adaptive || null;
        const totalDraws = Math.max(ctx.totalDraws, 1);
        const freqMax = Math.max(...ctx.freq.slice(1), 1);
        const recentMax = Math.max(...ctx.recentFreq.slice(1), 1);
        const pairMax = Math.max(...(ctx.recentPairCounts || ctx.pairCounts).slice(1), 1);
        const recentWindow = Math.max(ctx.recentDrawCount || 0, 1);
        const longWindow = Math.max(ctx.totalDraws || 0, 1);
        const ranking = this.scoreSetCandidate(candidate, normalized, {
            execution: options.execution,
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
    }
};