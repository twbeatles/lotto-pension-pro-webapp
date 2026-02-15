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

    runSimulation() {
        // 1. Compute Base Weights from 3 Models
        const wFreq = this.getModelFrequency();
        const wRecency = this.getModelRecency();
        const wAdj = this.getModelAdjacency();

        // 2. Combine Weights (Ensemble)
        const ensembleWeights = Array(46).fill(0);
        for (let n = 1; n <= 45; n++) {
            // 50% Frequency, 30% Recency, 20% Adjacency
            ensembleWeights[n] = (wFreq[n] * 0.5) + (wRecency[n] * 0.3) + (wAdj[n] * 0.2);
        }

        // 3. Monte Carlo Simulation
        // Simulate 2000 future draws using the ensemble probabilities
        const simCounts = Array(46).fill(0);
        const SIMULATIONS = 2000;

        // Safety check for weights
        const totalWeight = ensembleWeights.reduce((a, b) => a + b, 0);
        if (totalWeight <= 0) {
            console.warn('Invalid weights, using uniform distribution');
            ensembleWeights.fill(1);
        }

        for (let i = 0; i < SIMULATIONS; i++) {
            try {
                const simSet = AdvancedMonteCarlo.weightedSample(ensembleWeights, 6);
                simSet.forEach(n => simCounts[n]++);
            } catch (e) {
                console.warn('Simulation step failed', e);
                continue;
            }
        }

        // 4. Final Selection
        return simCounts;
    }
}
