import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { endMark, startMark } from '../../utils/perf.js';
import { CONFIG } from '../../utils/config.js';
export const backtestRunMethods = {
    async run() {
        if (this.isRunning) return;
        if (!this.data.state.winningStats.length) {
            return UIManager.toast('당첨 데이터가 없습니다.', 'error', 3500);
        }
        this.data.warnIfDataStale?.('백테스트');
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
};
