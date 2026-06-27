export const strategyGenerationSamplingMethods = {
    sampleWithConstraints(weights, fixed = [], exclude = [], rng = Math.random) {
        const fixedUnique = [...new Set((fixed || []).map(Number).filter((n) => n >= 1 && n <= 45))];
        const excludeSet = new Set((exclude || []).map(Number).filter((n) => n >= 1 && n <= 45));
        fixedUnique.forEach((n) => excludeSet.delete(n));
        const needed = 6 - fixedUnique.length;
        if (needed < 0) return null;
        const pool = [];

        for (let n = 1; n <= 45; n++) {
            if (excludeSet.has(n) || fixedUnique.includes(n)) continue;
            pool.push({ n, w: Math.max(0.0001, Number(weights?.[n] || 1)) });
        }
        if (pool.length < needed) return null;

        const chosen = [...fixedUnique];
        while (chosen.length < 6) {
            const total = pool.reduce((acc, p) => acc + p.w, 0);
            let r = rng() * total;
            let index = 0;
            for (let i = 0; i < pool.length; i++) {
                r -= pool[i].w;
                if (r <= 0) {
                    index = i;
                    break;
                }
            }
            chosen.push(pool[index].n);
            pool.splice(index, 1);
        }

        return chosen.sort((a, b) => a - b);
    }
};