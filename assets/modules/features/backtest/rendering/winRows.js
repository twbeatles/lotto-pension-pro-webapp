import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';

export const backtestRenderingWinRowMethods = {
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