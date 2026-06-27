import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';

export const statsDistributionMethods = {
    renderNumberDist(analytics) {
        const container = $('#chartNumDist');
        if (!container) return;
        const freq = analytics.freq || Array(46).fill(0);

        // Find max for scaling
        const max = Math.max(...freq.slice(1));

        // Render 45 bars
        let html = '<div class="num-dist-chart">';
        for (let i = 1; i <= 45; i++) {
            const h = (freq[i] / max) * 100;
            const color = UIManager.getBallColor(i);
            html += `
            <div class="nd-bar-col">
                <div class="nd-track">
                    <div class="nd-fill ${color}" style="height: ${h}%;" title="${i}번: ${freq[i]}회"></div>
                </div>
                <span class="nd-label">${i}</span>
            </div>
        `;
        }
        html += '</div>';
        container.innerHTML = html;
    }
};