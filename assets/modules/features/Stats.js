import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

export class StatsModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
    }

    render() {
        if (!this.data.state.winningStats.length) return;
        this.renderCharts();
        this.renderNumberDist();
        this.renderHotCold();
        this.renderPairs();
    }

    renderNumberDist() {
        const container = $('#chartNumDist');
        if (!container) return;
        container.innerHTML = '';

        const freq = Array(46).fill(0);
        this.data.state.winningStats.forEach(d => d.numbers.forEach(n => freq[n]++));

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

    renderCharts() {
        // Range Chart
        const rangeCounts = [0, 0, 0, 0, 0];
        const oddEven = [0, 0]; // Even, Odd

        this.data.state.winningStats.forEach(d => {
            d.numbers.forEach(n => {
                // Range
                if (n <= 10) rangeCounts[0]++;
                else if (n <= 20) rangeCounts[1]++;
                else if (n <= 30) rangeCounts[2]++;
                else if (n <= 40) rangeCounts[3]++;
                else rangeCounts[4]++;

                // OddEven
                if (n % 2 === 0) oddEven[0]++; else oddEven[1]++;
            });
        });

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
            <span class="label">짝수 (Even)</span>
            <span class="value">${evenPct.toFixed(1)}% (${data[0]})</span>
          </div>
          <div class="legend-item">
            <span class="dot" style="background: var(--accent)"></span>
            <span class="label">홀수 (Odd)</span>
            <span class="value">${oddPct.toFixed(1)}% (${data[1]})</span>
          </div>
        </div>
      </div>
    `;
    }

    drawBarChart(selector, data) {
        const el = $(selector);
        if (!el) return;
        el.innerHTML = '';

        // Calculate total for percentages
        const total = data.reduce((sum, d) => sum + d.v, 0);
        const max = Math.max(...data.map(d => d.v), 1);

        data.forEach(d => {
            const pct = (d.v / max) * 100;
            const share = total > 0 ? ((d.v / total) * 100).toFixed(1) : 0;
            const colorClass = d.c ? `nd-fill ${d.c}` : 'bar-fill';

            el.innerHTML += `
                <div class="bar-row">
                    <span class="label">${d.l}</span>
                    <div class="bar-track">
                        <div class="${colorClass}" style="width: ${pct}%; height: 100%; border-radius: 4px;"></div>
                    </div>
                    <span class="val">${share}% <small>(${d.v})</small></span>
                </div>
            `;
        });
    }

    renderHotCold() {
        const container = $('#hotColdContainer');
        if (!container) return;
        container.innerHTML = '';

        const freq = Array(46).fill(0);
        this.data.state.winningStats.forEach(d => d.numbers.forEach(n => freq[n]++));

        const indexed = freq.map((c, i) => ({ n: i, c })).slice(1).sort((a, b) => b.c - a.c);
        const hot = indexed.slice(0, 5);
        const cold = indexed.slice(-5).reverse();

        const mkCol = (title, items, cls) => {
            const div = document.createElement('div');
            div.className = `stat-col ${cls}`;
            div.innerHTML = `<h4>${title}</h4>`;
            items.forEach(({ n, c }) => {
                div.innerHTML += `
                    <div class="stat-row">
                        <span class="ball ${UIManager.getBallColor(n)} sm">${n}</span>
                        <span class="count">${c}회</span>
                    </div>`;
            });
            return div;
        };

        container.appendChild(mkCol('🔥 Hot Numbers', hot, 'hot'));
        container.appendChild(mkCol('❄️ Cold Numbers', cold, 'cold'));
    }

    renderPairs() {
        const container = $('#pairContainer');
        if (!container) return;
        container.innerHTML = '';

        const pairCounts = {};

        // Analyze all history
        this.data.state.winningStats.forEach(d => {
            const nums = d.numbers;
            for (let i = 0; i < nums.length; i++) {
                for (let j = i + 1; j < nums.length; j++) {
                    const pair = `${nums[i]}-${nums[j]}`;
                    pairCounts[pair] = (pairCounts[pair] || 0) + 1;
                }
            }
        });

        // Sort by frequency
        const sorted = Object.entries(pairCounts)
            .map(([k, v]) => ({ pair: k.split('-').map(Number), count: v }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10

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
