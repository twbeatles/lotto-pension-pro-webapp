import { CONFIG } from '../../../../utils/config.js';

export const dataPersistenceLoadSaveSaveMethods = {
    save(immediate = false) {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }

        const executeSave = () => {
            if (typeof localStorage === 'undefined') return;

            const writeDirty = (dirtyKey, storageKey, value) => {
                if (!this._dirtyKeys[dirtyKey]) return;
                if (this._safeSetItem(storageKey, JSON.stringify(value))) {
                    this._dirtyKeys[dirtyKey] = false;
                }
            };

            writeDirty('fav', CONFIG.KEYS.FAV, this.state.favorites);
            writeDirty('hist', CONFIG.KEYS.HIST, this.state.history);
            writeDirty('settings', CONFIG.KEYS.SETTINGS, this.getSettingsPayload());
            writeDirty('ticketBook', CONFIG.KEYS.TICKET_BOOK, this.state.ticketBook);
            writeDirty('campaigns', CONFIG.KEYS.CAMPAIGNS, this.state.campaigns);
            writeDirty('alerts', CONFIG.KEYS.ALERT_PREFS, this.state.alertPrefs);
            writeDirty('presets', CONFIG.KEYS.STRATEGY_PRESETS, this.state.strategyPresets || []);
            writeDirty('localUpdates', CONFIG.KEYS.LOCAL_UPDATES, this.localUpdatesCache || []);
            writeDirty('pension720Tickets', CONFIG.KEYS.PENSION720_TICKETS, this.state.pension720Tickets || []);
            writeDirty('pension720Campaigns', CONFIG.KEYS.PENSION720_CAMPAIGNS, this.state.pension720Campaigns || []);
            if (this._dirtyKeys.syncMeta) {
                if (this.persistSyncMeta()) {
                    this._dirtyKeys.syncMeta = false;
                }
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