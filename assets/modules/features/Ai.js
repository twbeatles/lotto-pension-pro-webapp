import { $, sleep } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

export { AdvancedMonteCarlo } from '../core/MonteCarlo.js';

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
