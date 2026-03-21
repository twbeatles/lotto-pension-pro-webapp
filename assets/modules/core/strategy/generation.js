import { createFilterEvaluator } from '../StrategyFilters.js';

function countOverlap(left = [], right = []) {
    const rightSet = new Set(right);
    return left.reduce((acc, value) => acc + (rightSet.has(value) ? 1 : 0), 0);
}

function pickDiverseCandidates(candidates = [], setCount = 5) {
    const selected = [];
    const overlapCaps = setCount > 3 ? [3, 4, 5] : [4, 5];

    for (const cap of overlapCaps) {
        for (const candidate of candidates) {
            if (selected.length >= setCount) break;
            if (selected.some((item) => item.key === candidate.key)) continue;
            if (selected.every((item) => countOverlap(item.set, candidate.set) <= cap)) {
                selected.push(candidate);
            }
        }
        if (selected.length >= setCount) break;
    }

    if (selected.length < setCount) {
        for (const candidate of candidates) {
            if (selected.length >= setCount) break;
            if (selected.some((item) => item.key === candidate.key)) continue;
            selected.push(candidate);
        }
    }

    return selected.slice(0, setCount);
}

export const strategyGenerationMethods = {
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
    },

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
        const available = Array.from({ length: 45 }, (_, idx) => idx + 1)
            .filter((n) => !excludeSet.has(n));
        const sortedByWeight = [...available]
            .sort((a, b) => (weights[b] || 1) - (weights[a] || 1));
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
    },

    generateSetWithExecution(execution, options = {}) {
        const normalized = execution.normalizedRequest;
        const filterEvaluator = options.filterEvaluator || createFilterEvaluator(normalized.filters);
        const maxAttempts = options.maxAttempts || 250;
        const fixed = options.fixed || [];
        const exclude = options.exclude || [];
        const rng = options.rng || execution.rng;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const candidate = execution.isWheel
                ? this.generateWheelSet(execution.weights, normalized, { fixed, exclude, rng })
                : this.sampleWithConstraints(execution.weights, fixed, exclude, rng);
            if (!candidate) continue;
            if (filterEvaluator(candidate, { assumeSorted: true })) return candidate;
        }

        const fallbackWeights = Array(46).fill(1);
        for (let i = 0; i < 120; i++) {
            const fallback = this.sampleWithConstraints(fallbackWeights, fixed, exclude, rng);
            if (fallback && filterEvaluator(fallback, { assumeSorted: true })) return fallback;
        }
        return null;
    },

    generateSet(request, options = {}) {
        const execution = options.execution || this.prepareExecution(request, options);
        return this.generateSetWithExecution(execution, options);
    },

    generateMultipleSets(count, request, options = {}) {
        const qty = Math.max(1, Math.floor(Number(count) || 1));
        const unique = new Set();
        const result = [];

        const execution = options.execution || this.prepareExecution(request, options);
        const filterEvaluator = options.filterEvaluator || createFilterEvaluator(execution.normalizedRequest.filters);
        const rng = options.rng || execution.rng;

        let attempts = 0;
        const maxAttempts = Math.max(200, qty * 80);
        const perSetMaxAttempts = options.maxAttempts || 250;

        while (result.length < qty && attempts++ < maxAttempts) {
            const set = this.generateSetWithExecution(execution, {
                ...options,
                rng,
                maxAttempts: perSetMaxAttempts,
                filterEvaluator
            });
            if (!set || set.length !== 6) continue;
            const key = set.join(',');
            if (unique.has(key)) continue;
            unique.add(key);
            result.push(set);
        }
        return result;
    },

    simulateWeights(request, options = {}) {
        const execution = options.execution || this.prepareExecution(request, options);
        const normalized = execution.normalizedRequest;
        const rng = options.rng || this.getRandomFn(normalized.params.seed);
        const simCount = normalized.params.simulationCount;
        const counts = Array(46).fill(0);
        const filterEvaluator = options.filterEvaluator || createFilterEvaluator(normalized.filters);
        let accepted = 0;

        for (let i = 0; i < simCount; i++) {
            const set = execution.isWheel
                ? this.generateWheelSet(execution.weights, normalized, { rng })
                : this.sampleWithConstraints(execution.weights, [], [], rng);
            if (!set) continue;
            if (!filterEvaluator(set, { assumeSorted: true })) continue;
            set.forEach((n) => { counts[n] += 1; });
            accepted++;
        }

        if (accepted === 0) {
            return {
                weights: Array(46).fill(1),
                request: normalized,
                diagnostics: { accepted: 0, simulationCount: simCount, fallback: true }
            };
        }

        return {
            weights: counts,
            request: normalized,
            diagnostics: { accepted, simulationCount: simCount, fallback: false }
        };
    },

    recommendFromSimulation(request, options = {}) {
        const setCount = Math.max(1, Math.floor(Number(options.setCount) || 5));
        const execution = options.execution || this.prepareExecution(request, options);
        const sim = this.simulateWeights(request, { ...options, execution });
        const rng = options.rng || this.getRandomFn(sim.request.params.seed);
        const filterEvaluator = options.filterEvaluator || createFilterEvaluator(sim.request.filters);
        const unique = new Map();
        const out = [];
        let attempts = 0;
        const candidatePoolTarget = Math.max(setCount * 40, 140);
        const maxAttempts = Math.max(500, candidatePoolTarget * 14);

        while (unique.size < candidatePoolTarget && attempts++ < maxAttempts) {
            const candidate = this.sampleWithConstraints(sim.weights, [], [], rng);
            if (!candidate) continue;
            if (!filterEvaluator(candidate, { assumeSorted: true })) continue;
            const key = candidate.join(',');
            if (unique.has(key)) continue;

            const scored = this.scoreSetCandidate(candidate, sim.request, {
                execution,
                normalizedRequest: sim.request,
                sourceData: execution.sourceData,
                context: execution.context,
                weights: sim.weights
            });
            unique.set(key, {
                key,
                set: candidate,
                score: scored?.score || 0,
                breakdown: scored?.breakdown || null
            });
        }

        const rankedCandidates = [...unique.values()].sort((a, b) => {
            const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
            if (scoreDelta !== 0) return scoreDelta;
            return a.key.localeCompare(b.key);
        });
        const selected = pickDiverseCandidates(rankedCandidates, setCount);
        selected.forEach((item) => out.push(item.set));

        if (out.length < setCount) {
            const remains = this.generateMultipleSets(setCount - out.length, sim.request, {
                execution,
                rng,
                filterEvaluator
            });
            for (const set of remains) {
                const key = set.join(',');
                if (!out.some((item) => item.join(',') === key)) {
                    out.push(set);
                }
            }
        }

        return {
            sets: out,
            simulation: {
                ...sim,
                diagnostics: {
                    ...(sim.diagnostics || {}),
                    adaptive: execution.adaptive || null,
                    uniqueCandidates: rankedCandidates.length,
                    candidatePoolTarget,
                    reranked: true,
                    selectedCount: out.length,
                    topScore: Number(selected[0]?.score || 0)
                }
            }
        };
    }
};
