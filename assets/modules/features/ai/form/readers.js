import { $ } from '../../../utils/utils.js';

export const aiFormReaderMethods = {
    getAiTargetDrawNo() {
        const latest = Number(this.app.data.state.winningStats?.[0]?.draw_no || 0);
        const input = this.readNumber('aiTargetDrawNo', latest + 1);
        return Math.max(1, Math.floor(input || latest + 1));
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

    isWorkerTimeoutError(err) {
        return String(err?.message || '').includes('WORKER_TIMEOUT');
    },

    range(minId, maxId) {
        const min = this.readNumber(minId, null);
        const max = this.readNumber(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    }
};