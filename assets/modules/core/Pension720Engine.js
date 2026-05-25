import {
    createDefaultPension720StrategyRequest,
    getPension720StrategyMeta,
    resolvePension720StrategyId
} from './Pension720StrategyCatalog.js';
import { xorshift32 } from './strategy/shared.js';

function normalizeSixDigitString(value = '') {
    const text = String(value ?? '').trim();
    return /^\d{6}$/.test(text) ? text : '';
}

function normalizeDraw(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const drawNo = Number(raw.draw_no);
    const group = Number(raw.group);
    const number = normalizeSixDigitString(raw.number);
    const bonusNumber = normalizeSixDigitString(raw.bonus_number);
    if (!Number.isInteger(drawNo) || drawNo < 1) return null;
    if (!Number.isInteger(group) || group < 1 || group > 5) return null;
    if (!number || !bonusNumber) return null;
    return {
        draw_no: drawNo,
        date: typeof raw.date === 'string' ? raw.date : '',
        group,
        digits: number.split('').map(Number),
        number,
        bonus_digits: bonusNumber.split('').map(Number),
        bonus_number: bonusNumber
    };
}

function weightedPick(items, rng) {
    const safeItems = items.filter((item) => Number(item.weight) > 0);
    const total = safeItems.reduce((sum, item) => sum + Number(item.weight || 0), 0);
    if (!safeItems.length || total <= 0) return items[0]?.value;
    let cursor = rng() * total;
    for (const item of safeItems) {
        cursor -= Number(item.weight || 0);
        if (cursor <= 0) return item.value;
    }
    return safeItems[safeItems.length - 1].value;
}

function clampInt(value, min, max, fallback) {
    const next = Math.floor(Number(value));
    if (!Number.isFinite(next)) return fallback;
    return Math.min(max, Math.max(min, next));
}

function normalizePair(value, min, max) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const a = Number(value[0]);
    const b = Number(value[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const left = Math.max(min, Math.min(max, Math.floor(a)));
    const right = Math.max(min, Math.min(max, Math.floor(b)));
    return left <= right ? [left, right] : [right, left];
}

function normalizeGroups(value) {
    if (value === null || value === undefined || value === '') return null;
    const source = Array.isArray(value) ? value : String(value).split(/[^0-9]+/);
    const groups = [
        ...new Set(source.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 5))
    ].sort((a, b) => a - b);
    return groups.length ? groups : null;
}

function normalizeDigit(value) {
    if (value === null || value === undefined || value === '') return null;
    const digit = Number(value);
    return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? digit : null;
}

function normalizeFixedDigits(value) {
    if (value === null || value === undefined || value === '') return null;
    const out = Array(6).fill(null);
    let found = false;

    if (Array.isArray(value)) {
        value.slice(0, 6).forEach((item, pos) => {
            const digit = normalizeDigit(item);
            if (digit === null) return;
            out[pos] = digit;
            found = true;
        });
        return found ? out : null;
    }

    if (typeof value === 'object') {
        const hasZeroBasedKey = Object.prototype.hasOwnProperty.call(value, '0');
        Object.entries(value).forEach(([key, rawDigit]) => {
            const rawPos = Number(key);
            if (!Number.isInteger(rawPos)) return;
            const pos = hasZeroBasedKey ? rawPos : rawPos - 1;
            const digit = normalizeDigit(rawDigit);
            if (pos < 0 || pos > 5 || digit === null) return;
            out[pos] = digit;
            found = true;
        });
    }

    return found ? out : null;
}

function normalizeExcludedDigits(value) {
    if (value === null || value === undefined || value === '') return null;
    const out = Array.from({ length: 6 }, () => []);
    let found = false;

    const addDigit = (pos, rawDigit) => {
        const digit = normalizeDigit(rawDigit);
        if (pos < 0 || pos > 5 || digit === null || out[pos].includes(digit)) return;
        out[pos].push(digit);
        found = true;
    };

    if (Array.isArray(value)) {
        value.slice(0, 6).forEach((items, pos) => {
            (Array.isArray(items) ? items : [items]).forEach((item) => addDigit(pos, item));
        });
        return found ? out : null;
    }

    if (typeof value === 'object') {
        const hasZeroBasedKey = Object.prototype.hasOwnProperty.call(value, '0');
        Object.entries(value).forEach(([key, rawItems]) => {
            const rawPos = Number(key);
            if (!Number.isInteger(rawPos)) return;
            const pos = hasZeroBasedKey ? rawPos : rawPos - 1;
            (Array.isArray(rawItems) ? rawItems : [rawItems]).forEach((item) => addDigit(pos, item));
        });
    }

    return found ? out.map((items) => items.sort((a, b) => a - b)) : null;
}

function normalizeFilters(filters = {}) {
    return {
        groups: normalizeGroups(filters.groups),
        fixedDigits: normalizeFixedDigits(filters.fixedDigits),
        excludedDigitsByPosition: normalizeExcludedDigits(filters.excludedDigitsByPosition),
        digitSumRange: normalizePair(filters.digitSumRange, 0, 54),
        oddDigitRange: normalizePair(filters.oddDigitRange, 0, 6),
        highDigitRange: normalizePair(filters.highDigitRange, 0, 6),
        uniqueDigitMin: clampNullableInt(filters.uniqueDigitMin, 1, 6),
        maxSameDigit: clampNullableInt(filters.maxSameDigit, 1, 6)
    };
}

function clampNullableInt(value, min, max) {
    if (value === null || value === undefined || value === '') return null;
    return clampInt(value, min, max, null);
}

function applyProfileDefaults(params, profile = '') {
    if (profile === 'fast') {
        return {
            ...params,
            lookbackWindow: params.lookbackWindow ?? 20,
            candidatePoolSize: params.candidatePoolSize ?? 80
        };
    }
    if (profile === 'precise') {
        return {
            ...params,
            lookbackWindow: params.lookbackWindow ?? 80,
            candidatePoolSize: params.candidatePoolSize ?? 240
        };
    }
    return {
        ...params,
        lookbackWindow: params.lookbackWindow ?? 40,
        candidatePoolSize: params.candidatePoolSize ?? 140
    };
}

function normalizeRequest(raw = {}) {
    const profile = ['fast', 'basic', 'precise'].includes(raw.profile) ? raw.profile : '';
    const strategyId = resolvePension720StrategyId(raw.strategyId || raw.id || profile || 'mixed_balance');
    const defaults = createDefaultPension720StrategyRequest(strategyId);
    const params = applyProfileDefaults(
        {
            ...defaults.params,
            ...(raw.params || {}),
            seed: raw.seed ?? raw.params?.seed ?? defaults.params.seed
        },
        profile
    );

    return {
        strategyId,
        evidenceTier: defaults.evidenceTier,
        params: {
            seed:
                Number.isFinite(Number(params.seed)) && Number(params.seed) > 0
                    ? Math.floor(Number(params.seed))
                    : null,
            lookbackWindow: clampInt(params.lookbackWindow, 1, 300, defaults.params.lookbackWindow),
            candidatePoolSize: clampInt(params.candidatePoolSize, 20, 800, defaults.params.candidatePoolSize)
        },
        filters: normalizeFilters({
            ...defaults.filters,
            ...(raw.filters || {})
        })
    };
}

function digitFrequencyMeta(digits = []) {
    const counts = new Map();
    digits.forEach((digit) => counts.set(digit, (counts.get(digit) || 0) + 1));
    const maxSame = Math.max(0, ...counts.values());
    return {
        uniqueCount: counts.size,
        maxSame
    };
}

function countAdjacentFlow(digits = []) {
    let count = 0;
    for (let i = 1; i < digits.length; i++) {
        if (Math.abs(digits[i] - digits[i - 1]) === 1) count++;
    }
    return count;
}

export class Pension720Engine {
    constructor(stats = []) {
        this.data = (Array.isArray(stats) ? stats : [])
            .map((row) => normalizeDraw(row))
            .filter(Boolean)
            .sort((a, b) => a.draw_no - b.draw_no);
        this.analysis = this.buildAnalysis(this.data);
    }

    buildAnalysis(sourceData = this.data) {
        const rows = (Array.isArray(sourceData) ? sourceData : []).filter(Boolean);
        const groupStats = new Map();
        const positionStats = Array.from({ length: 6 }, () => Array(10).fill(1));
        const bonusPositionStats = Array.from({ length: 6 }, () => Array(10).fill(1));
        const digitGapStats = Array.from({ length: 6 }, () => Array(10).fill(0));
        const latestDrawNo = rows.at(-1)?.draw_no || 0;

        for (let group = 1; group <= 5; group++) {
            groupStats.set(group, {
                group,
                count: 0,
                rawCount: 0,
                recentCount: 0,
                lastSeenDrawNo: 0,
                score: 1,
                gap: 0
            });
        }

        rows.forEach((draw, index) => {
            const recencyWeight = 1 + index / Math.max(1, rows.length - 1);
            const group = groupStats.get(draw.group);
            group.rawCount += 1;
            group.count = group.rawCount;
            group.lastSeenDrawNo = draw.draw_no;
            group.score += recencyWeight;
            if (index >= Math.max(0, rows.length - 20)) {
                group.recentCount += 1;
                group.score += 0.8;
            }

            draw.digits.forEach((digit, pos) => {
                positionStats[pos][digit] += recencyWeight;
            });
            draw.bonus_digits.forEach((digit, pos) => {
                bonusPositionStats[pos][digit] += recencyWeight;
            });
        });

        for (let pos = 0; pos < 6; pos++) {
            for (let digit = 0; digit <= 9; digit++) {
                const lastSeen = [...rows].reverse().find((draw) => draw.digits[pos] === digit)?.draw_no || 0;
                digitGapStats[pos][digit] = latestDrawNo && lastSeen ? latestDrawNo - lastSeen : rows.length;
            }
        }

        groupStats.forEach((group) => {
            const gap = latestDrawNo && group.lastSeenDrawNo ? latestDrawNo - group.lastSeenDrawNo : rows.length;
            group.gap = gap;
            group.score += Math.min(10, gap * 0.35);
        });

        return {
            latestDrawNo,
            drawCount: rows.length,
            groupStats: Array.from(groupStats.values()).sort((a, b) => b.score - a.score),
            positionStats,
            bonusPositionStats,
            digitGapStats
        };
    }

    getAnalysisForRequest(request) {
        const lookback = request?.params?.lookbackWindow || this.data.length;
        const sourceData = this.data.slice(-Math.max(1, lookback));
        return this.buildAnalysis(sourceData);
    }

    createRng(seed) {
        const numericSeed = Number(seed);
        if (Number.isFinite(numericSeed) && numericSeed > 0) {
            return xorshift32(Math.floor(numericSeed));
        }
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            return () => {
                const array = new Uint32Array(1);
                crypto.getRandomValues(array);
                return array[0] / 0xffffffff;
            };
        }
        return Math.random;
    }

    getGroupWeight(item, strategyId) {
        if (strategyId === 'random_baseline') return 1;
        if (strategyId === 'group_rotation') return 1 + item.score * 0.35 + Math.min(12, item.gap * 1.1);
        if (strategyId === 'gap_rebound') return 1 + item.score * 0.25 + Math.min(10, item.gap * 0.8);
        return item.score;
    }

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
    }

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
    }

    getExplorationRate(request) {
        const pool = request.params.candidatePoolSize;
        if (request.strategyId === 'random_baseline') return 1;
        if (pool >= 220) return 0.18;
        if (pool <= 90) return 0.5;
        return 0.32;
    }

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
    }

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
    }

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
    }

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
    }

    getSummary() {
        return {
            latestDrawNo: this.analysis.latestDrawNo,
            drawCount: this.analysis.drawCount,
            topGroups: this.analysis.groupStats.slice(0, 5)
        };
    }
}
