export function normalizeSixDigitString(value = '') {
    const text = String(value ?? '').trim();
    return /^\d{6}$/.test(text) ? text : '';
}

export function clampInt(value, min, max, fallback) {
    const next = Math.floor(Number(value));
    if (!Number.isFinite(next)) return fallback;
    return Math.min(max, Math.max(min, next));
}

export function clampNullableInt(value, min, max) {
    if (value === null || value === undefined || value === '') return null;
    return clampInt(value, min, max, null);
}

export function normalizePair(value, min, max) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const a = Number(value[0]);
    const b = Number(value[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const left = Math.max(min, Math.min(max, Math.floor(a)));
    const right = Math.max(min, Math.min(max, Math.floor(b)));
    return left <= right ? [left, right] : [right, left];
}

export function normalizeGroups(value) {
    if (value === null || value === undefined || value === '') return null;
    const source = Array.isArray(value) ? value : String(value).split(/[^0-9]+/);
    const groups = [
        ...new Set(source.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 5))
    ].sort((a, b) => a - b);
    return groups.length ? groups : null;
}

export function normalizeDigit(value) {
    if (value === null || value === undefined || value === '') return null;
    const digit = Number(value);
    return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? digit : null;
}