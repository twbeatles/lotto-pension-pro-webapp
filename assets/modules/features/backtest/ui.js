import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { getStrategyMeta, listStrategies, resolveStrategyId } from '../../core/StrategyCatalog.js';
import { UI_STRINGS } from '../../utils/strings.js';
export const backtestUiMethods = {
    bindEvents() {
        $('#runBacktest')?.addEventListener('click', () => this.run());
        $('#stopBacktest')?.addEventListener('click', () => this.stop());
        $('#btShowExperimental')?.addEventListener('change', () => this.populateStrategySelect());
        $('#btExportCsv')?.addEventListener('click', () => this.exportComparisonCsv());
        $('#btCompareMode')?.addEventListener('change', () => this.toggleCompareMode());
    },

    onEnter() {
        this.renderPersistedState();
    },

    toggleCompareMode() {
        const enabled = Boolean($('#btCompareMode')?.checked);
        const box = $('#btComparePanel');
        if (box) box.style.display = enabled ? 'block' : 'none';
    },

    clearPersistedResults() {
        this.lastSummary = null;
        this.lastComparisons = [];
        this.lastDiagnostics = null;
        this.lastWinRows = [];
        this.lastProgressText = '';
    },

    resetUI({ clearPersisted = false } = {}) {
        const sum = $('#btSummaryList');
        if (sum) sum.innerHTML = '<li>실행 대기 중...</li>';

        const tbody = $('#btResultTable tbody');
        if (tbody) tbody.innerHTML = '';
        const compareTbody = $('#btCompareTable tbody');
        if (compareTbody) compareTbody.innerHTML = '';
        const winner = $('#btWinnerBadge');
        if (winner) winner.textContent = '-';
        this.setProgressStatus('', { persist: false });
        this.currentPayoutMode = this.readPayoutMode();
        this.winRowsBuffer = [];
        if (this.winFlushRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.winFlushRaf);
        }
        this.winFlushRaf = 0;
        const notice = $('#btPayoutNotice');
        if (notice) notice.textContent = '';
        const charts = $('#btMiniCharts');
        if (charts) charts.innerHTML = '';
        if (clearPersisted) {
            this.clearPersistedResults();
        }
    },

    setProgressStatus(text, { persist = true } = {}) {
        const el = $('#btProgressMeta');
        if (persist) {
            this.lastProgressText = text || '';
        }
        if (el) el.textContent = text || '';
    },

    setRunningState(nextRunning) {
        this.isRunning = Boolean(nextRunning);
        const runBtn = $('#runBacktest');
        const stopBtn = $('#stopBacktest');
        if (runBtn) runBtn.disabled = this.isRunning;
        if (stopBtn) stopBtn.disabled = !this.isRunning;
    },

    cleanupWorker() {
        if (!this.worker) return;
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.terminate();
        this.worker = null;
    },

    stop() {
        if (!this.worker) return;
        this.cleanupWorker();
        if (this.winFlushRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.winFlushRaf);
        }
        this.winFlushRaf = 0;
        this.winRowsBuffer = [];
        this.setRunningState(false);
        this.setProgressStatus('중지됨');
        const runBtn = $('#runBacktest');
        if (runBtn && this.runButtonOriginal) runBtn.innerHTML = this.runButtonOriginal;
        UIManager.toast(UI_STRINGS.backtest.stopped, 'info');
    },

    readPayoutMode() {
        const mode = String($('#btPayoutMode')?.value || 'hybrid_dynamic_first');
        return mode === 'fast_fixed' ? 'fast_fixed' : 'hybrid_dynamic_first';
    },

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
                ? UI_STRINGS.backtest.payoutFast
                : UI_STRINGS.backtest.payoutHybrid;
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
    },

    populateStrategySelect() {
        const select = $('#btStrategy');
        const compareList = $('#btCompareList');
        if (!select) return;

        const current = select.value || 'random';
        const includeExperimental = Boolean($('#btShowExperimental')?.checked);
        const strategies = listStrategies({ includeExperimental, scope: 'backtest' });
        select.innerHTML = '';

        strategies.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.label} (등급 ${item.tier})${item.experimental ? ' [실험]' : ''}`;
            select.appendChild(opt);
        });

        const legacy = [
            ['random', '레거시 모델: 랜덤'],
            ['ensemble', '레거시 모델: 앙상블'],
            ['balance', '레거시 모델: 밸런스'],
            ['cold', '레거시 모델: 콜드'],
            ['hot', '레거시 모델: 핫'],
            ['statistical', '레거시 모델: 통계']
        ];
        legacy.forEach(([id, label]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = label;
            select.appendChild(opt);
        });

        const resolved = resolveStrategyId(current);
        if ([...select.options].some((x) => x.value === current)) select.value = current;
        else if ([...select.options].some((x) => x.value === resolved)) select.value = resolved;

        if (compareList) {
            compareList.innerHTML = '';
            strategies.forEach((item) => {
                const label = document.createElement('label');
                label.className = 'check-box';
                label.innerHTML = `
                    <input type="checkbox" name="btCompareStrategy" value="${item.id}">
                    <span class="checkmark"></span>
                    <span>${item.label}</span>
                `;
                compareList.appendChild(label);
            });
        }

        this.toggleCompareMode();
    },

    readNumber(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const raw = String(el.value || '').trim();
        if (!raw) return fallback;
        const n = Number(raw);
        if (!Number.isFinite(n)) return fallback;
        return n;
    },

    range(minId, maxId) {
        const min = this.readNumber(minId, null);
        const max = this.readNumber(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    },

    buildStrategyRequest(strategyIdOverride = null, persist = true) {
        const strategyId = resolveStrategyId(strategyIdOverride || $('#btStrategy')?.value || 'random_baseline');
        const request = {
            strategyId,
            params: {
                simulationCount: this.readNumber('btSimulationCount', 5000),
                lookbackWindow: this.readNumber('btLookbackWindow', 20),
                wheelPoolSize: null,
                wheelGuarantee: null,
                seed: this.readNumber('btSeed', null),
                payoutMode: this.readPayoutMode()
            },
            filters: {
                oddEven: this.range('btOddMin', 'btOddMax'),
                highLow: this.range('btHighMin', 'btHighMax'),
                sumRange: this.range('btSumMin', 'btSumMax'),
                acRange: this.range('btAcMin', 'btAcMax'),
                maxConsecutivePairs: this.readNumber('btMaxConsecutive', null),
                endDigitUniqueMin: this.readNumber('btEndDigitUnique', null)
            }
        };
        if (persist) this.data.setStrategyPrefs('backtest', request);
        return request;
    },

    collectStrategyRequests() {
        const compareMode = Boolean($('#btCompareMode')?.checked);
        const primary = this.buildStrategyRequest(null, true);
        if (!compareMode) return [primary];

        const checked = [...document.querySelectorAll('input[name="btCompareStrategy"]:checked')]
            .map((el) => resolveStrategyId(el.value))
            .filter(Boolean);

        const unique = new Set([primary.strategyId, ...checked]);
        const ids = [...unique].slice(0, this.MAX_COMPARE_STRATEGIES);
        return ids.map((id, idx) => this.buildStrategyRequest(id, idx === 0));
    },

    applyStrategyRequest(saved) {
        if (!saved) return;
        const assign = (id, value) => {
            const el = $(`#${id}`);
            if (el && value !== undefined && value !== null) el.value = value;
        };
        assign('btSimulationCount', saved.params?.simulationCount);
        assign('btLookbackWindow', saved.params?.lookbackWindow);
        assign('btSeed', saved.params?.seed ?? '');
        assign('btPayoutMode', saved.params?.payoutMode || 'hybrid_dynamic_first');
        this.currentPayoutMode = this.readPayoutMode();

        const pair = (minId, maxId, values) => {
            const minEl = $(`#${minId}`);
            const maxEl = $(`#${maxId}`);
            if (!minEl || !maxEl) return;
            if (Array.isArray(values) && values.length >= 2) {
                minEl.value = values[0];
                maxEl.value = values[1];
            }
        };
        pair('btOddMin', 'btOddMax', saved.filters?.oddEven);
        pair('btHighMin', 'btHighMax', saved.filters?.highLow);
        pair('btSumMin', 'btSumMax', saved.filters?.sumRange);
        pair('btAcMin', 'btAcMax', saved.filters?.acRange);
        assign('btMaxConsecutive', saved.filters?.maxConsecutivePairs);
        assign('btEndDigitUnique', saved.filters?.endDigitUniqueMin);

        const strategyId = resolveStrategyId(saved.strategyId || 'random_baseline');
        const select = $('#btStrategy');
        if (select && [...select.options].some((x) => x.value === strategyId)) {
            select.value = strategyId;
        }
    },

    applySavedStrategyPrefs() {
        this.applyStrategyRequest(this.data.state.strategyPrefs?.backtest);
    },

    exportComparisonCsv() {
        if (!this.lastComparisons.length) {
            UIManager.toast(UI_STRINGS.backtest.emptyExport, 'warning');
            return;
        }

        const header = ['strategy_id', 'strategy_label', 'roi', 'hit_rate', 'draws', 'tickets', 'total_cost', 'total_prize', 'win_count'];
        const lines = [header.join(',')];
        this.lastComparisons.forEach((x) => {
            lines.push([
                x.strategyId || '',
                this.getStrategyLabel(x.strategyId),
                Number(x.roi || 0).toFixed(4),
                Number(x.hitRate || 0).toFixed(4),
                Number(x.draws || 0),
                Number(x.tickets || 0),
                Number(x.cost || 0),
                Number(x.totalPrize || 0),
                Number(x.winCount || 0)
            ].join(','));
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `시뮬레이션_전략비교_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        UIManager.toast(UI_STRINGS.backtest.exported, 'success');
    }
};
