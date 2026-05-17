export const recordGeneratedMethods = {
    normalizeGeneratedEntry(raw, defaults = {}) {
        const sourceDefault =
            typeof defaults?.source === 'string' && defaults.source.trim()
                ? defaults.source.trim().slice(0, 40)
                : 'generator';
        const entry = Array.isArray(raw) ? { numbers: raw } : raw && typeof raw === 'object' ? raw : null;
        if (!entry) return null;

        const numbers = this.normalizeNumbers(entry.numbers || []);
        if (numbers.length !== 6) return null;

        const strategyRequest =
            entry.strategyRequest && typeof entry.strategyRequest === 'object'
                ? this.cloneSerializableValue(entry.strategyRequest)
                : entry.request && typeof entry.request === 'object'
                  ? this.cloneSerializableValue(entry.request)
                  : null;
        const createdAt =
            typeof entry.createdAt === 'string' && entry.createdAt ? entry.createdAt : new Date().toISOString();
        const source =
            typeof entry.source === 'string' && entry.source.trim() ? entry.source.trim().slice(0, 40) : sourceDefault;

        return {
            numbers,
            strategyRequest,
            createdAt,
            source
        };
    },

    getGeneratedEntries() {
        const normalized = (Array.isArray(this.state.generated) ? this.state.generated : [])
            .map((entry) => this.normalizeGeneratedEntry(entry))
            .filter(Boolean);
        this.state.generated = normalized;
        return normalized;
    },

    setGeneratedEntries(entries = [], defaults = {}) {
        this.state.generated = (Array.isArray(entries) ? entries : [])
            .map((entry) => this.normalizeGeneratedEntry(entry, defaults))
            .filter(Boolean);
        this.persistTemporaryResultsToSession?.();
        return this.state.generated;
    }
};
