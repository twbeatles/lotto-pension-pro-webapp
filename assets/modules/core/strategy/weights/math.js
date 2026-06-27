export function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

export function normalizeRatio(value, max) {
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
    return clamp01(value / max);
}

export function normalizeAround(value, center = 1, radius = 1.25) {
    return clamp01(1 - Math.abs(value - center) / radius);
}

export function computeDeltaAffinity(number, lastDraw = [], avgDelta = 0) {
    if (!avgDelta || !Array.isArray(lastDraw) || !lastDraw.length) return 0.5;
    let best = 0;
    for (const base of lastDraw) {
        const diff = Math.abs(Math.abs(number - base) - avgDelta);
        const score = clamp01(1 - diff / Math.max(avgDelta * 1.25, 4));
        if (score > best) best = score;
    }
    return best;
}

export function normalizeWeights(weights = []) {
    const max = Math.max(...weights.slice(1), 1);
    return weights.map((value, index) => (index === 0 ? 0 : Math.max(Number(value || 0), 0) / max));
}

export function createAdaptiveKey(normalized, sourceData = []) {
    const lastDrawNo = Number(sourceData[sourceData.length - 1]?.draw_no || 0);
    return JSON.stringify({
        strategyId: normalized.strategyId,
        lookbackWindow: normalized.params?.lookbackWindow,
        simulationCount: normalized.params?.simulationCount,
        seed: normalized.params?.seed,
        filters: normalized.filters || {},
        sourceLength: sourceData.length,
        lastDrawNo
    });
}