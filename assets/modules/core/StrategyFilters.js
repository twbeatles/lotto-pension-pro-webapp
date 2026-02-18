import { AdvancedMonteCarlo } from './MonteCarlo.js';

export function sanitizeFilters(filters = {}) {
    const out = {
        oddEven: normalizePair(filters.oddEven),
        highLow: normalizePair(filters.highLow),
        sumRange: normalizePair(filters.sumRange),
        acRange: normalizePair(filters.acRange),
        maxConsecutivePairs: normalizeInt(filters.maxConsecutivePairs, 0, 5),
        endDigitUniqueMin: normalizeInt(filters.endDigitUniqueMin, 1, 6)
    };
    return out;
}

function normalizeInt(v, min, max) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizePair(v) {
    if (!Array.isArray(v) || v.length < 2) return null;
    const a = Number(v[0]);
    const b = Number(v[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a <= b ? [a, b] : [b, a];
}

export function countConsecutivePairs(numbers) {
    let pairs = 0;
    for (let i = 0; i < numbers.length - 1; i++) {
        if (numbers[i + 1] === numbers[i] + 1) pairs++;
    }
    return pairs;
}

export function passesFilters(numbers, filters = {}) {
    if (!Array.isArray(numbers) || numbers.length !== 6) return false;
    const sorted = [...numbers].sort((a, b) => a - b);

    for (let i = 0; i < sorted.length; i++) {
        const n = sorted[i];
        if (!Number.isInteger(n) || n < 1 || n > 45) return false;
        if (i > 0 && n === sorted[i - 1]) return false;
    }

    const f = sanitizeFilters(filters);

    if (f.oddEven) {
        const odd = sorted.filter((n) => n % 2 !== 0).length;
        if (odd < f.oddEven[0] || odd > f.oddEven[1]) return false;
    }

    if (f.highLow) {
        const high = sorted.filter((n) => n > 23).length;
        if (high < f.highLow[0] || high > f.highLow[1]) return false;
    }

    if (f.sumRange) {
        const sum = AdvancedMonteCarlo.calculateSum(sorted);
        if (sum < f.sumRange[0] || sum > f.sumRange[1]) return false;
    }

    if (f.acRange) {
        const ac = AdvancedMonteCarlo.calculateAC(sorted);
        if (ac < f.acRange[0] || ac > f.acRange[1]) return false;
    }

    if (f.maxConsecutivePairs !== null) {
        if (countConsecutivePairs(sorted) > f.maxConsecutivePairs) return false;
    }

    if (f.endDigitUniqueMin !== null) {
        const uniqEndDigits = new Set(sorted.map((n) => n % 10)).size;
        if (uniqEndDigits < f.endDigitUniqueMin) return false;
    }

    return true;
}
