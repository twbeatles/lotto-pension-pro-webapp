export class AdvancedMonteCarlo {
    constructor(winningStats) {
        this.data = [...winningStats].sort((a, b) => a.draw_no - b.draw_no);
        this.totalDraws = this.data.length;
    }

    // Model 1: Frequency Weights (Hot/Cold)
    getModelFrequency() {
        const scores = Array(46).fill(0);
        const recentWindow = 10;

        // Global freq
        const freq = Array(46).fill(0);
        this.data.forEach(d => d.numbers.forEach(n => freq[n]++));

        // Recent freq
        const recentFreq = Array(46).fill(0);
        this.data.slice(-recentWindow).forEach(d => d.numbers.forEach(n => recentFreq[n]++));

        for (let n = 1; n <= 45; n++) {
            // Balance: 40% Global, 60% Recent Trend
            const sGlobal = freq[n] / this.totalDraws;
            const sRecent = recentFreq[n] / recentWindow;
            scores[n] = (sGlobal * 0.4) + (sRecent * 0.6);
        }
        return scores;
    }

    // Model 2: Pattern/Recency (Skipped Draws)
    getModelRecency() {
        const lastSeen = Array(46).fill(-1);
        this.data.forEach((d, i) => d.numbers.forEach(n => lastSeen[n] = i));

        const scores = Array(46).fill(0);
        const avgCycle = 8;

        for (let n = 1; n <= 45; n++) {
            const skipped = this.totalDraws - 1 - lastSeen[n];
            const cycleScore = Math.exp(-Math.pow(skipped - avgCycle, 2) / 20);
            const coldBoost = skipped > 20 ? 0.5 : 0;
            scores[n] = cycleScore + coldBoost + 0.1;
        }
        return scores;
    }

    // Model 3: Adjacency/Consecutive Proximity
    getModelAdjacency() {
        const scores = Array(46).fill(0.1);
        if (this.totalDraws < 1) return scores;

        const lastDraw = this.data[this.totalDraws - 1].numbers;
        lastDraw.forEach(n => {
            if (n > 1) scores[n - 1] += 0.5;
            if (n < 45) scores[n + 1] += 0.5;
            scores[n] += 0.2;
        });
        return scores;
    }

    static weightedSample(weights, k = 6) {
        const chosen = new Set();
        const pool = weights.map((w, i) => ({ n: i, w }));

        let limit = 0;
        while (chosen.size < k && limit++ < 100) {
            const total = pool.reduce((acc, p) => acc + (chosen.has(p.n) || p.n === 0 ? 0 : p.w), 0);
            let r = Math.random() * total;
            for (let i = 1; i <= 45; i++) {
                if (chosen.has(i)) continue;
                r -= pool[i].w;
                if (r <= 0) {
                    chosen.add(i);
                    break;
                }
            }
        }
        return [...chosen].sort((a, b) => a - b);
    }

    // --- Helpers for Advanced Features ---
    static calculateSum(numbers) {
        return numbers.reduce((a, b) => a + b, 0);
    }

    static calculateAC(numbers) {
        // AC = D - (r - 1)
        // D: Count of unique differences between all pairs
        // r: Count of numbers (6)
        if (!numbers || numbers.length < 6) return 0;

        const diffs = new Set();
        for (let i = 0; i < numbers.length; i++) {
            for (let j = i + 1; j < numbers.length; j++) {
                const d = Math.abs(numbers[i] - numbers[j]);
                diffs.add(d);
            }
        }
        return diffs.size - (6 - 1);
    }

    static getEndDigits(numbers) {
        return numbers.map(n => n % 10);
    }

    runSimulation(strategy = 'ensemble') {
        // 1. Compute Base Weights from 3 Models
        const wFreq = this.getModelFrequency();
        const wRecency = this.getModelRecency();
        const wAdj = this.getModelAdjacency();

        // 2. Combine Weights based on Strategy
        const finalWeights = Array(46).fill(0);

        if (strategy === 'cold') {
            // Cold Focus: 100% Recency
            for (let n = 1; n <= 45; n++) finalWeights[n] = wRecency[n];
        } else if (strategy === 'hot') {
            // Hot Focus: 100% Frequency
            for (let n = 1; n <= 45; n++) finalWeights[n] = wFreq[n];
        } else if (strategy === 'statistical') {
            // Statistical: Heavy weight on Adjacency & Frequency
            for (let n = 1; n <= 45; n++) {
                finalWeights[n] = (wFreq[n] * 0.4) + (wRecency[n] * 0.2) + (wAdj[n] * 0.4);
            }
        } else {
            // Ensemble & Balance: Balanced Mix
            for (let n = 1; n <= 45; n++) {
                finalWeights[n] = (wFreq[n] * 0.5) + (wRecency[n] * 0.3) + (wAdj[n] * 0.2);
            }
        }

        // 3. Monte Carlo Simulation
        const simCounts = Array(46).fill(0);
        const SIMULATIONS = 5000;
        const collectedSets = [];

        // Safety check
        const totalWeight = finalWeights.reduce((a, b) => a + b, 0);
        if (totalWeight <= 0) finalWeights.fill(1);

        for (let i = 0; i < SIMULATIONS; i++) {
            try {
                const simSet = AdvancedMonteCarlo.weightedSample(finalWeights, 6);

                // Strategy Filtering
                if (strategy === 'balance') {
                    // Filter: Odd/Even Ratio (2:4 ~ 4:2)
                    const oddCount = simSet.filter(n => n % 2 !== 0).length;
                    if (oddCount < 2 || oddCount > 4) continue; // Skip extreme ratios

                    // Filter: Sum (100 ~ 170)
                    const sum = AdvancedMonteCarlo.calculateSum(simSet);
                    if (sum < 100 || sum > 170) continue; // Skip extreme sums
                }

                if (strategy === 'statistical') {
                    // Strict Filter for "Statistical" Model
                    // 1. AC Value: 7 ~ 10 (Most common winning range)
                    const ac = AdvancedMonteCarlo.calculateAC(simSet);
                    if (ac < 7) continue;

                    // 2. Sum: 100 ~ 175
                    const sum = AdvancedMonteCarlo.calculateSum(simSet);
                    if (sum < 100 || sum > 175) continue;
                }

                simSet.forEach(n => simCounts[n]++);
                collectedSets.push(simSet); // Keep valid sets
            } catch (e) {
                continue;
            }
        }

        // Return counts directly for now
        return simCounts;
    }
}
