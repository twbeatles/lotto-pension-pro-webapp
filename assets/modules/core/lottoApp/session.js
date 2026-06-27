import { CONFIG } from '../../utils/config.js';

export const lottoAppSessionMethods = {
    _loadDataListStateFromSession() {
        const defaults = {
            fav: { query: '', page: 1 },
            history: { query: '', page: 1 },
            ticket: { query: '', page: 1 },
            campaign: { query: '', page: 1 }
        };
        try {
            if (typeof sessionStorage === 'undefined') return defaults;
            const raw = sessionStorage.getItem(CONFIG.KEYS.SESSION_DATA_LIST_STATE);
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;
            return Object.fromEntries(
                Object.keys(defaults).map((scope) => [
                    scope,
                    {
                        query: typeof parsed[scope]?.query === 'string' ? parsed[scope].query : '',
                        page: Math.max(1, Number(parsed[scope]?.page) || 1)
                    }
                ])
            );
        } catch (_e) {
            return defaults;
        }
    }
};