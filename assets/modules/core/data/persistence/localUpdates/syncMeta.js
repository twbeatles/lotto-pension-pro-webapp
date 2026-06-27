export const dataPersistenceLocalUpdateSyncMetaMethods = {
    setSyncMeta(next, { immediate = false } = {}) {
        const merged = this.mergeSyncMeta({
            ...(this.state.syncMeta || this.getDefaultSyncMeta()),
            ...(next || {})
        });
        const prevSerialized = JSON.stringify(this.state.syncMeta || this.getDefaultSyncMeta());
        const nextSerialized = JSON.stringify(merged);
        this.state.syncMeta = merged;
        if (prevSerialized !== nextSerialized) {
            this.markDirty('syncMeta');
            this.save(immediate);
        }
        this.app?.renderSettingsPanel?.();
        return this.state.syncMeta;
    },

    markSyncSuccess({ drawNo = 0, source = '', mode = this.getSyncMode() } = {}) {
        return this.setSyncMeta({
            mode,
            currentSource: source || this.getSyncSourceLabel(),
            lastSuccessAt: new Date().toISOString(),
            lastSuccessDrawNo: Math.max(0, Math.floor(Number(drawNo || 0))),
            lastFailureAt: '',
            lastFailureMessage: ''
        });
    },

    markLocalRestoreSuccess({ drawNo = 0 } = {}) {
        return this.setSyncMeta({
            mode: 'local_restore',
            currentSource: this.getLocalRestoreSourceLabel(),
            lastSuccessAt: new Date().toISOString(),
            lastSuccessDrawNo: Math.max(0, Math.floor(Number(drawNo || 0))),
            lastFailureAt: '',
            lastFailureMessage: ''
        });
    },

    markLocalRestoreFailure(message, { source = this.getLocalRestoreSourceLabel() } = {}) {
        return this.setSyncMeta({
            mode: 'local_restore_failed',
            currentSource: source || this.getLocalRestoreSourceLabel(),
            lastFailureAt: new Date().toISOString(),
            lastFailureMessage: String(message || '백업 복원 후 당첨 데이터를 다시 구성하지 못했습니다.').slice(0, 240)
        });
    },

    markSyncFailure(message, { source = '', mode = this.getSyncMode() } = {}) {
        return this.setSyncMeta({
            mode,
            currentSource: source || this.getSyncSourceLabel(),
            lastFailureAt: new Date().toISOString(),
            lastFailureMessage: String(message || '').slice(0, 240)
        });
    },

    markSyncWarning(message) {
        const text = String(message || '')
            .trim()
            .slice(0, 240);
        if (!text) {
            return this.setSyncMeta({
                lastWarningAt: '',
                lastWarningMessage: ''
            });
        }
        return this.setSyncMeta({
            lastWarningAt: new Date().toISOString(),
            lastWarningMessage: text
        });
    },

    clampSyncMetaToWinningStats({ immediate = false } = {}) {
        const effectiveLatestDrawNo = Math.max(0, Math.floor(Number(this.state.winningStats?.[0]?.draw_no || 0)));
        const currentLastSuccessDrawNo = Math.max(0, Math.floor(Number(this.state.syncMeta?.lastSuccessDrawNo || 0)));
        if (currentLastSuccessDrawNo <= effectiveLatestDrawNo) {
            return this.state.syncMeta || this.getDefaultSyncMeta();
        }
        return this.setSyncMeta(
            {
                lastSuccessDrawNo: effectiveLatestDrawNo
            },
            { immediate }
        );
    }
};