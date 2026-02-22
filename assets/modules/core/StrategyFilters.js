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

function toSortedUniqueNumbers(numbers, assumeSorted = false) {
    if (!Array.isArray(numbers) || numbers.length !== 6) return null;
    const sorted = assumeSorted ? numbers : [...numbers].sort((a, b) => a - b);

    for (let i = 0; i < sorted.length; i++) {
        const n = Number(sorted[i]);
        if (!Number.isInteger(n) || n < 1 || n > 45) return null;
        if (i > 0 && n === Number(sorted[i - 1])) return null;
        if (!assumeSorted) sorted[i] = n;
    }
    return sorted;
}

function bitCount10(mask) {
    let n = mask;
    let count = 0;
    while (n) {
        n &= (n - 1);
        count++;
    }
    return count;
}

function evaluateSortedNumbers(sorted, f) {
    let odd = 0;
    let high = 0;
    let sum = 0;
    let consecutivePairs = 0;
    let endDigitMask = 0;

    for (let i = 0; i < sorted.length; i++) {
        const n = sorted[i];
        if ((n % 2) !== 0) odd++;
        if (n > 23) high++;
        sum += n;
        endDigitMask |= (1 << (n % 10));
        if (i > 0 && n === sorted[i - 1] + 1) consecutivePairs++;
    }

    if (f.oddEven && (odd < f.oddEven[0] || odd > f.oddEven[1])) return false;
    if (f.highLow && (high < f.highLow[0] || high > f.highLow[1])) return false;
    if (f.sumRange && (sum < f.sumRange[0] || sum > f.sumRange[1])) return false;
    if (f.maxConsecutivePairs !== null && consecutivePairs > f.maxConsecutivePairs) return false;
    if (f.endDigitUniqueMin !== null && bitCount10(endDigitMask) < f.endDigitUniqueMin) return false;

    if (f.acRange) {
        const ac = AdvancedMonteCarlo.calculateAC(sorted);
        if (ac < f.acRange[0] || ac > f.acRange[1]) return false;
    }

    return true;
}

export function createFilterEvaluator(filters = {}) {
    const f = sanitizeFilters(filters);
    return (numbers, options = {}) => {
        const sorted = toSortedUniqueNumbers(numbers, Boolean(options.assumeSorted));
        if (!sorted) return false;
        return evaluateSortedNumbers(sorted, f);
    };
}

export function passesFilters(numbers, filters = {}) {
    return createFilterEvaluator(filters)(numbers);
}
