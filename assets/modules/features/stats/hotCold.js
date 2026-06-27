import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';

export const statsHotColdMethods = {
    renderHotCold(analytics) {
        const container = $('#hotColdContainer');
        if (!container) return;
        container.innerHTML = '';
        const hot = analytics.hot || [];
        const cold = analytics.cold || [];

        const mkCol = (title, items, cls) => {
            const div = document.createElement('div');
            div.className = `stat-col ${cls}`;
            const rows = items
                .map(
                    ({ n, c }) => `
                    <div class="stat-row">
                        <span class="ball ${UIManager.getBallColor(n)} sm">${n}</span>
                        <span class="count">${c}회</span>
                    </div>`
                )
                .join('');
            div.innerHTML = `<h4>${title}</h4>${rows}`;
            return div;
        };

        container.appendChild(mkCol('🔥 자주 나온 번호', hot, 'hot'));
        container.appendChild(mkCol('❄️ 드물게 나온 번호', cold, 'cold'));
    }
};