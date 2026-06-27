import { CONFIG } from '../../../../utils/config.js';

export const dataPersistenceStorageTempResultsMethods = {
    normalizeAiResultSet(raw) {
        const numbers = this.normalizeNumbers(raw || []);
        return numbers.length === 6 ? numbers : null;
    },

    normalizePension720Result(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const group = Math.floor(Number(raw.group || 0));
        const number = String(raw.number || '').trim();
        if (!Number.isInteger(group) || group < 1 || group > 5 || !/^\d{6}$/.test(number)) return null;
        return {
            group,
            number,
            score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
            reasons: Array.isArray(raw.reasons) ? raw.reasons.map((item) => String(item).slice(0, 80)).slice(0, 8) : [],
            expansionGroups: Array.isArray(raw.expansionGroups)
                ? raw.expansionGroups
                      .map((item) => Math.floor(Number(item)))
                      .filter((item) => item >= 1 && item <= 5)
                      .slice(0, 4)
                : []
        };
    },

    getTemporaryResultsPayload() {
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            generated: this.getGeneratedEntries?.() || [],
            aiResults: (Array.isArray(this.state.aiResults) ? this.state.aiResults : [])
                .map((item) => this.normalizeAiResultSet(item))
                .filter(Boolean)
                .slice(0, 20),
            pension720Results: (Array.isArray(this.state.pension720Results) ? this.state.pension720Results : [])
                .map((item) => this.normalizePension720Result(item))
                .filter(Boolean)
                .slice(0, 20)
        };
    },

    loadTemporaryResultsFromSession() {
        if (typeof sessionStorage === 'undefined') return false;
        try {
            const raw = sessionStorage.getItem(CONFIG.KEYS.SESSION_RESULTS_STATE);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            if (Number(parsed?.version || 0) !== 1) return false;
            this.state.generated = (Array.isArray(parsed.generated) ? parsed.generated : [])
                .map((entry) => this.normalizeGeneratedEntry(entry))
                .filter(Boolean)
                .slice(0, 20);
            this.state.aiResults = (Array.isArray(parsed.aiResults) ? parsed.aiResults : [])
                .map((item) => this.normalizeAiResultSet(item))
                .filter(Boolean)
                .slice(0, 20);
            this.state.pension720Results = (Array.isArray(parsed.pension720Results) ? parsed.pension720Results : [])
                .map((item) => this.normalizePension720Result(item))
                .filter(Boolean)
                .slice(0, 20);
            return true;
        } catch (_e) {
            return false;
        }
    },

    persistTemporaryResultsToSession() {
        if (typeof sessionStorage === 'undefined') return false;
        try {
            const payload = this.getTemporaryResultsPayload();
            sessionStorage.setItem(CONFIG.KEYS.SESSION_RESULTS_STATE, JSON.stringify(payload));
            return true;
        } catch (_e) {
            return false;
        }
    }
};