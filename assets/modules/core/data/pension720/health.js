import {
    getRemoteDataSourceLabel,
    mergeRemoteDataHealth,
    REMOTE_DATA_SOURCE,
    REMOTE_DATA_SOURCE_VALUES
} from '../dataSource.js';

export const dataPension720HealthMethods = {
    getDefaultPension720DataHealth() {
        return mergeRemoteDataHealth({}, REMOTE_DATA_SOURCE_VALUES);
    },

    mergePension720DataHealth(raw) {
        const merged = mergeRemoteDataHealth(raw, REMOTE_DATA_SOURCE_VALUES);
        return {
            ...merged,
            availability: ['full', 'none'].includes(merged.availability) ? merged.availability : 'none'
        };
    },

    setPension720DataHealth(next = {}) {
        this.pension720DataHealth = this.mergePension720DataHealth({
            ...(this.pension720DataHealth || this.getDefaultPension720DataHealth()),
            ...(next || {})
        });
        this.app?.renderSettingsPanel?.();
        return this.pension720DataHealth;
    },

    getPension720DataHealthSourceLabel(source = this.pension720DataHealth?.source) {
        return getRemoteDataSourceLabel(source);
    },

    markPension720SyncSuccess({ drawNo = 0, source = REMOTE_DATA_SOURCE.NONE, providerLabel = '' } = {}) {
        const label =
            providerLabel ||
            this.getPension720DataHealthSourceLabel(source) ||
            this.getPension720DataHealthSourceLabel(REMOTE_DATA_SOURCE.STATIC);
        return this.setSyncMeta({
            pension720: this.mergePension720SyncMeta({
                currentSource: label,
                lastSuccessAt: new Date().toISOString(),
                lastSuccessDrawNo: Math.max(0, Math.floor(Number(drawNo || 0))),
                lastFailureAt: '',
                lastFailureMessage: ''
            })
        });
    },

    markPension720SyncFailure(message, { sourceLabel = '' } = {}) {
        return this.setSyncMeta({
            pension720: this.mergePension720SyncMeta({
                currentSource: sourceLabel || this.state.syncMeta?.pension720?.currentSource || '',
                lastFailureAt: new Date().toISOString(),
                lastFailureMessage: String(message || '연금복권 공식 데이터 조회에 실패했습니다.').slice(0, 240)
            })
        });
    }
};
