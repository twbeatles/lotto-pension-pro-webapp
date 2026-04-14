import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { getStrategyMeta, resolveStrategyId } from '../../core/StrategyCatalog.js';

export const backtestRenderingMethods = {
    getPayoutModeLabel(mode) {
        return mode === 'fast_fixed' ? '고정 상금' : '하이브리드 동적 1등';
    },

    getStrategyLabel(strategyId) {
        return getStrategyMeta(resolveStrategyId(strategyId)).label;
    },

    renderMetricCharts(summary, comparisons = []) {
        const container = $('#btMiniCharts');
        if (!container) return;
        if (!summary && !comparisons.length) {
            container.innerHTML = '';
            return;
        }

        const comparisonSource = comparisons.length
            ? [...comparisons].sort((a, b) => Number(b.roi || 0) - Number(a.roi || 0))[0]
            : null;

        const hitCount = summary?.counts
            ? Number(summary.counts[1] || 0) + Number(summary.counts[2] || 0) + Number(summary.counts[3] || 0) + Number(summary.counts[4] || 0) + Number(summary.counts[5] || 0)
            : 0;
        const summaryHitRate = summary?.tickets ? (hitCount / Number(summary.tickets || 1)) * 100 : 0;
        const prizeBase = comparisonSource ? Number(comparisonSource.totalPrize || 0) : Number(summary?.totalPrize || 0);
        const prizeMax = Math.max(prizeBase, ...(comparisons || []).map((row) => Number(row.totalPrize || 0)), 1);
        const roiValue = comparisonSource ? Number(comparisonSource.roi || 0) : Number((((Number(summary?.totalPrize || 0) - Number(summary?.cost || 0)) / Math.max(1, Number(summary?.cost || 0))) * 100) || 0);
        const hitRateValue = comparisonSource ? Number(comparisonSource.hitRate || 0) : summaryHitRate;
        const prizeValue = prizeBase;

        const metrics = [
            {
                label: 'ROI',
                value: `${roiValue.toFixed(2)}%`,
                width: Math.min(100, Math.max(12, Math.abs(roiValue))),
                tone: roiValue >= 0 ? 'good' : 'warn'
            },
            {
                label: '적중률',
                value: `${hitRateValue.toFixed(2)}%`,
                width: Math.min(100, Math.max(8, hitRateValue)),
                tone: 'info'
            },
            {
                label: '총상금',
                value: Number(prizeValue || 0).toLocaleString(),
                width: Math.min(100, Math.max(10, (Number(prizeValue || 0) / prizeMax) * 100)),
                tone: 'good'
            }
        ];

        container.innerHTML = metrics.map((metric) => `
            <div class="bt-mini-chart">
                <div class="bt-mini-chart-head">
                    <span>${metric.label}</span>
                    <strong>${metric.value}</strong>
                </div>
                <div class="bt-mini-track">
                    <span class="bt-mini-fill is-${metric.tone}" style="width:${metric.width}%"></span>
                </div>
            </div>
        `).join('');
    },

    renderSummary(stats, { persist = true } = {}) {
        const el = $('#btSummaryList');
        if (!el || !stats) return;
        if (persist) {
            this.lastSummary = {
                ...stats,
                counts: { ...(stats.counts || {}) }
            };
        }
        const pct = (n, d) => d ? ((n / d) * 100).toFixed(2) : '0.00';
        const roi = stats.cost > 0 ? (((stats.totalPrize - stats.cost) / stats.cost) * 100) : 0;
        const payoutMode = stats.payoutMode || this.currentPayoutMode || 'hybrid_dynamic_first';
        const payoutLabel = this.getPayoutModeLabel(payoutMode);
        const notice = $('#btPayoutNotice');
        if (notice) {
            notice.textContent = payoutMode === 'fast_fixed'
                ? '고정 상금 모드'
                : '하이브리드 동적 1등 모드';
        }

        el.innerHTML = `
      <li><b>전략</b>: ${stats.strategyId ? this.getStrategyLabel(stats.strategyId) : '-'}</li>
      <li><b>상금 계산</b>: ${payoutLabel}</li>
      <li><b>대상 회차 수</b>: ${stats.draws}</li>
      <li><b>요청 티켓 수</b>: ${Number(stats.requestedTickets || 0).toLocaleString()}</li>
      <li><b>생성 티켓 수</b>: ${Number(stats.generatedTickets || 0).toLocaleString()}</li>
      <li><b>생성 충족률</b>: ${Number(stats.fillRate || 0).toFixed(2)}%</li>
      <li><b>총 구매 수</b>: ${stats.tickets}</li>
      <li><b>총 비용</b>: ${Number(stats.cost || 0).toLocaleString()}</li>
      <li><b>총 상금</b>: ${Number(stats.totalPrize || 0).toLocaleString()}</li>
      <li><b>순손익</b>: ${(Number(stats.totalPrize || 0) - Number(stats.cost || 0)).toLocaleString()}</li>
      <li><b>ROI</b>: ${roi.toFixed(2)}%</li>
      <li><b>1등</b>: ${stats.counts[1]} / <b>2등</b>: ${stats.counts[2]} / <b>3등</b>: ${stats.counts[3]}</li>
      <li><b>4등</b>: ${stats.counts[4]} / <b>5등</b>: ${stats.counts[5]} / <b>미당첨</b>: ${stats.counts[0]}</li>
      <li><b>5등 이상 적중률</b>: ${pct(stats.counts[1] + stats.counts[2] + stats.counts[3] + stats.counts[4] + stats.counts[5], stats.tickets)}%</li>
    `;
        this.renderMetricCharts(this.lastSummary || stats, this.lastComparisons);
    },

    renderComparisons(comparisons = [], diagnostics = {}, { persist = true } = {}) {
        if (persist) {
            this.lastComparisons = [...comparisons];
            this.lastDiagnostics = diagnostics ? { ...diagnostics } : {};
        }
        const tbody = $('#btCompareTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const sorted = [...comparisons].sort((a, b) => Number(b.roi || 0) - Number(a.roi || 0));
        sorted.forEach((row, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td>${this.getStrategyLabel(row.strategyId)}</td>
                <td>${Number(row.roi || 0).toFixed(2)}%</td>
                <td>${Number(row.hitRate || 0).toFixed(2)}%</td>
                <td>${Number(row.cost || 0).toLocaleString()}</td>
                <td>${Number(row.totalPrize || 0).toLocaleString()}</td>
                <td>${Number(row.winCount || 0).toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });

        const winner = $('#btWinnerBadge');
        if (winner) {
            const winnerId = diagnostics?.winner || sorted[0]?.strategyId || '';
            winner.textContent = winnerId ? this.getStrategyLabel(winnerId) : '-';
        }
        this.renderMetricCharts(this.lastSummary, this.lastComparisons);
    },

    appendWinRowToFragment(row, fragment) {
        if (!row || !fragment) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${row.strategyId ? this.getStrategyLabel(row.strategyId) : '-'}</td>
      <td>${row.drawNo}</td>
      <td>${row.rank}</td>
      <td>${row.hitText}</td>
      <td><div class="ball-container sm">${UIManager.renderBalls(row.nums, 'sm')}</div></td>
    `;
        fragment.appendChild(tr);
    },

    flushWinRows() {
        const tbody = $('#btResultTable tbody');
        if (!tbody || !this.winRowsBuffer.length) return;

        const fragment = document.createDocumentFragment();
        const rows = this.winRowsBuffer.splice(0, this.winRowsBuffer.length);
        rows.forEach((row) => this.appendWinRowToFragment(row, fragment));
        tbody.appendChild(fragment);
    },

    renderStoredWinRows() {
        const tbody = $('#btResultTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!this.lastWinRows.length) return;

        const fragment = document.createDocumentFragment();
        this.lastWinRows.forEach((row) => this.appendWinRowToFragment(row, fragment));
        tbody.appendChild(fragment);
    },

    queueWinRows(rows = []) {
        if (!Array.isArray(rows) || !rows.length) return;
        this.lastWinRows.push(...rows);
        this.winRowsBuffer.push(...rows);
        if (this.winFlushRaf) return;

        if (typeof requestAnimationFrame === 'function') {
            this.winFlushRaf = requestAnimationFrame(() => {
                this.winFlushRaf = 0;
                this.flushWinRows();
            });
            return;
        }

        this.flushWinRows();
    },

    renderPersistedState() {
        this.resetUI();
        if (this.lastSummary) {
            this.renderSummary(this.lastSummary, { persist: false });
        }
        if (this.lastComparisons.length) {
            this.renderComparisons(this.lastComparisons, this.lastDiagnostics || {}, { persist: false });
        }
        this.renderStoredWinRows();
        this.setProgressStatus(this.lastProgressText);
        if (!this.lastSummary && !this.lastComparisons.length && !this.lastWinRows.length) {
            this.setProgressStatus('');
        }
        this.setRunningState(this.isRunning);
    }
};
