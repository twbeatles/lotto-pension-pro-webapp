import { normalizeRequest } from './normalization.js';
import { weightedPick } from './random.js';

export const pension720SelectionMethods = {
    getGroupWeight(item, strategyId) {
        if (strategyId === 'random_baseline') return 1;
        if (strategyId === 'group_rotation') return 1 + item.score * 0.35 + Math.min(12, item.gap * 1.1);
        if (strategyId === 'gap_rebound') return 1 + item.score * 0.25 + Math.min(10, item.gap * 0.8);
        return item.score;
    },

    pickGroup(rng, analysis = this.analysis, request = normalizeRequest()) {
        const allowed = request.filters.groups ? new Set(request.filters.groups) : null;
        const items = analysis.groupStats
            .filter((item) => !allowed || allowed.has(item.group))
            .map((item) => ({
                value: item.group,
                weight: this.getGroupWeight(item, request.strategyId)
            }));
        return weightedPick(
            items.length ? items : analysis.groupStats.map((item) => ({ value: item.group, weight: 1 })),
            rng
        );
    },

    getDigitWeight(pos, digit, analysis, request) {
        const strategyId = request.strategyId;
        if (strategyId === 'random_baseline') return 1;

        const primary = analysis.positionStats[pos]?.[digit] || 1;
        const bonus = analysis.bonusPositionStats[pos]?.[digit] || 1;
        const gap = analysis.digitGapStats[pos]?.[digit] || 0;

        if (strategyId === 'position_hot') return 1 + primary * 1.65 + bonus * 0.2;
        if (strategyId === 'trailing_match')
            return 1 + primary * (pos >= 3 ? 1.75 : 0.65) + bonus * (pos >= 3 ? 0.45 : 0.15);
        if (strategyId === 'group_rotation') return 1 + primary * 0.9 + bonus * 0.25 + Math.min(5, gap * 0.08);
        if (strategyId === 'gap_rebound') return 1 + primary * 0.55 + Math.min(12, gap * 0.8);
        if (strategyId === 'bonus_flow') return 1 + primary * 0.75 + bonus * 1.15;
        if (strategyId === 'diversity') return 1 + primary * 0.85 + bonus * 0.15;
        if (strategyId === 'consecutive_pattern') return 1 + primary * 0.95 + bonus * 0.2;
        return 1 + primary + bonus * 0.35 + Math.min(4, gap * 0.08);
    },

    getExplorationRate(request) {
        const pool = request.params.candidatePoolSize;
        if (request.strategyId === 'random_baseline') return 1;
        if (pool >= 220) return 0.18;
        if (pool <= 90) return 0.5;
        return 0.32;
    },

    pickNumber(rng, analysis = this.analysis, request = normalizeRequest()) {
        const fixed = request.filters.fixedDigits;
        const excluded = request.filters.excludedDigitsByPosition;
        const exploration = this.getExplorationRate(request);
        const digits = [];

        for (let pos = 0; pos < 6; pos++) {
            if (fixed?.[pos] !== null && fixed?.[pos] !== undefined) {
                digits.push(fixed[pos]);
                continue;
            }
            const excludedSet = new Set(excluded?.[pos] || []);
            const previous = digits[pos - 1];
            const items = Array.from({ length: 10 }, (_, digit) => {
                let weight = this.getDigitWeight(pos, digit, analysis, request);
                if (request.strategyId === 'consecutive_pattern' && previous !== undefined) {
                    weight += Math.abs(previous - digit) === 1 ? 4 : 0;
                }
                return {
                    value: digit,
                    weight: excludedSet.has(digit) ? 0 : 1 + weight * (1 - exploration) + rng() * exploration * 4
                };
            });
            digits.push(weightedPick(items, rng));
        }

        return digits.join('');
    }
};
