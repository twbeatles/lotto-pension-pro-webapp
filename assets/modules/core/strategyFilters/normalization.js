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