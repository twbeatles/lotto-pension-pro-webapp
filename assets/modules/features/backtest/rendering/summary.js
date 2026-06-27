import { $ } from '../../../utils/utils.js';

export const backtestRenderingSummaryMethods = {
    renderSummary(stats, { persist = true } = {}) {
        const el = $('#btSummaryList');
        if (!el || !stats) return;
        if (persist) {
            this.lastSummary = {
                ...stats,
                counts: { ...(stats.counts || {}) }
            };
        }
        const pct = (n, d) => (d ? ((n / d) * 100).toFixed(2) : '0.00');
        const roi = stats.cost > 0 ? ((stats.totalPrize - stats.cost) / stats.cost) * 100 : 0;
        const payoutMode = stats.payoutMode || this.currentPayoutMode || 'hybrid_dynamic_first';
        const payoutLabel = this.getPayoutModeLabel(payoutMode);
        const notice = $('#btPayoutNotice');
        if (notice) {
            notice.textContent = payoutMode === 'fast_fixed' ? '고정 상금 모드' : '하이브리드 동적 1등 모드';
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
    }
};