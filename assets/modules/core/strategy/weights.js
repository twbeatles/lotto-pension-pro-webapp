export const strategyWeightMethods = {
    computeWeights(request, sourceData) {
        const normalized = this.normalizeRequest(request);
        return this.computeWeightsFromNormalized(normalized, sourceData);
    },

    computeWeightsFromNormalized(normalized, sourceData) {
        const ctx = this.buildContext(sourceData, normalized.params.lookbackWindow);
        const { totalDraws, freq, recentFreq, lastSeen, pairCounts, endDigitRecent, zoneRecent, lastDraw } = ctx;

        const weights = Array(46).fill(1);
        const freqMax = Math.max(...freq.slice(1), 1);
        const recentMax = Math.max(...recentFreq.slice(1), 1);
        const pairMax = Math.max(...pairCounts.slice(1), 1);
        const endMax = Math.max(...endDigitRecent, 1);
        const zoneMax = Math.max(...zoneRecent, 1);

        const isWheel = normalized.strategyId === 'wheel_full' || normalized.strategyId === 'wheel_reduced_t3';
        const isAdjacency = normalized.strategyId === 'adjacency_bias';
        const isDeltaPattern = normalized.strategyId === 'delta_gap_pattern';

        const lastDrawSet = isAdjacency || normalized.strategyId === 'carryover_repeat_control'
            ? new Set(lastDraw)
            : null;

        let avgDelta = 0;
        if (isDeltaPattern && lastDraw.length >= 2) {
            const sortedLastDraw = [...lastDraw].sort((a, b) => a - b);
            let deltaSum = 0;
            let deltaCount = 0;
            for (let i = 0; i < sortedLastDraw.length - 1; i++) {
                deltaSum += (sortedLastDraw[i + 1] - sortedLastDraw[i]);
                deltaCount++;
            }
            avgDelta = deltaCount > 0 ? (deltaSum / deltaCount) : 0;
        }

        for (let n = 1; n <= 45; n++) {
            const g = freq[n] / freqMax;
            const r = recentFreq[n] / recentMax;
            const gapCount = totalDraws > 0
                ? Math.max(totalDraws - 1 - lastSeen[n], 0)
                : 0;
            const gap = totalDraws > 0 ? gapCount / totalDraws : 0.5;
            const p = pairCounts[n] / pairMax;
            const zoneIdx = n <= 15 ? 0 : (n <= 30 ? 1 : 2);
            const zoneBal = 1 - (zoneRecent[zoneIdx] / zoneMax);
            const endBal = 1 - (endDigitRecent[n % 10] / endMax);

            if (normalized.strategyId === 'random_baseline') {
                weights[n] = 1;
            } else if (normalized.strategyId === 'hot_frequency') {
                weights[n] = 0.75 + (g * 0.9) + (r * 0.35);
            } else if (normalized.strategyId === 'cold_frequency') {
                weights[n] = 0.75 + ((1 - g) * 0.8) + ((1 - r) * 0.3) + (gap * 0.5);
            } else if (normalized.strategyId === 'recency_gap') {
                weights[n] = 0.65 + (r * 0.35) + (gap * 1.0);
            } else if (normalized.strategyId === 'balance_oe_hl') {
                weights[n] = 0.8 + (g * 0.45) + (r * 0.35) + (zoneBal * 0.3);
            } else if (normalized.strategyId === 'stat_ac_sum') {
                weights[n] = 0.8 + (g * 0.4) + (r * 0.35) + (p * 0.25);
            } else if (normalized.strategyId === 'pair_cooccurrence') {
                weights[n] = 0.7 + (g * 0.25) + (p * 1.0);
            } else if (normalized.strategyId === 'adjacency_bias') {
                let adj = 0;
                if (lastDrawSet?.has(n)) adj += 0.2;
                if (lastDrawSet?.has(n - 1)) adj += 0.5;
                if (lastDrawSet?.has(n + 1)) adj += 0.5;
                weights[n] = 0.7 + (g * 0.35) + (adj * 0.8);
            } else if (normalized.strategyId === 'zone_split_3band') {
                weights[n] = 0.75 + (g * 0.3) + (r * 0.3) + (zoneBal * 0.8);
            } else if (normalized.strategyId === 'wheel_full' || normalized.strategyId === 'wheel_reduced_t3') {
                weights[n] = 0.8 + (g * 0.5) + (r * 0.4) + (p * 0.2);
            } else if (normalized.strategyId === 'skip_hit_weighted') {
                weights[n] = 0.7 + (gap * 1.1) + (r * 0.2) + ((1 - g) * 0.2);
            } else if (normalized.strategyId === 'last_digit_balance') {
                weights[n] = 0.75 + (g * 0.3) + (endBal * 0.9);
            } else if (normalized.strategyId === 'delta_gap_pattern') {
                const nearDelta = avgDelta
                    ? 1 - Math.min(Math.abs((n % 10) - (avgDelta % 10)) / 10, 1)
                    : 0.5;
                weights[n] = 0.7 + (g * 0.35) + (nearDelta * 0.8);
            } else if (normalized.strategyId === 'carryover_repeat_control') {
                const repeatPenalty = lastDrawSet?.has(n) ? 0.4 : 1.0;
                weights[n] = (0.75 + (g * 0.35) + (r * 0.2) + (gap * 0.25)) * repeatPenalty;
            } else {
                weights[n] = 0.8 + (g * 0.5) + (r * 0.35) + (gap * 0.25);
            }
        }

        if (isWheel) {
            for (let n = 1; n <= 45; n++) {
                weights[n] = Math.max(weights[n], 0.1);
            }
        }

        return { weights, request: normalized };
    }
};
