export const dataPersistenceLoadSavePendingMethods = {
    hasPendingLocalPersistence() {
        if (this._saveTimer) return true;
        return Object.values(this._dirtyKeys || {}).some(Boolean);
    },

    flushPendingLocalPersistence() {
        if (!this.hasPendingLocalPersistence()) return true;
        this.save(true);
        return !this.hasPendingLocalPersistence();
    }
};