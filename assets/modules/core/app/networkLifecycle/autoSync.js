export const appNetworkLifecycleAutoSyncMethods = {
    queueAutoSync(reason = 'auto', { delayMs = 0, force = false } = {}) {
        this._autoSyncPendingForce = this._autoSyncPendingForce || Boolean(force);
        if (this._autoSyncTimer) {
            clearTimeout(this._autoSyncTimer);
            this._autoSyncTimer = null;
        }
        this._autoSyncTimer = setTimeout(
            () => {
                this._autoSyncTimer = null;
                const nextForce = this._autoSyncPendingForce;
                this._autoSyncPendingForce = false;
                this.runAutoSync({ reason, force: nextForce });
            },
            Math.max(0, Number(delayMs) || 0)
        );
    },

    async runAutoSync({ reason = 'auto', force = false } = {}) {
        const now = Date.now();
        if (!force && now - this._lastAutoSyncAt < this.AUTO_SYNC_MIN_INTERVAL_MS) {
            return false;
        }
        if (await this.isProbablyOffline()) {
            return false;
        }

        this._lastAutoSyncAt = now;
        return this.data.fetchLatestFromAPI({
            silent: true,
            trigger: 'auto',
            reason
        });
    },

    _bindAutoSyncLifecycle() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.queueAutoSync('resume', { delayMs: 1200 });
            }
        });
    }
};