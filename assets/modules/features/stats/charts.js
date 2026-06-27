import { $ } from '../../utils/utils.js';

export const statsChartMethods = {
    renderCharts(analytics) {
        const rangeCounts = analytics.rangeCounts || [0, 0, 0, 0, 0];
        const oddEven = analytics.oddEven || [0, 0];
        this.drawBarChart('#chartRange', [
            { l: '1-10', v: rangeCounts[0], c: 'y' },
            { l: '11-20', v: rangeCounts[1], c: 'b' },
            { l: '21-30', v: rangeCounts[2], c: 'r' },
            { l: '31-40', v: rangeCounts[3], c: 'g' },
            { l: '41-45', v: rangeCounts[4], c: 'g2' }
        ]);

        this.renderOddEvenPie(oddEven);
    },

    renderOddEvenPie(data) {
        const el = $('#chartOddEven');
        if (!el) return;
        el.innerHTML = '';

        // data[0] = Even, data[1] = Odd
        const total = data[0] + data[1];
        if (total === 0) return;

        const evenPct = (data[0] / total) * 100;
        const oddPct = (data[1] / total) * 100;

        el.innerHTML = `
      <div class="pie-chart-container">
        <div class="pie-chart" style="background: conic-gradient(var(--primary) 0% ${evenPct}%, var(--accent) ${evenPct}% 100%);">
          <div class="pie-hole"></div>
        </div>
        <div class="pie-legend">
          <div class="legend-item">
            <span class="dot" style="background: var(--primary)"></span>
            <span class="label">짝수</span>
            <span class="value">${evenPct.toFixed(1)}% (${data[0]})</span>
          </div>
          <div class="legend-item">
            <span class="dot" style="background: var(--accent)"></span>
            <span class="label">홀수</span>
            <span class="value">${oddPct.toFixed(1)}% (${data[1]})</span>
          </div>
        </div>
      </div>
    `;
    },

    drawBarChart(selector, data) {
        const el = $(selector);
        if (!el) return;

        // Calculate total for percentages
        const total = data.reduce((sum, d) => sum + d.v, 0);
        const max = Math.max(...data.map((d) => d.v), 1);
        let html = '';
        data.forEach((d) => {
            const pct = (d.v / max) * 100;
            const share = total > 0 ? ((d.v / total) * 100).toFixed(1) : 0;
            const colorClass = d.c ? `nd-fill ${d.c}` : 'bar-fill';
            html += `
                <div class="bar-row">
                    <span class="label">${d.l}</span>
                    <div class="bar-track">
                        <div class="${colorClass}" style="width: ${pct}%; height: 100%; border-radius: 4px;"></div>
                    </div>
                    <span class="val">${share}% <small>(${d.v})</small></span>
                </div>
            `;
        });
        el.innerHTML = html;
    }
};