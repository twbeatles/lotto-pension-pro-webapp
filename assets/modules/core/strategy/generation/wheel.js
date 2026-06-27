export const strategyGenerationWheelMethods = {
    generateWheelSet(weights, request, options = {}) {
        const fixed = [...new Set((options.fixed || []).map(Number).filter((n) => n >= 1 && n <= 45))];
        const exclude = options.exclude || [];
        const rng = options.rng || Math.random;
        const poolSize = request.params.wheelPoolSize || 10;
        const guarantee = request.params.wheelGuarantee || 3;
        const seedSet = this.sampleWithConstraints(weights, fixed, exclude, rng);
        if (!seedSet) return null;

        const candidates = [];
        const excludeSet = new Set(exclude || []);
        const available = Array.from({ length: 45 }, (_, idx) => idx + 1).filter((n) => !excludeSet.has(n));
        const sortedByWeight = [...available].sort((a, b) => (weights[b] || 1) - (weights[a] || 1));
        for (const n of sortedByWeight) {
            if (!candidates.includes(n)) candidates.push(n);
            if (candidates.length >= poolSize) break;
        }

        while (candidates.length < poolSize) {
            const n = Math.floor(rng() * 45) + 1;
            if (!excludeSet.has(n) && !candidates.includes(n)) candidates.push(n);
        }

        const set = [...fixed];
        const seedExtras = seedSet.filter((n) => !set.includes(n));
        const minBaseSize = Math.max(Math.min(Math.max(guarantee, 1), 6), set.length);
        while (set.length < minBaseSize && seedExtras.length) {
            set.push(seedExtras.shift());
        }

        const dynamicPool = candidates.filter((n) => !set.includes(n));
        while (set.length < 6 && dynamicPool.length) {
            const idx = Math.floor(rng() * dynamicPool.length);
            set.push(dynamicPool[idx]);
            dynamicPool.splice(idx, 1);
        }
        return set.length === 6 ? set.sort((a, b) => a - b) : null;
    }
};