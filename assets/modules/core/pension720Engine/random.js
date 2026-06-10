import { xorshift32 } from '../strategy/shared.js';

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

function createPension720Rng(seed) {
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

export { createPension720Rng, weightedPick };
