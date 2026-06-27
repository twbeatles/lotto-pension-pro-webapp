import { $ } from '../../../utils/utils.js';

export const backtestRenderingChartMethods = {
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
            ? Number(summary.counts[1] || 0) +
              Number(summary.counts[2] || 0) +
              Number(summary.counts[3] || 0) +
              Number(summary.counts[4] || 0) +
              Number(summary.counts[5] || 0)
            : 0;
        const summaryHitRate = summary?.tickets ? (hitCount / Number(summary.tickets || 1)) * 100 : 0;
        const prizeBase = comparisonSource
            ? Number(comparisonSource.totalPrize || 0)
            : Number(summary?.totalPrize || 0);
        const prizeMax = Math.max(prizeBase, ...(comparisons || []).map((row) => Number(row.totalPrize || 0)), 1);
        const roiValue = comparisonSource
            ? Number(comparisonSource.roi || 0)
            : Number(
                  ((Number(summary?.totalPrize || 0) - Number(summary?.cost || 0)) /
                      Math.max(1, Number(summary?.cost || 0))) *
                      100 || 0
              );
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

        container.innerHTML = metrics
            .map(
                (metric) => `
            <div class="bt-mini-chart">
                <div class="bt-mini-chart-head">
                    <span>${metric.label}</span>
                    <strong>${metric.value}</strong>
                </div>
                <div class="bt-mini-track">
                    <span class="bt-mini-fill is-${metric.tone}" style="width:${metric.width}%"></span>
                </div>
            </div>
        `
            )
            .join('');
    }
};