import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { listStrategies, resolveStrategyId } from '../core/StrategyCatalog.js';

export class BacktestModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.MAX_QTY = 1000;
        this.MAX_COMPARE_STRATEGIES = 5;
        this.worker = null;
        this.lastComparisons = [];
        this.bindEvents();
        this.populateStrategySelect();
        this.applySavedStrategyPrefs();
    }

    bindEvents() {
        $('#runBacktest')?.addEventListener('click', () => this.run());
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
        if (sum) sum.innerHTML = '<li>실행 대기중...</li>';
        const tbody = $('#btResultTable tbody');
        if (tbody) tbody.innerHTML = '';
        const compareTbody = $('#btCompareTable tbody');
        if (compareTbody) compareTbody.innerHTML = '';
        const winner = $('#btWinnerBadge');
        if (winner) winner.textContent = '-';
        this.lastComparisons = [];
    }

    renderSummary(stats) {
        const el = $('#btSummaryList');
        if (!el || !stats) return;
        const pct = (n, d) => d ? ((n / d) * 100).toFixed(2) : '0.00';
        const roi = stats.cost > 0 ? (((stats.totalPrize - stats.cost) / stats.cost) * 100) : 0;

        el.innerHTML = `
      <li><b>전략</b>: ${stats.strategyId || '-'}</li>
      <li><b>회차 수</b>: ${stats.draws}</li>
      <li><b>총 티켓</b>: ${stats.tickets}</li>
      <li><b>총 비용</b>: ${stats.cost.toLocaleString()}원</li>
      <li><b>총 상금(추정)</b>: ${stats.totalPrize.toLocaleString()}원</li>
      <li><b>순이익</b>: ${(stats.totalPrize - stats.cost).toLocaleString()}원</li>
      <li><b>ROI</b>: ${roi.toFixed(2)}%</li>
      <li><b>1등</b>: ${stats.counts[1]} / <b>2등</b>: ${stats.counts[2]} / <b>3등</b>: ${stats.counts[3]}</li>
      <li><b>4등</b>: ${stats.counts[4]} / <b>5등</b>: ${stats.counts[5]} / <b>낙첨</b>: ${stats.counts[0]}</li>
      <li><b>당첨률(5등+)</b>: ${pct(stats.counts[1] + stats.counts[2] + stats.counts[3] + stats.counts[4] + stats.counts[5], stats.tickets)}%</li>
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
                <td>${row.strategyId}</td>
                <td>${Number(row.roi || 0).toFixed(2)}%</td>
                <td>${Number(row.hitRate || 0).toFixed(2)}%</td>
                <td>${Number(row.cost || 0).toLocaleString()}</td>
                <td>${Number(row.totalPrize || 0).toLocaleString()}</td>
                <td>${Number(row.winCount || 0).toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });

        const winner = $('#btWinnerBadge');
        if (winner) winner.textContent = diagnostics?.winner || sorted[0]?.strategyId || '-';
    }

    appendWinRow(row) {
        const tbody = $('#btResultTable tbody');
        if (!tbody) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${row.strategyId || '-'}</td>
      <td>${row.drawNo}</td>
      <td>${row.rank}등</td>
      <td>${row.hitText}</td>
      <td><div class="ball-container sm">${UIManager.renderBalls(row.nums, 'sm')}</div></td>
    `;
        tbody.appendChild(tr);
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
            opt.textContent = `${item.label} (Tier ${item.tier})${item.experimental ? ' [실험]' : ''}`;
            select.appendChild(opt);
        });

        const legacy = [
            ['random', 'Legacy: 완전 랜덤'],
            ['ensemble', 'Legacy: AI 앙상블'],
            ['balance', 'Legacy: 패턴 밸런스'],
            ['cold', 'Legacy: 콜드 포커스'],
            ['hot', 'Legacy: 핫 포커스'],
            ['statistical', 'Legacy: 정밀 통계']
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
                seed: this.readNumber('btSeed', null)
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

        const header = ['strategyId', 'roi', 'hitRate', 'draws', 'tickets', 'cost', 'totalPrize', 'winCount'];
        const lines = [header.join(',')];
        this.lastComparisons.forEach((x) => {
            lines.push([
                x.strategyId,
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
        a.download = `backtest_compare_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        UIManager.toast('비교 결과 CSV 저장 완료', 'success');
    }

    async run() {
        if (!this.data.state.winningStats.length) {
            return UIManager.toast('당첨 데이터를 불러오지 못했습니다.', 'error', 3500);
        }

        const start = Number($('#btStart')?.value);
        const end = Number($('#btEnd')?.value);
        let qty = Number($('#btQty')?.value);
        const strategyRequests = this.collectStrategyRequests();
        this.data.save();

        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
            return UIManager.toast('회차 범위를 확인하세요. (start <= end)', 'warning', 2500);
        }
        if (!Number.isFinite(qty) || qty < 1) qty = 1;
        qty = Math.min(qty, this.MAX_QTY);

        const btn = $('#runBacktest');
        const original = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 실행 중...';
        }

        this.resetUI();

        if (this.worker) this.worker.terminate();
        this.worker = new Worker('assets/backtest.worker.js', { type: 'module' });

        this.worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'PROGRESS' || type === 'DONE') {
                if (payload?.summary) this.renderSummary(payload.summary);
                if (type === 'PROGRESS' && payload?.processedDraws) {
                    const etaMs = Number(payload.etaMs || 0);
                    const etaText = etaMs > 0 ? `, ETA ${(etaMs / 1000).toFixed(1)}s` : '';
                    UIManager.toast(`진행률 ${payload.processedDraws}/${payload.totalDraws}${etaText}`, 'info', 700);
                }
            }
            if (type === 'WINS') {
                payload.forEach((w) => this.appendWinRow(w));
            }
            if (type === 'DONE') {
                if (payload?.comparisons) this.renderComparisons(payload.comparisons, payload?.diagnostics || {});
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = original;
                }
                UIManager.toast('백테스팅 완료', 'success');
                this.worker.terminate();
                this.worker = null;
            }
            if (type === 'ERROR') {
                UIManager.toast(payload?.message || '백테스트 오류', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = original;
                }
                this.worker.terminate();
                this.worker = null;
            }
        };

        this.worker.onerror = (err) => {
            console.error(err);
            UIManager.toast('오류 발생', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = original;
            }
            this.worker.terminate();
            this.worker = null;
        };

        this.worker.postMessage({
            type: 'START',
            payload: {
                statsData: this.data.state.winningStats,
                startDraw: start,
                endDraw: end,
                qty,
                strategyRequests
            }
        });

        UIManager.toast('백그라운드에서 실행 중...');
    }
}
