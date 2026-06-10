import { getPension720StrategyMeta } from '../Pension720StrategyCatalog.js';
import { countAdjacentFlow, digitFrequencyMeta } from './digits.js';
import { clampInt, normalizeRequest } from './normalization.js';

export const pension720CandidateMethods = {
    passesFilters(group, number, request) {
        const filters = request.filters || {};
        const digits = String(number || '')
            .split('')
            .map(Number);
        if (digits.length !== 6 || digits.some((digit) => !Number.isInteger(digit) || digit < 0 || digit > 9))
            return false;
        if (filters.groups && !filters.groups.includes(group)) return false;
        if (filters.fixedDigits) {
            for (let pos = 0; pos < 6; pos++) {
                if (
                    filters.fixedDigits[pos] !== null &&
                    filters.fixedDigits[pos] !== undefined &&
                    digits[pos] !== filters.fixedDigits[pos]
                ) {
                    return false;
                }
            }
        }
        if (filters.excludedDigitsByPosition) {
            for (let pos = 0; pos < 6; pos++) {
                if ((filters.excludedDigitsByPosition[pos] || []).includes(digits[pos])) return false;
            }
        }

        const sum = digits.reduce((acc, digit) => acc + digit, 0);
        const odd = digits.filter((digit) => digit % 2 !== 0).length;
        const high = digits.filter((digit) => digit >= 5).length;
        const frequency = digitFrequencyMeta(digits);

        if (filters.digitSumRange && (sum < filters.digitSumRange[0] || sum > filters.digitSumRange[1])) return false;
        if (filters.oddDigitRange && (odd < filters.oddDigitRange[0] || odd > filters.oddDigitRange[1])) return false;
        if (filters.highDigitRange && (high < filters.highDigitRange[0] || high > filters.highDigitRange[1]))
            return false;
        if (
            filters.uniqueDigitMin !== null &&
            filters.uniqueDigitMin !== undefined &&
            frequency.uniqueCount < filters.uniqueDigitMin
        ) {
            return false;
        }
        if (
            filters.maxSameDigit !== null &&
            filters.maxSameDigit !== undefined &&
            frequency.maxSame > filters.maxSameDigit
        ) {
            return false;
        }
        return true;
    },

    scoreCandidate(group, number, analysis = this.analysis, request = normalizeRequest()) {
        const digits = String(number || '')
            .split('')
            .map(Number);
        const groupScore = analysis.groupStats.find((item) => item.group === group)?.score || 1;
        const digitScore = digits.reduce((sum, digit, pos) => {
            const primary = analysis.positionStats[pos]?.[digit] || 1;
            const bonus = analysis.bonusPositionStats[pos]?.[digit] || 1;
            const gap = analysis.digitGapStats[pos]?.[digit] || 0;
            if (request.strategyId === 'bonus_flow') return sum + primary * 0.65 + bonus * 1.05;
            if (request.strategyId === 'gap_rebound') return sum + primary * 0.5 + Math.min(12, gap * 0.85);
            if (request.strategyId === 'trailing_match') return sum + primary * (pos >= 3 ? 1.6 : 0.7) + bonus * 0.3;
            return sum + primary + bonus * 0.35 + Math.min(4, gap * 0.08);
        }, 0);
        const frequency = digitFrequencyMeta(digits);
        const diversityBonus =
            request.strategyId === 'diversity' ? frequency.uniqueCount * 3 - frequency.maxSame * 2 : 0;
        const flowBonus = request.strategyId === 'consecutive_pattern' ? countAdjacentFlow(digits) * 3 : 0;
        const score = groupScore * 0.26 + digitScore * 0.74 + diversityBonus + flowBonus;
        return Number(score.toFixed(4));
    },

    explainCandidate(group, number, analysis = this.analysis, request = normalizeRequest()) {
        const meta = getPension720StrategyMeta(request.strategyId);
        const groupMeta = analysis.groupStats.find((item) => item.group === group);
        const digits = String(number || '')
            .split('')
            .map(Number);
        const topPositions = digits
            .map((digit, pos) => {
                const weights = analysis.positionStats[pos] || [];
                const topDigit = weights
                    .map((weight, value) => ({ value, weight }))
                    .sort((a, b) => b.weight - a.weight)[0]?.value;
                return topDigit === digit ? `${pos + 1}번째 ${digit}` : '';
            })
            .filter(Boolean)
            .slice(0, 2);
        const reasons = [];

        reasons.push(meta.label);
        if (groupMeta) {
            reasons.push(`${group}조 빈도 ${groupMeta.rawCount || 0}회, 최근 공백 ${groupMeta.gap || 0}회`);
        }
        if (topPositions.length) reasons.push(`자리별 강세: ${topPositions.join(', ')}`);
        if (request.strategyId === 'trailing_match') reasons.push('끝자리 당첨 구조를 더 크게 반영');
        if (request.strategyId === 'bonus_flow') reasons.push('보너스 번호 자리 흐름을 보조 반영');
        if (request.strategyId === 'gap_rebound') reasons.push('자리별 장기 미출현 숫자 보정');
        if (request.strategyId === 'diversity') reasons.push(`고유 숫자 ${digitFrequencyMeta(digits).uniqueCount}종`);
        return reasons;
    },

    recommend(options = {}) {
        const setCount = clampInt(options.setCount, 1, 20, 5);
        const request = normalizeRequest(options.request || options.strategyRequest || options);
        const rng = this.createRng(options.seed ?? request.params.seed);
        const analysis = this.getAnalysisForRequest(request);
        const poolSize = Math.max(setCount, request.params.candidatePoolSize);
        const candidates = new Map();
        const maxAttempts = Math.max(poolSize * 12, setCount * 80);

        for (let i = 0; i < maxAttempts && candidates.size < poolSize; i++) {
            const group = this.pickGroup(rng, analysis, request);
            const number = this.pickNumber(rng, analysis, request);
            if (!this.passesFilters(group, number, request)) continue;
            const key = `${group}|${number}`;
            if (candidates.has(key)) continue;
            const score = this.scoreCandidate(group, number, analysis, request);
            const allowedGroups = request.filters.groups ? new Set(request.filters.groups) : null;
            const expansionGroups = analysis.groupStats
                .filter((item) => item.group !== group && (!allowedGroups || allowedGroups.has(item.group)))
                .map((item) => item.group);
            candidates.set(key, {
                group,
                number,
                digits: number.split('').map(Number),
                score,
                strategyId: request.strategyId,
                strategyLabel: getPension720StrategyMeta(request.strategyId).label,
                expansionGroups,
                reasons: this.explainCandidate(group, number, analysis, request)
            });
        }

        return Array.from(candidates.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, setCount);
    },

    getSummary() {
        return {
            latestDrawNo: this.analysis.latestDrawNo,
            drawCount: this.analysis.drawCount,
            topGroups: this.analysis.groupStats.slice(0, 5)
        };
    }
};
