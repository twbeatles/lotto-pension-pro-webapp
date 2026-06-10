export const dataPension720HealthMethods = {
    getDefaultPension720DataHealth() {
        return {
            availability: 'none',
            source: 'none',
            latestDrawNo: 0,
            message: '',
            updatedAt: ''
        };
    },

    mergePension720DataHealth(raw) {
        const defaults = this.getDefaultPension720DataHealth();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            availability: ['full', 'none'].includes(input.availability) ? input.availability : defaults.availability,
            source: ['static', 'official', 'official_cache', 'none'].includes(input.source)
                ? input.source
                : defaults.source,
            latestDrawNo: Math.max(0, Math.floor(Number(input.latestDrawNo || 0))),
            message: typeof input.message === 'string' ? input.message.slice(0, 240) : defaults.message,
            updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : defaults.updatedAt
        };
    },

    setPension720DataHealth(next = {}) {
        this.pension720DataHealth = this.mergePension720DataHealth({
            ...(this.pension720DataHealth || this.getDefaultPension720DataHealth()),
            ...(next || {})
        });
        return this.pension720DataHealth;
    },

    getPension720DataHealthSourceLabel(source = this.pension720DataHealth?.source) {
        if (source === 'official') return 'official';
        if (source === 'official_cache') return 'official cache';
        if (source === 'static') return 'static';
        return 'none';
    }
};
