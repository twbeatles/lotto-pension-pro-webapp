import { AdvancedMonteCarlo } from '../MonteCarlo.js';
import { sanitizeFilters } from './normalization.js';
import { bitCount10, toSortedUniqueNumbers } from './numbers.js';

function evaluateSortedNumbers(sorted, f) {
    let odd = 0;
    let high = 0;
    let sum = 0;
    let consecutivePairs = 0;
    let endDigitMask = 0;

    for (let i = 0; i < sorted.length; i++) {
        const n = sorted[i];
        if (n % 2 !== 0) odd++;
        if (n > 23) high++;
        sum += n;
        endDigitMask |= 1 << (n % 10);
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