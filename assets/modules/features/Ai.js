import { $, sleep } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

class AdvancedMonteCarlo {
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

        for (let i = 0; i < SIMULATIONS; i++) {
            const simSet = AdvancedMonteCarlo.weightedSample(ensembleWeights, 6);
            simSet.forEach(n => simCounts[n]++);
        }

        // 4. Final Selection
        return simCounts;
    }
}

export class AiModule {
    constructor(app) {
        this.app = app;
        const btn = $('#aiPredictBtn');
        if (btn) btn.addEventListener('click', () => this.run());
    }

    async run() {
        const btn = $('#aiPredictBtn');
        const out = $('#aiOutput');
        const log = $('#aiLogArea');

        if (!this.app.data.state.winningStats.length) {
            UIManager.toast('당첨 데이터가 없습니다. (data/winning_stats.json)', 'error', 3000);
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 분석 중...';
        out.innerHTML = '';
        log.innerHTML = '';

        const LOGS = [
            '데이터 패턴 학습 (Frequency, Recency, Pattern)...',
            '앙상블 모델 가중치 병합...',
            '몬테카를로 시뮬레이션 (2,000회 수행)...',
            '최적 번호 조합 추출 중...'
        ];

        for (const msg of LOGS) {
            log.innerHTML += `<div>> ${msg}</div>`;
            await sleep(400);
            log.scrollTop = log.scrollHeight;
        }

        const mc = new AdvancedMonteCarlo(this.app.data.state.winningStats);
        await sleep(100);
        const finalWeights = mc.runSimulation();

        log.innerHTML += `<div style="color:var(--success)">> 분석 완료! 5개 추천 조합 생성.</div>`;
        log.scrollTop = log.scrollHeight;

        const results = [];

        // Set 1: Best
        const top6 = finalWeights
            .map((c, n) => ({ n, c }))
            .sort((a, b) => b.c - a.c)
            .slice(0, 6)
            .map(x => x.n)
            .sort((a, b) => a - b);
        results.push(top6);

        // Set 2-5: Variation
        for (let k = 0; k < 4; k++) {
            results.push(AdvancedMonteCarlo.weightedSample(finalWeights, 6));
        }

        results.forEach((nums, i) => {
            setTimeout(() => {
                const el = document.createElement('div');
                el.className = 'result-item glass';
                el.innerHTML = `
          <div class="result-label">Set ${i + 1} ${i === 0 ? '<span class="badge ok">Best</span>' : ''}</div>
          <div class="ball-container">${UIManager.renderBalls(nums)}</div>
        `;
                out.appendChild(el);
            }, i * 150);
        });

        btn.disabled = false;
        btn.innerHTML = '<i class="ph-bold ph-brain"></i> 재분석';
    }
}
