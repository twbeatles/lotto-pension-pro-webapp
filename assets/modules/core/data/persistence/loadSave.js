import { CONFIG } from '../../../utils/config.js';
import { UIManager } from '../../UIManager.js';

export const dataPersistenceLoadSaveMethods = {
    load() {
        try {
            if (typeof localStorage === 'undefined') return;
            this.dataHealth = this.getDefaultDataHealth();
            let needsPersist = false;
            const rawFavorites = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.FAV) || '[]', [], CONFIG.KEYS.FAV);
            const rawHistory = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.HIST) || '[]', [], CONFIG.KEYS.HIST);
            const rawLocalUpdates = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.LOCAL_UPDATES) || '[]', [], CONFIG.KEYS.LOCAL_UPDATES);

            const normalizedFavorites = Array.isArray(rawFavorites)
                ? rawFavorites.map((x) => this.normalizeStoredNumberEntry(x)).filter(Boolean)
                : [];
            const normalizedHistory = Array.isArray(rawHistory)
                ? rawHistory.map((x) => this.normalizeStoredNumberEntry(x)).filter(Boolean)
                : [];
            const normalizedLocalUpdates = this.sanitizeLocalUpdates(rawLocalUpdates);

            if (!Array.isArray(rawFavorites) || JSON.stringify(normalizedFavorites) !== JSON.stringify(rawFavorites)) needsPersist = true;
            if (!Array.isArray(rawHistory) || JSON.stringify(normalizedHistory) !== JSON.stringify(rawHistory)) needsPersist = true;
            if (!Array.isArray(rawLocalUpdates) || JSON.stringify(normalizedLocalUpdates.items) !== JSON.stringify(rawLocalUpdates)) needsPersist = true;

            this.state.favorites = normalizedFavorites;
            this.state.history = normalizedHistory;

            const settings = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.SETTINGS) || '{}', {}, CONFIG.KEYS.SETTINGS);
            this.state.theme = settings.theme === 'light' ? 'light' : 'dark';
            this.state.customProxy = typeof settings.customProxy === 'string' ? settings.customProxy : '';
            this.state.strategyPrefs = this.mergeStrategyPrefs(settings.strategyPrefs);

            const rawTickets = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.TICKET_BOOK) || '[]', [], CONFIG.KEYS.TICKET_BOOK);
            const rawCampaigns = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.CAMPAIGNS) || '[]', [], CONFIG.KEYS.CAMPAIGNS);
            const rawAlertPrefs = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.ALERT_PREFS) || '{}', {}, CONFIG.KEYS.ALERT_PREFS);
            const rawStrategyPresets = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.STRATEGY_PRESETS) || '[]', [], CONFIG.KEYS.STRATEGY_PRESETS);
            const rawSyncMeta = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.SYNC_META) || '{}', {}, CONFIG.KEYS.SYNC_META);

            const normalizedTickets = Array.isArray(rawTickets)
                ? this.mergeTicketEntries([], rawTickets)
                : [];
            const normalizedCampaigns = Array.isArray(rawCampaigns)
                ? rawCampaigns.map((x) => this.normalizeCampaignEntry(x)).filter(Boolean)
                : [];
            const normalizedAlertPrefs = this.mergeAlertPrefs(rawAlertPrefs);
            const normalizedStrategyPresets = this.mergeStrategyPresets(rawStrategyPresets);
            const normalizedSyncMeta = this.mergeSyncMeta(rawSyncMeta);

            if (Array.isArray(rawTickets)) {
                const normalizedTicketShape = normalizedTickets.map((ticket) => this.normalizeTicketEntry(ticket)).filter(Boolean);
                if (JSON.stringify(normalizedTicketShape) !== JSON.stringify(rawTickets)) needsPersist = true;
            }
            if (Array.isArray(rawCampaigns) && normalizedCampaigns.length !== rawCampaigns.length) needsPersist = true;
            if (JSON.stringify(normalizedAlertPrefs) !== JSON.stringify(rawAlertPrefs || {})) needsPersist = true;
            if (Array.isArray(rawStrategyPresets) && normalizedStrategyPresets.length !== rawStrategyPresets.length) needsPersist = true;
            if (JSON.stringify(normalizedSyncMeta) !== JSON.stringify(rawSyncMeta || {})) needsPersist = true;

            this.state.ticketBook = normalizedTickets;
            this.state.campaigns = normalizedCampaigns;
            this.state.alertPrefs = normalizedAlertPrefs;
            this.state.strategyPresets = normalizedStrategyPresets;
            this.state.syncMeta = normalizedSyncMeta;
            this.localUpdatesCache = normalizedLocalUpdates.items;

            const localUpdateWarning = this.buildLocalUpdateWarningMessage(normalizedLocalUpdates);
            if (localUpdateWarning) {
                this.state.syncMeta = this.mergeSyncMeta({
                    ...(this.state.syncMeta || this.getDefaultSyncMeta()),
                    lastWarningAt: new Date().toISOString(),
                    lastWarningMessage: localUpdateWarning
                });
                needsPersist = true;
            } else if (this.isLocalUpdateWarningMessage(this.state.syncMeta?.lastWarningMessage)) {
                this.state.syncMeta = this.mergeSyncMeta({
                    ...(this.state.syncMeta || this.getDefaultSyncMeta()),
                    lastWarningAt: '',
                    lastWarningMessage: ''
                });
                needsPersist = true;
            }

            const legacyProxy = this.readLegacyProxyUrl();
            if (!this.state.customProxy && legacyProxy) {
                this.state.customProxy = legacyProxy;
                needsPersist = true;
            }

            if (needsPersist) {
                this._safeSetItem(CONFIG.KEYS.FAV, JSON.stringify(this.state.favorites));
                this._safeSetItem(CONFIG.KEYS.HIST, JSON.stringify(this.state.history));
                this._safeSetItem(CONFIG.KEYS.LOCAL_UPDATES, JSON.stringify(this.localUpdatesCache));
                this.persistSettings();
                this.persistExtendedData();
                this.persistSyncMeta();
            }

            Object.keys(this._dirtyKeys).forEach((key) => {
                this._dirtyKeys[key] = false;
            });
        } catch (e) {
            console.error('데이터 불러오기 실패', e);
            UIManager.toast('데이터 로드 실패', 'error');
        }
    },

    save(immediate = false) {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }

        const executeSave = () => {
            if (typeof localStorage === 'undefined') return;

            if (this._dirtyKeys.fav) {
                this._safeSetItem(CONFIG.KEYS.FAV, JSON.stringify(this.state.favorites));
                this._dirtyKeys.fav = false;
            }
            if (this._dirtyKeys.hist) {
                this._safeSetItem(CONFIG.KEYS.HIST, JSON.stringify(this.state.history));
                this._dirtyKeys.hist = false;
            }
            if (this._dirtyKeys.settings) {
                this._safeSetItem(CONFIG.KEYS.SETTINGS, JSON.stringify(this.getSettingsPayload()));
                this._dirtyKeys.settings = false;
            }
            if (this._dirtyKeys.ticketBook) {
                this._safeSetItem(CONFIG.KEYS.TICKET_BOOK, JSON.stringify(this.state.ticketBook));
                this._dirtyKeys.ticketBook = false;
            }
            if (this._dirtyKeys.campaigns) {
                this._safeSetItem(CONFIG.KEYS.CAMPAIGNS, JSON.stringify(this.state.campaigns));
                this._dirtyKeys.campaigns = false;
            }
            if (this._dirtyKeys.alerts) {
                this._safeSetItem(CONFIG.KEYS.ALERT_PREFS, JSON.stringify(this.state.alertPrefs));
                this._dirtyKeys.alerts = false;
            }
            if (this._dirtyKeys.presets) {
                this._safeSetItem(CONFIG.KEYS.STRATEGY_PRESETS, JSON.stringify(this.state.strategyPresets || []));
                this._dirtyKeys.presets = false;
            }
            if (this._dirtyKeys.syncMeta) {
                this.persistSyncMeta();
                this._dirtyKeys.syncMeta = false;
            }

            this._checkStorageQuotaWarning();
        };

        if (immediate) {
            executeSave();
            return;
        }

        this._saveTimer = setTimeout(() => {
            if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => executeSave(), { timeout: 1000 });
            } else {
                executeSave();
            }
        }, 300);
    }
};
