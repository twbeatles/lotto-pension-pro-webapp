import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { getStrategyMeta, listStrategies, resolveStrategyId } from '../core/StrategyCatalog.js';
import { endMark, startMark } from '../utils/perf.js';
import { CONFIG } from '../utils/config.js';

export class BacktestModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.MAX_QTY = 1000;
        this.MAX_COMPARE_STRATEGIES = 5;
        this.worker = null;
        this.lastComparisons = [];
        this.lastProgressAt = 0;
        this.winRowsBuffer = [];
        this.winFlushRaf = 0;
        this.isRunning = false;
        this.currentPayoutMode = 'hybrid_dynamic_first';
        this.runButtonOriginal = '';
        this.bindEvents();
        this.populateStrategySelect();
        this.applySavedStrategyPrefs();
    }

    bindEvents() {
        $('#runBacktest')?.addEventListener('click', () => this.run());
        $('#stopBacktest')?.addEventListener('click', () => this.stop());
        $('#btShowExperimental')?.addEventListener('change', () => this.populateStrategySelect());
        $('#btExportCsv')?.addEventListener('click', () => this.exportComparisonCsv());
        $('#btCompareMode')?.addEventListener('change', () => this.toggleCompareMode());
    }

    onEnter() {
        this.resetUI();
    }

    toggleCompareMode() {
        const enabled = Boolean($('#btCompareMode')?.checked);
        const box = $('#btComparePanel');
        if (box) box.style.display = enabled ? 'block' : 'none';
    }

    resetUI() {
        const sum = $('#btSummaryList');
        if (sum) sum.innerHTML = '<li>실행 대기 중...</li>';

        const tbody = $('#btResultTable tbody');
        if (tbody) tbody.innerHTML = '';
        const compareTbody = $('#btCompareTable tbody');
        if (compareTbody) compareTbody.innerHTML = '';
        const winner = $('#btWinnerBadge');
        if (winner) winner.textContent = '-';
        this.setProgressStatus('');
        this.lastComparisons = [];
        this.currentPayoutMode = this.readPayoutMode();
        this.winRowsBuffer = [];
        if (this.winFlushRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.winFlushRaf);
        }
        this.winFlushRaf = 0;
        const notice = $('#btPayoutNotice');
        if (notice) notice.textContent = '';
    }

    setProgressStatus(text) {
        const el = $('#btProgressMeta');
        if (!el) return;
        el.textContent = text || '';
    }

    setRunningState(nextRunning) {
        this.isRunning = Boolean(nextRunning);
        const runBtn = $('#runBacktest');
        const stopBtn = $('#stopBacktest');
        if (runBtn) runBtn.disabled = this.isRunning;
        if (stopBtn) stopBtn.disabled = !this.isRunning;
    }

    cleanupWorker() {
        if (!this.worker) return;
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.terminate();
        this.worker = null;
    }

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
        UIManager.toast('Backtest stopped.', 'info');
    }

    readPayoutMode() {
        const mode = String($('#btPayoutMode')?.value || 'hybrid_dynamic_first');
        return mode === 'fast_fixed' ? 'fast_fixed' : 'hybrid_dynamic_first';
    }

    getPayoutModeLabel(mode) {
        return mode === 'fast_fixed' ? 'Fast fixed' : 'Hybrid dynamic-first';
    }

    getStrategyLabel(strategyId) {
        return getStrategyMeta(resolveStrategyId(strategyId)).label;
    }

    renderSummary(stats) {
        const el = $('#btSummaryList');
        if (!el || !stats) return;
        const pct = (n, d) => d ? ((n / d) * 100).toFixed(2) : '0.00';
        const roi = stats.cost > 0 ? (((stats.totalPrize - stats.cost) / stats.cost) * 100) : 0;
        const payoutMode = stats.payoutMode || this.currentPayoutMode || 'hybrid_dynamic_first';
        const payoutLabel = this.getPayoutModeLabel(payoutMode);
        const notice = $('#btPayoutNotice');
        if (notice) {
            notice.textContent = payoutMode === 'fast_fixed'
                ? 'Using fixed simulated prizes for all ranks.'
                : 'Hybrid mode: rank-1 uses draw prize_amount, ranks 2-5 use fixed simulated values.';
        }

        el.innerHTML = `
      <li><b>Strategy</b>: ${stats.strategyId ? this.getStrategyLabel(stats.strategyId) : '-'}</li>
      <li><b>Payout Mode</b>: ${payoutLabel}</li>
      <li><b>Draws</b>: ${stats.draws}</li>
      <li><b>Requested Tickets</b>: ${Number(stats.requestedTickets || 0).toLocaleString()}</li>
      <li><b>Generated Tickets</b>: ${Number(stats.generatedTickets || 0).toLocaleString()}</li>
      <li><b>Fill-rate</b>: ${Number(stats.fillRate || 0).toFixed(2)}%</li>
      <li><b>Tickets</b>: ${stats.tickets}</li>
      <li><b>Total Cost</b>: ${Number(stats.cost || 0).toLocaleString()}</li>
      <li><b>Total Prize</b>: ${Number(stats.totalPrize || 0).toLocaleString()}</li>
      <li><b>Net</b>: ${(Number(stats.totalPrize || 0) - Number(stats.cost || 0)).toLocaleString()}</li>
      <li><b>ROI</b>: ${roi.toFixed(2)}%</li>
      <li><b>Rank 1</b>: ${stats.counts[1]} / <b>Rank 2</b>: ${stats.counts[2]} / <b>Rank 3</b>: ${stats.counts[3]}</li>
      <li><b>Rank 4</b>: ${stats.counts[4]} / <b>Rank 5</b>: ${stats.counts[5]} / <b>No Win</b>: ${stats.counts[0]}</li>
      <li><b>Hit Rate (>=5)</b>: ${pct(stats.counts[1] + stats.counts[2] + stats.counts[3] + stats.counts[4] + stats.counts[5], stats.tickets)}%</li>
    `;
    }

    renderComparisons(comparisons = [], diagnostics = {}) {
        this.lastComparisons = [...comparisons];
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
    }

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
    }

    flushWinRows() {
        const tbody = $('#btResultTable tbody');
        if (!tbody || !this.winRowsBuffer.length) return;

        const fragment = document.createDocumentFragment();
        const rows = this.winRowsBuffer.splice(0, this.winRowsBuffer.length);
        rows.forEach((row) => this.appendWinRowToFragment(row, fragment));
        tbody.appendChild(fragment);
    }

    queueWinRows(rows = []) {
        if (!Array.isArray(rows) || !rows.length) return;
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
    }

    populateStrategySelect() {
        const select = $('#btStrategy');
        const compareList = $('#btCompareList');
        if (!select) return;

        const current = select.value || 'random';
        const includeExperimental = Boolean($('#btShowExperimental')?.checked);
        const strategies = listStrategies({ includeExperimental });
        select.innerHTML = '';

        strategies.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.label} (등급 ${item.tier})${item.experimental ? ' [실험]' : ''}`;
            select.appendChild(opt);
        });

        const legacy = [
            ['random', 'Legacy model: Random'],
            ['ensemble', 'Legacy model: Ensemble'],
            ['balance', 'Legacy model: Balance'],
            ['cold', 'Legacy model: Cold'],
            ['hot', 'Legacy model: Hot'],
            ['statistical', 'Legacy model: Statistical']
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
    }

    readNumber(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const raw = String(el.value || '').trim();
        if (!raw) return fallback;
        const n = Number(raw);
        if (!Number.isFinite(n)) return fallback;
        return n;
    }

    range(minId, maxId) {
        const min = this.readNumber(minId, null);
        const max = this.readNumber(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    }

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
    }

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
    }

    applySavedStrategyPrefs() {
        const saved = this.data.state.strategyPrefs?.backtest;
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
    }

    exportComparisonCsv() {
        if (!this.lastComparisons.length) {
            UIManager.toast('내보낼 비교 결과가 없습니다.', 'warning');
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
        UIManager.toast('비교 CSV 파일을 내보냈습니다.', 'success');
    }

    async run() {
        if (this.isRunning) return;
        if (!this.data.state.winningStats.length) {
            return UIManager.toast('당첨 데이터가 없습니다.', 'error', 3500);
        }
        startMark('backtest.run');

        const start = Number($('#btStart')?.value);
        const end = Number($('#btEnd')?.value);
        let qty = Number($('#btQty')?.value);
        this.currentPayoutMode = this.readPayoutMode();
        const strategyRequests = this.collectStrategyRequests();
        this.data.save();

        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
            endMark('backtest.run', { invalidRange: true });
            return UIManager.toast('회차 범위를 확인해주세요. (시작 <= 종료)', 'warning', 2500);
        }
        if (start < 1 || end < 1) {
            endMark('backtest.run', { invalidRange: true });
            return UIManager.toast('회차는 1 이상이어야 합니다.', 'warning', 2500);
        }
        const span = end - start + 1;
        if (span > CONFIG.LIMITS.MAX_BACKTEST_SPAN) {
            endMark('backtest.run', { invalidRange: true, span });
            return UIManager.toast(`백테스트 범위는 최대 ${CONFIG.LIMITS.MAX_BACKTEST_SPAN}회차까지 가능합니다.`, 'warning', 3000);
        }
        if (!Number.isFinite(qty) || qty < 1) qty = 1;
        qty = Math.min(qty, this.MAX_QTY);

        const runBtn = $('#runBacktest');
        this.runButtonOriginal = runBtn?.innerHTML || '';
        if (runBtn) {
            runBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 실행 중...';
        }

        this.resetUI();
        this.setProgressStatus('실행 중...');
        this.lastProgressAt = 0;
        this.setRunningState(true);

        this.cleanupWorker();
        this.worker = new Worker('assets/backtest.worker.js', { type: 'module' });

        const restoreRunButton = () => {
            const btn = $('#runBacktest');
            if (!btn) return;
            btn.innerHTML = this.runButtonOriginal || btn.innerHTML;
        };

        this.worker.onmessage = (e) => {
            const { type, payload } = e.data;

            if (type === 'PROGRESS' || type === 'DONE') {
                if (payload?.summary) this.renderSummary(payload.summary);
                if (type === 'PROGRESS' && payload?.processedDraws) {
                    const now = Date.now();
                    if (now - this.lastProgressAt >= 250) {
                        this.lastProgressAt = now;
                        const etaMs = Number(payload.etaMs || 0);
                        const etaText = etaMs > 0 ? `, 예상 ${(etaMs / 1000).toFixed(1)}초` : '';
                        const percent = Number(payload.percent || 0).toFixed(1);
                        this.setProgressStatus(`진행률 ${payload.processedDraws}/${payload.totalDraws} (${percent}%)${etaText}`);
                    }
                }
            }

            if (type === 'WINS') {
                this.queueWinRows(payload);
            }

            if (type === 'DONE') {
                this.flushWinRows();
                if (payload?.comparisons) this.renderComparisons(payload.comparisons, payload?.diagnostics || {});
                this.setRunningState(false);
                restoreRunButton();
                this.setProgressStatus(`완료 ${(Number(payload?.diagnostics?.elapsedMs || 0) / 1000).toFixed(2)}초`);
                UIManager.toast('시뮬레이션이 완료되었습니다.', 'success');
                this.cleanupWorker();
                endMark('backtest.run', {
                    processedDraws: payload?.diagnostics?.processedDraws || 0,
                    totalDraws: payload?.diagnostics?.totalDraws || 0,
                    payoutMode: this.currentPayoutMode
                });
            }

            if (type === 'ERROR') {
                UIManager.toast(payload?.message || '시뮬레이션 실행 중 오류가 발생했습니다.', 'error');
                this.setRunningState(false);
                restoreRunButton();
                this.setProgressStatus('실패');
                this.cleanupWorker();
                endMark('backtest.run', { error: true });
            }
        };

        this.worker.onerror = (err) => {
            console.error(err);
            UIManager.toast('예상치 못한 오류가 발생했습니다.', 'error');
            this.setRunningState(false);
            restoreRunButton();
            this.setProgressStatus('실패');
            this.cleanupWorker();
            endMark('backtest.run', { error: true });
        };

        this.worker.postMessage({
            type: 'START',
            payload: {
                statsData: this.data.state.winningStats,
                startDraw: start,
                endDraw: end,
                qty,
                payoutMode: this.currentPayoutMode,
                strategyRequests
            }
        });

        UIManager.toast('백그라운드에서 시뮬레이션을 시작했습니다.');
    }
}


