import { UIManager } from '../../../UIManager.js';

export const dataPersistenceStorageWriteHealthMethods = {
    _safeSetItem(key, value, options = {}) {
        try {
            const previousValue = localStorage.getItem(key);
            if (previousValue === value) {
                this._recordStorageWriteSuccess?.(key);
                return true;
            }
            localStorage.setItem(key, value);
            this._recordStorageWriteSuccess?.(key);
            if (!options?.suppressBroadcast && this.isAppOwnedStorageKey(key)) {
                this.notifyCrossTabStateChange({ keys: [key] });
            }
            return true;
        } catch (e) {
            this._recordStorageWriteFailure?.(key, e);
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                console.error(`[persistence] localStorage 저장 공간 초과 (${key})`, e);
                UIManager.toast('저장 공간이 가득 찼습니다. 데이터를 정리해 주세요.', 'error');
            } else {
                console.error(`[persistence] localStorage 저장 실패 (${key})`, e);
            }
            return false;
        }
    },

    _recordStorageWriteSuccess(key) {
        if (!this._lastStorageWriteFailures) this._lastStorageWriteFailures = new Map();
        this._lastStorageWriteFailures.delete(String(key || ''));
    },

    _recordStorageWriteFailure(key, error) {
        if (!this._lastStorageWriteFailures) this._lastStorageWriteFailures = new Map();
        const storageKey = String(key || '');
        this._lastStorageWriteFailures.set(storageKey, {
            key: storageKey,
            name: String(error?.name || 'StorageError'),
            message: String(error?.message || error || '').slice(0, 240),
            failedAt: new Date().toISOString()
        });
    },

    getStorageWriteFailures() {
        if (!this._lastStorageWriteFailures) return [];
        return [...this._lastStorageWriteFailures.values()].sort((a, b) =>
            String(b.failedAt || '').localeCompare(String(a.failedAt || ''))
        );
    },

    _checkStorageQuotaWarning() {
        if (this._quotaWarnShown) return;
        try {
            const summary = this.getStorageSummary();
            if (summary.bytes >= this.STORAGE_DANGER_BYTES) {
                this._quotaWarnShown = true;
                UIManager.toast('저장 공간이 위험 수준입니다. 백업 후 오래된 데이터를 정리해 주세요.', 'error');
            } else if (summary.bytes >= this.STORAGE_WARNING_BYTES && !this._quotaWarnShownWeak) {
                this._quotaWarnShownWeak = true;
                UIManager.toast('저장 공간 사용량이 증가하고 있습니다. 설정에서 확인해 주세요.', 'warning');
            }
        } catch (_e) {
            // 경고 실패는 조용히 무시
        }
    }
};