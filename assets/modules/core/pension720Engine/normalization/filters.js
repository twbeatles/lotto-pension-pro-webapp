import { clampNullableInt, normalizeGroups, normalizePair } from './primitives.js';
import { normalizeExcludedDigits, normalizeFixedDigits } from './digits.js';

export function normalizeFilters(filters = {}) {
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