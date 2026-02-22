import {
    createDefaultStrategyRequest,
    getStrategyMeta,
    resolveStrategyId
} from './StrategyCatalog.js';
import { createFilterEvaluator, passesFilters, sanitizeFilters } from './StrategyFilters.js';
import { AdvancedMonteCarlo } from './MonteCarlo.js';

function clamp(n, min, max, fallback) {
    const value = Number(n);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, value));
}

function xorshift32(seed) {
    let x = seed >>> 0;
    return () => {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        return ((x >>> 0) / 4294967296);
    };
}

export class StrategyEngine {
    constructor(winningStats = []) {
        this.data = [...(winningStats || [])]
            .filter((d) => Number.isFinite(Number(d?.draw_no)))
            .sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
    }

    normalizeRequest(raw = {}) {
        const base = createDefaultStrategyRequest(resolveStrategyId(raw.strategyId));
        const meta = getStrategyMeta(base.strategyId);

        const params = {
            ...base.params,
            ...(raw.params || {})
        };

        params.simulationCount = Math.floor(clamp(params.simulationCount, 1000, 20000, base.params.simulationCount));
        params.lookbackWindow = Math.floor(clamp(params.lookbackWindow, 5, 120, base.params.lookbackWindow));
        params.wheelPoolSize = params.wheelPoolSize === null
            ? null
            : Math.floor(clamp(params.wheelPoolSize, 7, 20, meta.defaultParams.wheelPoolSize || 10));
        params.wheelGuarantee = params.wheelGuarantee === null
            ? null
            : Math.floor(clamp(params.wheelGuarantee, 2, 5, meta.defaultParams.wheelGuarantee || 3));
        params.seed = (raw.params && raw.params.seed !== undefined && raw.params.seed !== null && raw.params.seed !== '')
            ? Math.floor(Number(raw.params.seed))
            : null;

        const filters = sanitizeFilters({
            ...base.filters,
            ...(raw.filters || {})
        });

        return {
            strategyId: meta.id,
            evidenceTier: meta.tier,
            params,
            filters
        };
    }

    getDataBefore(drawNo = null) {
        if (!Number.isFinite(Number(drawNo))) return this.data;
        return this.data.filter((row) => Number(row.draw_no) < Number(drawNo));
    }

    buildContext(sourceData, lookbackWindow = 20) {
        const data = [...(sourceData || [])].sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
        const totalDraws = data.length;
        const recent = data.slice(-lookbackWindow);
        const freq = Array(46).fill(0);
        const recentFreq = Array(46).fill(0);
        const lastSeen = Array(46).fill(-1);
        const pairCounts = Array(46).fill(0);
        const endDigitRecent = Array(10).fill(0);
        const zoneRecent = [0, 0, 0];

        data.forEach((draw, idx) => {
            (draw.numbers || []).forEach((nRaw) => {
                const n = Number(nRaw);
                if (n < 1 || n > 45) return;
                freq[n] += 1;
                lastSeen[n] = idx;
            });
        });

        recent.forEach((draw) => {
            const nums = (draw.numbers || []).map(Number).filter((n) => n >= 1 && n <= 45).sort((a, b) => a - b);
            nums.forEach((n) => {
                recentFreq[n] += 1;
                endDigitRecent[n % 10] += 1;
                if (n <= 15) zoneRecent[0] += 1;
                else if (n <= 30) zoneRecent[1] += 1;
                else zoneRecent[2] += 1;
            });
            for (let i = 0; i < nums.length; i++) {
                for (let j = i + 1; j < nums.length; j++) {
                    pairCounts[nums[i]] += 1;
                    pairCounts[nums[j]] += 1;
                }
            }
        });

        const lastDraw = totalDraws ? (data[totalDraws - 1].numbers || []).map(Number) : [];
        return { totalDraws, lookbackWindow, freq, recentFreq, lastSeen, pairCounts, endDigitRecent, zoneRecent, lastDraw };
    }

    getRandomFn(seed = null) {
        if (seed === null || seed === undefined || seed === '' || !Number.isFinite(Number(seed))) {
            return Math.random;
        }
        return xorshift32(Math.floor(Number(seed)));
    }

    computeWeights(request, sourceData) {
        const normalized = this.normalizeRequest(request);
        return this.computeWeightsFromNormalized(normalized, sourceData);
    }

    computeWeightsFromNormalized(normalized, sourceData) {
        const ctx = this.buildContext(sourceData, normalized.params.lookbackWindow);
        const { totalDraws, freq, recentFreq, lastSeen, pairCounts, endDigitRecent, zoneRecent, lastDraw } = ctx;

        const weights = Array(46).fill(1);
        const freqMax = Math.max(...freq.slice(1), 1);
        const recentMax = Math.max(...recentFreq.slice(1), 1);
        const pairMax = Math.max(...pairCounts.slice(1), 1);
        const endMax = Math.max(...endDigitRecent, 1);
        const zoneMax = Math.max(...zoneRecent, 1);

        const isWheel = normalized.strategyId === 'wheel_full' || normalized.strategyId === 'wheel_reduced_t3';
        const isAdjacency = normalized.strategyId === 'adjacency_bias';
        const isDeltaPattern = normalized.strategyId === 'delta_gap_pattern';

        const lastDrawSet = isAdjacency || normalized.strategyId === 'carryover_repeat_control'
            ? new Set(lastDraw)
            : null;

        let avgDelta = 0;
        if (isDeltaPattern && lastDraw.length >= 2) {
            const sortedLastDraw = [...lastDraw].sort((a, b) => a - b);
            let deltaSum = 0;
            let deltaCount = 0;
            for (let i = 0; i < sortedLastDraw.length - 1; i++) {
                deltaSum += (sortedLastDraw[i + 1] - sortedLastDraw[i]);
                deltaCount++;
            }
            avgDelta = deltaCount > 0 ? (deltaSum / deltaCount) : 0;
        }

        for (let n = 1; n <= 45; n++) {
            const g = freq[n] / freqMax;
            const r = recentFreq[n] / recentMax;
            const gapCount = totalDraws > 0
                ? Math.max(totalDraws - 1 - lastSeen[n], 0)
                : 0;
            const gap = totalDraws > 0 ? gapCount / totalDraws : 0.5;
            const p = pairCounts[n] / pairMax;
            const zoneIdx = n <= 15 ? 0 : (n <= 30 ? 1 : 2);
            const zoneBal = 1 - (zoneRecent[zoneIdx] / zoneMax);
            const endBal = 1 - (endDigitRecent[n % 10] / endMax);

            if (normalized.strategyId === 'random_baseline') {
                weights[n] = 1;
            } else if (normalized.strategyId === 'hot_frequency') {
                weights[n] = 0.75 + (g * 0.9) + (r * 0.35);
            } else if (normalized.strategyId === 'cold_frequency') {
                weights[n] = 0.75 + ((1 - g) * 0.8) + ((1 - r) * 0.3) + (gap * 0.5);
            } else if (normalized.strategyId === 'recency_gap') {
                weights[n] = 0.65 + (r * 0.35) + (gap * 1.0);
            } else if (normalized.strategyId === 'balance_oe_hl') {
                weights[n] = 0.8 + (g * 0.45) + (r * 0.35) + (zoneBal * 0.3);
            } else if (normalized.strategyId === 'stat_ac_sum') {
                weights[n] = 0.8 + (g * 0.4) + (r * 0.35) + (p * 0.25);
            } else if (normalized.strategyId === 'pair_cooccurrence') {
                weights[n] = 0.7 + (g * 0.25) + (p * 1.0);
            } else if (normalized.strategyId === 'adjacency_bias') {
                let adj = 0;
                if (lastDrawSet?.has(n)) adj += 0.2;
                if (lastDrawSet?.has(n - 1)) adj += 0.5;
                if (lastDrawSet?.has(n + 1)) adj += 0.5;
                weights[n] = 0.7 + (g * 0.35) + (adj * 0.8);
            } else if (normalized.strategyId === 'zone_split_3band') {
                weights[n] = 0.75 + (g * 0.3) + (r * 0.3) + (zoneBal * 0.8);
            } else if (normalized.strategyId === 'wheel_full' || normalized.strategyId === 'wheel_reduced_t3') {
                weights[n] = 0.8 + (g * 0.5) + (r * 0.4) + (p * 0.2);
            } else if (normalized.strategyId === 'skip_hit_weighted') {
                weights[n] = 0.7 + (gap * 1.1) + (r * 0.2) + ((1 - g) * 0.2);
            } else if (normalized.strategyId === 'last_digit_balance') {
                weights[n] = 0.75 + (g * 0.3) + (endBal * 0.9);
            } else if (normalized.strategyId === 'delta_gap_pattern') {
                const nearDelta = avgDelta
                    ? 1 - Math.min(Math.abs((n % 10) - (avgDelta % 10)) / 10, 1)
                    : 0.5;
                weights[n] = 0.7 + (g * 0.35) + (nearDelta * 0.8);
            } else if (normalized.strategyId === 'carryover_repeat_control') {
                const repeatPenalty = lastDrawSet?.has(n) ? 0.4 : 1.0;
                weights[n] = (0.75 + (g * 0.35) + (r * 0.2) + (gap * 0.25)) * repeatPenalty;
            } else {
                weights[n] = 0.8 + (g * 0.5) + (r * 0.35) + (gap * 0.25);
            }
        }

        if (isWheel) {
            for (let n = 1; n <= 45; n++) {
                weights[n] = Math.max(weights[n], 0.1);
            }
        }

        return { weights, request: normalized };
    }

    prepareExecution(request, options = {}) {
        const normalizedRequest = options.normalizedRequest || this.normalizeRequest(request);
        const sourceData = options.sourceData || this.data;
        const rng = options.rng || this.getRandomFn(normalizedRequest.params.seed);
        const { weights } = this.computeWeightsFromNormalized(normalizedRequest, sourceData);
        const isWheel = normalizedRequest.strategyId === 'wheel_full' || normalizedRequest.strategyId === 'wheel_reduced_t3';

        return {
            normalizedRequest,
            sourceData,
            rng,
            weights,
            isWheel
        };
    }

    explainSet(numbers, request, options = {}) {
        const candidate = [...(numbers || [])].map(Number).filter((n) => n >= 1 && n <= 45).sort((a, b) => a - b);
        const normalized = this.normalizeRequest(request);
        const sourceData = options.sourceData || this.data;
        const { weights } = this.computeWeightsFromNormalized(normalized, sourceData);
        const ctx = this.buildContext(sourceData, normalized.params.lookbackWindow);
        const totalDraws = Math.max(ctx.totalDraws, 1);
        const freqMax = Math.max(...ctx.freq.slice(1), 1);
        const recentMax = Math.max(...ctx.recentFreq.slice(1), 1);
        const pairMax = Math.max(...ctx.pairCounts.slice(1), 1);

        const numberSignals = candidate.map((n) => {
            const lastSeen = ctx.lastSeen[n];
            const gap = lastSeen >= 0 ? (ctx.totalDraws - 1 - lastSeen) : ctx.totalDraws;
            return {
                number: n,
                weight: Number((weights[n] || 0).toFixed(6)),
                frequencyScore: Number((ctx.freq[n] / freqMax).toFixed(4)),
                recencyScore: Number((ctx.recentFreq[n] / recentMax).toFixed(4)),
                gapScore: Number((gap / totalDraws).toFixed(4)),
                pairScore: Number((ctx.pairCounts[n] / pairMax).toFixed(4))
            };
        });

        const setWeight = candidate.reduce((acc, n) => acc + (weights[n] || 0), 0);
        const setSum = AdvancedMonteCarlo.calculateSum(candidate);
        const setAc = AdvancedMonteCarlo.calculateAC(candidate);
        const passFilter = passesFilters(candidate, normalized.filters);

        return {
            strategyId: normalized.strategyId,
            evidenceTier: normalized.evidenceTier,
            numbers: candidate,
            filtersPass: passFilter,
            summary: {
                setWeight: Number(setWeight.toFixed(6)),
                sum: setSum,
                ac: setAc
            },
            signals: numberSignals
        };
    }

    rankTicket(myNums, winNums, bonus) {
        let hit = 0;
        let hasBonus = false;
        myNums.forEach((n) => {
            if (winNums.includes(n)) hit++;
            if (n === bonus) hasBonus = true;
        });
        if (hit === 6) return 1;
        if (hit === 5 && hasBonus) return 2;
        if (hit === 5) return 3;
        if (hit === 4) return 4;
        if (hit === 3) return 5;
        return 0;
    }

    evaluateTicketSet(ticket, draw) {
        if (!Array.isArray(ticket) || ticket.length !== 6) return { rank: 0, prize: 0 };
        if (!draw || !Array.isArray(draw.numbers)) return { rank: 0, prize: 0 };
        const rank = this.rankTicket(ticket, draw.numbers, draw.bonus);
        if (rank === 1) return { rank, prize: 2000000000 };
        if (rank === 2) return { rank, prize: 50000000 };
        if (rank === 3) return { rank, prize: 1500000 };
        if (rank === 4) return { rank, prize: 50000 };
        if (rank === 5) return { rank, prize: 5000 };
        return { rank: 0, prize: 0 };
    }

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

    generateWheelSet(weights, request, options = {}) {
        const fixed = options.fixed || [];
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

        const wheelBase = seedSet.slice(0, Math.max(guarantee, 1));
        const set = [...wheelBase];
        const dynamicPool = candidates.filter((n) => !set.includes(n));
        while (set.length < 6 && dynamicPool.length) {
            const idx = Math.floor(rng() * dynamicPool.length);
            set.push(dynamicPool[idx]);
            dynamicPool.splice(idx, 1);
        }
        return set.sort((a, b) => a - b);
    }

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
        return this.sampleWithConstraints(fallbackWeights, fixed, exclude, rng);
    }

    generateSet(request, options = {}) {
        const execution = options.execution || this.prepareExecution(request, options);
        return this.generateSetWithExecution(execution, options);
    }

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
    }

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
    }

    recommendFromSimulation(request, options = {}) {
        const setCount = Math.max(1, Math.floor(Number(options.setCount) || 5));
        const execution = options.execution || this.prepareExecution(request, options);
        const sim = this.simulateWeights(request, { ...options, execution });
        const rng = options.rng || this.getRandomFn(sim.request.params.seed);
        const filterEvaluator = options.filterEvaluator || createFilterEvaluator(sim.request.filters);
        const unique = new Set();
        const out = [];
        let attempts = 0;
        const maxAttempts = Math.max(300, setCount * 100);

        while (out.length < setCount && attempts++ < maxAttempts) {
            const candidate = this.sampleWithConstraints(sim.weights, [], [], rng);
            if (!candidate) continue;
            if (!filterEvaluator(candidate, { assumeSorted: true })) continue;
            const key = candidate.join(',');
            if (unique.has(key)) continue;
            unique.add(key);
            out.push(candidate);
        }

        if (out.length < setCount) {
            const remains = this.generateMultipleSets(setCount - out.length, sim.request, { rng });
            for (const set of remains) {
                const key = set.join(',');
                if (!unique.has(key)) {
                    unique.add(key);
                    out.push(set);
                }
            }
        }

        return { sets: out, simulation: sim };
    }
}
