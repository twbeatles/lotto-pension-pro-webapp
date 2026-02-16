import { $, sleep } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

import { AdvancedMonteCarlo } from '../core/MonteCarlo.js';

export class AiModule {
    constructor(app) {
        this.app = app;
        const btn = $('#aiPredictBtn');
        if (btn) btn.addEventListener('click', () => this.run());

        // Restore state if available
        if (this.app.data.state.aiResults && this.app.data.state.aiResults.length > 0) {
            this.renderResults(this.app.data.state.aiResults);
        }
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

        const strategy = $('#aiModelSelect').value || 'ensemble';

        const strategyNames = {
            'ensemble': '앙상블 (Ensemble)',
            'statistical': '정밀 통계 (Statistical)',
            'balance': '패턴 밸런스 (Balanced)',
            'cold': '콜드 포커스 (Cold Focus)',
            'hot': '핫 포커스 (Hot Focus)'
        };

        const LOGS = [
            `선택된 모델: ${strategyNames[strategy]}`,
            '데이터 패턴 학습 (Frequency, Recency, Pattern)...',
            '전략별 가중치 재조정...',
            '몬테카를로 시뮬레이션 (5,000회 수행)...',
            '최적 번호 조합 추출 중...'
        ];

        try {
            for (const msg of LOGS) {
                log.innerHTML += `<div>> ${msg}</div>`;
                await sleep(400); // Simulate processing time
                log.scrollTop = log.scrollHeight;
            }

            const mc = new AdvancedMonteCarlo(this.app.data.state.winningStats);
            await sleep(100);

            // Run Simulation with Safety
            const finalWeights = mc.runSimulation(strategy);
            if (!finalWeights || finalWeights.length === 0) {
                throw new Error('Simulation returned empty results');
            }

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

            // Ensure uniqueness
            const keys = new Set();
            if (top6.length === 6) {
                keys.add(top6.join(','));
                results.push(top6);
            }

            // Set 2-5: Variation
            let safety = 0;
            // Increase safety limit for strict filtering
            const maxAttempts = strategy === 'statistical' ? 200 : 50;

            while (results.length < 5 && safety++ < maxAttempts) {
                const set = AdvancedMonteCarlo.weightedSample(finalWeights, 6);

                // Strict Validation for Statistical Model
                if (strategy === 'statistical') {
                    const ac = AdvancedMonteCarlo.calculateAC(set);
                    const sum = AdvancedMonteCarlo.calculateSum(set);
                    // Filter: AC 7~10 AND Sum 100~175
                    if (ac < 7 || sum < 100 || sum > 175) continue;
                }

                const k = set.join(',');
                if (!keys.has(k)) {
                    keys.add(k);
                    results.push(set);
                }
            }

            // Save state
            this.app.data.state.aiResults = results;
            this.renderResults(results);

        } catch (e) {
            console.error('AI Error:', e);
            log.innerHTML += `<div style="color:var(--danger)">> 오류 발생: ${e.message}</div>`;
            log.scrollTop = log.scrollHeight;
            UIManager.toast('분석 중 오류가 발생했습니다.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph-bold ph-brain"></i> 재분석';
        }
    }

    renderResults(results) {
        const out = $('#aiOutput');
        if (!out) return;

        out.innerHTML = '';
        results.forEach((set, idx) => {
            const sum = AdvancedMonteCarlo.calculateSum(set);
            const ac = AdvancedMonteCarlo.calculateAC(set);

            const row = document.createElement('div');
            row.className = 'ai-card-row';
            row.style.animationDelay = `${idx * 0.1}s`;

            // Badges
            let badgHtml = `
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    합계: ${sum}
                </span>
                <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-muted); font-size:11px;">
                    AC: ${ac}
                </span>
            `;

            // Ball HTML
            const ballsHtml = set.map(n => {
                let colorClass = 'yellow';
                if (n <= 10) colorClass = 'yellow';
                else if (n <= 20) colorClass = 'blue';
                else if (n <= 30) colorClass = 'red';
                else if (n <= 40) colorClass = 'gray';
                else colorClass = 'green';
                return `<span class="ball ${colorClass}">${n}</span>`;
            }).join('');

            row.innerHTML = `
                <div class="ai-card-header" style="justify-content:space-between; display:flex; margin-bottom:8px;">
                     <span class="rank-badge">#${idx + 1}</span>
                     <div class="meta-badges" style="display:flex; gap:4px;">${badgHtml}</div>
                </div>
                <div class="ball-container left">${ballsHtml}</div>
                <div class="row-actions" style="margin-top:8px; display:flex; justify-content:flex-end;">
                     <button class="btn ghost sm pick-btn" data-nums="${set.join(',')}">선택</button>
                </div>
            `;

            out.appendChild(row);
        });

        // Bind events
        out.querySelectorAll('.pick-btn').forEach(b => {
            b.addEventListener('click', (e) => {
                const nums = e.target.dataset.nums.split(',').map(Number);
                this.app.requestNumbers(nums);
            });
        });
    }
}
