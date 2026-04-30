import { CONFIG } from '../../../utils/config.js';
import { estimateLatestDrawKST } from '../../../utils/utils.js';

export const dataPersistenceLocalUpdateMethods = {
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
    },

    sanitizeLocalUpdates(items = []) {
        const maxAllowedDrawNo = Math.max(1, estimateLatestDrawKST() + 2);
        const map = new Map();
        let droppedInvalid = 0;
        let droppedFuture = 0;

        (Array.isArray(items) ? items : []).forEach((item) => {
            const normalized = this.normalizeDrawItem(item);
            if (!normalized) {
                droppedInvalid++;
                return;
            }
            if (Number(normalized.draw_no) > maxAllowedDrawNo) {
                droppedFuture++;
                return;
            }
            map.set(Number(normalized.draw_no), normalized);
        });

        return {
            items: Array.from(map.values()).sort((a, b) => Number(a.draw_no) - Number(b.draw_no)),
            droppedInvalid,
            droppedFuture,
            droppedTotal: droppedInvalid + droppedFuture,
            maxAllowedDrawNo
        };
    },

    buildLocalUpdateWarningMessage(result = {}) {
        const droppedFuture = Math.max(0, Number(result?.droppedFuture || 0));
        const maxAllowedDrawNo = Math.max(0, Number(result?.maxAllowedDrawNo || 0));
        if (!droppedFuture) return '';
        return `예상 최신 회차 기준보다 앞선 로컬 업데이트 ${droppedFuture}개를 제외했습니다. (허용 상한 ${maxAllowedDrawNo}회)`;
    },

    isLocalUpdateWarningMessage(message = '') {
        const text = String(message || '');
        return text.includes('로컬 업데이트') && text.includes('허용 상한');
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
            this._safeSetItem(CONFIG.KEYS.LOCAL_UPDATES, JSON.stringify(this.localUpdatesCache));
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
        if (typeof localStorage !== 'undefined') {
            this._safeSetItem(CONFIG.KEYS.LOCAL_UPDATES, JSON.stringify(this.localUpdatesCache));
        }
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
