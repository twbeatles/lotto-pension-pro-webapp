import { createFilterEvaluator } from '../../StrategyFilters.js';
import { pickDiverseCandidates } from './helpers.js';

export const strategyGenerationSimulationMethods = {
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
            set.forEach((n) => {
                counts[n] += 1;
            });
            accepted++;
        }

        if (accepted === 0) {
            return {
                weights: Array(46).fill(1),
                request: normalized,
                diagnostics: {
                    accepted: 0,
                    simulationCount: simCount,
                    fallbackMode: 'uniform_weights'
                }
            };
        }

        return {
            weights: counts,
            request: normalized,
            diagnostics: {
                accepted,
                simulationCount: simCount,
                fallbackMode: 'none'
            }
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
                    effectiveAdaptiveWindow: execution.adaptive?.evaluationWindow ?? null,
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