import { STORAGE_SYNC_CHANNEL, APP_OWNED_STORAGE_KEYS, createTabInstanceId } from './constants.js';

export const dataPersistenceStorageCrossTabMethods = {
    getTabInstanceId() {
        if (!this._tabInstanceId) {
            this._tabInstanceId = createTabInstanceId();
        }
        return this._tabInstanceId;
    },

    isAppOwnedStorageKey(key = '') {
        return APP_OWNED_STORAGE_KEYS.has(String(key || '').trim());
    },

    runWithBroadcastSuppressed(task) {
        const previous = this._suppressCrossTabBroadcast === true;
        this._suppressCrossTabBroadcast = true;
        try {
            return typeof task === 'function' ? task() : undefined;
        } finally {
            this._suppressCrossTabBroadcast = previous;
        }
    },

    initCrossTabSync() {
        if (this._crossTabSyncBound || typeof window === 'undefined') return;

        this.getTabInstanceId();

        try {
            if (typeof BroadcastChannel !== 'undefined') {
                this._crossTabChannel = new BroadcastChannel(STORAGE_SYNC_CHANNEL);
                this._crossTabChannel.addEventListener('message', (event) => {
                    const payload = event?.data || {};
                    if (payload.type !== 'APP_STATE_SYNC') return;
                    if (payload.senderId === this.getTabInstanceId()) return;
                    const keys = Array.isArray(payload.keys)
                        ? payload.keys.filter((key) => this.isAppOwnedStorageKey(key))
                        : [];
                    if (!keys.length) return;
                    this.app?.handleRemotePersistenceSync?.({
                        keys,
                        source: 'broadcast'
                    });
                });
            }
        } catch (_e) {
            this._crossTabChannel = null;
        }

        this._crossTabStorageHandler = (event) => {
            const key = String(event?.key || '').trim();
            if (!key || !this.isAppOwnedStorageKey(key)) return;
            if (typeof localStorage !== 'undefined' && event?.storageArea && event.storageArea !== localStorage) return;
            this.app?.handleRemotePersistenceSync?.({
                keys: [key],
                source: 'storage'
            });
        };
        window.addEventListener('storage', this._crossTabStorageHandler);
        this._crossTabSyncBound = true;
    },

    notifyCrossTabStateChange({ keys = [] } = {}) {
        if (this._suppressCrossTabBroadcast) return;
        const normalizedKeys = [
            ...new Set(
                (Array.isArray(keys) ? keys : [])
                    .map((key) => String(key || '').trim())
                    .filter((key) => this.isAppOwnedStorageKey(key))
            )
        ];
        if (!normalizedKeys.length) return;

        try {
            this._crossTabChannel?.postMessage({
                type: 'APP_STATE_SYNC',
                senderId: this.getTabInstanceId(),
                keys: normalizedKeys,
                updatedAt: Date.now()
            });
        } catch (_e) {
            // BroadcastChannel delivery failure should not block persistence.
        }
    }
};