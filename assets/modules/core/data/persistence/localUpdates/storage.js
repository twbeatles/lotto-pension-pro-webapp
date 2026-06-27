import { CONFIG } from '../../../../utils/config.js';

export const dataPersistenceLocalUpdateStorageMethods = {
    persistLocalUpdates() {
        if (typeof localStorage === 'undefined') {
            if (Object.prototype.hasOwnProperty.call(this._dirtyKeys || {}, 'localUpdates')) {
                this._dirtyKeys.localUpdates = false;
            }
            return true;
        }
        const ok = this._safeSetItem(CONFIG.KEYS.LOCAL_UPDATES, JSON.stringify(this.localUpdatesCache || []));
        if (Object.prototype.hasOwnProperty.call(this._dirtyKeys || {}, 'localUpdates')) {
            this._dirtyKeys.localUpdates = !ok;
        }
        return ok;
    },

    getLocalUpdates(options = {}) {
        const warningMode = String(options?.warningMode || 'auto');
        if (typeof localStorage === 'undefined') {
            if (!Array.isArray(this.localUpdatesCache)) this.localUpdatesCache = [];
            return this.localUpdatesCache;
        }
        if (Array.isArray(this.localUpdatesCache)) return this.localUpdatesCache;
        const parsed = this.safeJsonParse(
            localStorage.getItem(CONFIG.KEYS.LOCAL_UPDATES) || '[]',
            [],
            CONFIG.KEYS.LOCAL_UPDATES
        );
        const sanitized = this.sanitizeLocalUpdates(parsed);
        this.localUpdatesCache = sanitized.items;
        if (JSON.stringify(this.localUpdatesCache) !== JSON.stringify(Array.isArray(parsed) ? parsed : [])) {
            this.persistLocalUpdates();
        }
        if (warningMode !== 'silent') {
            const warningMessage = this.buildLocalUpdateWarningMessage(sanitized);
            if (warningMessage) this.markSyncWarning(warningMessage);
            else if (this.isLocalUpdateWarningMessage(this.state.syncMeta?.lastWarningMessage))
                this.markSyncWarning('');
        }
        return this.localUpdatesCache;
    },

    setLocalUpdates(items = [], options = {}) {
        const warningMode = String(options?.warningMode || 'auto');
        const sanitized = this.sanitizeLocalUpdates(items);
        this.localUpdatesCache = sanitized.items;
        this.markDirty('localUpdates');
        this.persistLocalUpdates();
        if (warningMode !== 'silent') {
            const warningMessage = this.buildLocalUpdateWarningMessage(sanitized);
            if (warningMessage) this.markSyncWarning(warningMessage);
            else if (this.isLocalUpdateWarningMessage(this.state.syncMeta?.lastWarningMessage))
                this.markSyncWarning('');
        }
        this.app?.renderSettingsPanel?.();
        return sanitized;
    },

    clearLocalUpdates() {
        this.setLocalUpdates([], { warningMode: 'silent' });
        if (this.isLocalUpdateWarningMessage(this.state.syncMeta?.lastWarningMessage)) {
            this.markSyncWarning('');
        }
        return true;
    }
};