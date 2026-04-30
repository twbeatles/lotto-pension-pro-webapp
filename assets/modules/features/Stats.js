import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

export class StatsModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.lastAnalyticsId = '';
        this.hasRendered = false;
    }

    render(force = false) {
        if (!this.data.state.winningStats.length) return;
        const analytics = this.data.getAnalytics();
        if (!analytics) return;
        if (!force && this.hasRendered && analytics.id === this.lastAnalyticsId) return;
        this.lastAnalyticsId = analytics.id;
        this.hasRendered = true;

        // Optimize rendering to prevent UI blocking
        requestAnimationFrame(() => {
            this.renderCharts(analytics);
            this.renderNumberDist(analytics);
            this.renderHotCold(analytics);
            this.renderPairs(analytics);
        });
    }

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
    }

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
    }

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
}
