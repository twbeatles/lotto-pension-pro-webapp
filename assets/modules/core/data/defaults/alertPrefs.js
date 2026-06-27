export const dataDefaultsAlertPrefsMethods = {
    mergeAlertPrefs(raw) {
        const defaults = this.getDefaultAlertPrefs();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            ...defaults,
            ...input,
            enableInApp: input.enableInApp !== false,
            enableSystemNotification: Boolean(input.enableSystemNotification),
            notifyOnNewResult: input.notifyOnNewResult !== false
        };
    },

    setAlertPrefs(next) {
        this.state.alertPrefs = this.mergeAlertPrefs({
            ...(this.state.alertPrefs || {}),
            ...(next || {})
        });
        this.markDirty('alerts');
        this.save(true);
        this.app?.renderSettingsPanel?.();
    }
};