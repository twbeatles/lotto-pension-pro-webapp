import { CONFIG } from '../../../../utils/config.js';

export const dataPersistenceStoragePersistMethods = {
    persistSettings() {
        if (typeof localStorage === 'undefined') return true;
        return this._safeSetItem(CONFIG.KEYS.SETTINGS, JSON.stringify(this.getSettingsPayload()));
    },

    persistExtendedData() {
        if (typeof localStorage === 'undefined') return true;
        const results = [
            this._safeSetItem(CONFIG.KEYS.TICKET_BOOK, JSON.stringify(this.state.ticketBook)),
            this._safeSetItem(CONFIG.KEYS.CAMPAIGNS, JSON.stringify(this.state.campaigns)),
            this._safeSetItem(CONFIG.KEYS.ALERT_PREFS, JSON.stringify(this.state.alertPrefs)),
            this._safeSetItem(CONFIG.KEYS.STRATEGY_PRESETS, JSON.stringify(this.state.strategyPresets || [])),
            this._safeSetItem(CONFIG.KEYS.PENSION720_TICKETS, JSON.stringify(this.state.pension720Tickets || [])),
            this._safeSetItem(CONFIG.KEYS.PENSION720_CAMPAIGNS, JSON.stringify(this.state.pension720Campaigns || []))
        ];
        return results.every(Boolean);
    },

    persistSyncMeta() {
        if (typeof localStorage === 'undefined') return true;
        return this._safeSetItem(
            CONFIG.KEYS.SYNC_META,
            JSON.stringify(this.state.syncMeta || this.getDefaultSyncMeta())
        );
    },

    getSettingsPayload() {
        return {
            theme: this.state.theme,
            customProxy: this.state.customProxy,
            strategyPrefs: this.state.strategyPrefs
        };
    }
};