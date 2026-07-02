import { getLottoLoadSourceLabel, LOTTO_LOAD_SOURCE_VALUES } from '../dataSource.js';

export const dataDefaultsDataHealthMethods = {
    getDefaultDataHealth() {
        return {
            availability: 'none',
            source: 'none',
            latestDrawNo: 0,
            message: ''
        };
    },

    mergeDataHealth(raw) {
        const defaults = this.getDefaultDataHealth();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            availability: ['full', 'partial', 'none'].includes(input.availability)
                ? input.availability
                : defaults.availability,
            source: ['static', 'static_local', 'local_only', 'none'].includes(input.source)
                ? input.source
                : defaults.source,
            latestDrawNo: Math.max(0, Math.floor(Number(input.latestDrawNo || 0))),
            message: typeof input.message === 'string' ? input.message.slice(0, 240) : defaults.message
        };
    },

    setDataHealth(next = {}) {
        this.dataHealth = this.mergeDataHealth({
            ...(this.dataHealth || this.getDefaultDataHealth()),
            ...(next || {})
        });
        this.app?.renderSettingsPanel?.();
        return this.dataHealth;
    },

    getDataHealthSourceLabel(source = this.dataHealth?.source) {
        return getLottoLoadSourceLabel(
            LOTTO_LOAD_SOURCE_VALUES.includes(source) ? source : 'none'
        );
    },

    getLocalRestoreSourceLabel(source = this.dataHealth?.source) {
        return `로컬 복원 (${this.getDataHealthSourceLabel(source)})`;
    }
};