import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';

export const statsPairsMethods = {
    renderPairs(analytics) {
        const container = $('#pairContainer');
        if (!container) return;
        container.innerHTML = '';
        const sorted = analytics.topPairs || [];

        sorted.forEach(({ pair, count }) => {
            const el = document.createElement('div');
            el.className = 'pair-card';
            el.innerHTML = `
        <div class="balls">
          <span class="ball sm ${UIManager.getBallColor(pair[0])}">${pair[0]}</span>
          <span class="ball sm ${UIManager.getBallColor(pair[1])}">${pair[1]}</span>
        </div>
        <div class="count"><strong>${count}회</strong> 출현</div>
      `;
            container.appendChild(el);
        });
    }
};