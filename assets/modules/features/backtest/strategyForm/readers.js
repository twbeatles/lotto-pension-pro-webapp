import { $ } from '../../../utils/utils.js';

export const backtestStrategyFormReaderMethods = {
    readPayoutMode() {
        const mode = String($('#btPayoutMode')?.value || 'hybrid_dynamic_first');
        return mode === 'fast_fixed' ? 'fast_fixed' : 'hybrid_dynamic_first';
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
    }
};