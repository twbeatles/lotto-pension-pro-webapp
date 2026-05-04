export function clamp(n, min, max, fallback) {
    const value = Number(n);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, value));
}

export function xorshift32(seed) {
    let x = seed >>> 0;
    if (x === 0) x = 0x9e3779b9;
    return () => {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        return (x >>> 0) / 4294967296;
    };
}

export const FIXED_PRIZE_BY_RANK = Object.freeze({
    1: 2000000000,
    2: 50000000,
    3: 1500000,
    4: 50000,
    5: 5000
});

export function resolvePayoutMode(value) {
    return value === 'fast_fixed' ? 'fast_fixed' : 'hybrid_dynamic_first';
}
