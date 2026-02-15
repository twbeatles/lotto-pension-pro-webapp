import { $, sleep } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

import { AdvancedMonteCarlo } from '../core/MonteCarlo.js';

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

        const strategy = $('#aiModelSelect').value || 'ensemble';

        const strategyNames = {
            'ensemble': '앙상블 (Ensemble)',
            'balance': '패턴 밸런스 (Balanced)',
            'cold': '콜드 포커스 (Cold Focus)',
            'hot': '핫 포커스 (Hot Focus)'
        };

        const LOGS = [
            `선택된 모델: ${strategyNames[strategy]}`,
            '데이터 패턴 학습 (Frequency, Recency, Pattern)...',
            '전략별 가중치 재조정...',
            '몬테카를로 시뮬레이션 (2,000회 수행)...',
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

            if (top6.length < 6) throw new Error('Not enough data to generate patterns');
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
}
