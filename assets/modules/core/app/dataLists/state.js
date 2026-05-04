import { CONFIG } from '../../../utils/config.js';
import { escapeHtml } from '../../../utils/dom.js';

export const appDataListStateMethods = {
    escapeHtml(value = '') {
        return escapeHtml(value);
    },

    getDataListState(scope) {
        if (!this.dataListState[scope]) {
            this.dataListState[scope] = { query: '', page: 1 };
        }
        return this.dataListState[scope];
    },

    setDataListQuery(scope, query) {
        const state = this.getDataListState(scope);
        const normalized = String(query || '').trim();
        if (state.query === normalized) return;
        state.query = normalized;
        state.page = 1;
        this._persistDataListState?.();
    },

    setDataListPage(scope, page) {
        const state = this.getDataListState(scope);
        const nextPage = Math.max(1, Math.floor(Number(page) || 1));
        state.page = nextPage;
        this._persistDataListState?.();
    },

    _persistDataListState() {
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(CONFIG.KEYS.SESSION_DATA_LIST_STATE, JSON.stringify(this.dataListState));
            }
        } catch (_e) {
            // sessionStorage 저장 실패는 조용히 무시
        }
    },

    matchesSearch(query, values = []) {
        const normalizedQuery = String(query || '')
            .trim()
            .toLowerCase();
        if (!normalizedQuery) return true;
        return values.some((value) =>
            String(value || '')
                .toLowerCase()
                .includes(normalizedQuery)
        );
    },

    getTicketStatusMeta(item) {
        if (!item?.checked) return { code: 'pending', label: '예정' };
        if (Number(item.checked.rank) > 0) return { code: 'win', label: `${item.checked.rank}등` };
        return { code: 'lose', label: '미당첨' };
    },

    formatDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return this.dateFormatter.format(d);
    }
};
