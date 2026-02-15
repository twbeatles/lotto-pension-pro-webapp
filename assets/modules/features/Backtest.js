import { $ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

export class BacktestModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.MAX_QTY = 1000;
        this.worker = null;
        this.bindEvents();
    }

    bindEvents() {
        $('#runBacktest')?.addEventListener('click', () => this.run());
    }

    onEnter() {
        this.resetUI();
    }

    resetUI() {
        const sum = $('#btSummaryList');
        if (sum) sum.innerHTML = '<li>실행 대기중...</li>';
        const tbody = $('#btResultTable tbody');
        if (tbody) tbody.innerHTML = '';
    }

    renderSummary(stats) {
        const el = $('#btSummaryList');
        if (!el) return;
        const pct = (n, d) => d ? ((n / d) * 100).toFixed(2) : '0.00';
        const roi = stats.cost > 0 ? (((stats.totalPrize - stats.cost) / stats.cost) * 100) : 0;

        el.innerHTML = `
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

    appendWinRow(row) {
        const tbody = $('#btResultTable tbody');
        if (!tbody) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${row.drawNo}</td>
      <td>${row.rank}등</td>
      <td>${row.hitText}</td>
      <td><div class="ball-container sm">${UIManager.renderBalls(row.nums, 'sm')}</div></td>
    `;
        tbody.appendChild(tr);
    }

    async run() {
        if (!this.data.state.winningStats.length) {
            return UIManager.toast('당첨 데이터를 불러오지 못했습니다.', 'error', 3500);
        }

        const start = Number($('#btStart')?.value);
        const end = Number($('#btEnd')?.value);
        let qty = Number($('#btQty')?.value);
        const strategy = ($('#btStrategy')?.value || 'random');

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
        this.worker = new Worker('assets/backtest.worker.js');

        this.worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'PROGRESS' || type === 'DONE') {
                this.renderSummary(payload);
            }
            if (type === 'WINS') {
                payload.forEach(w => this.appendWinRow(w));
            }
            if (type === 'DONE') {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = original;
                }
                UIManager.toast('백테스팅 완료', 'success');
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
                strategy
            }
        });

        UIManager.toast('백그라운드에서 실행 중...');
    }
}
