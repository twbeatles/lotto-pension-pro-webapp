export const dataDefaultsStrategyPrefsMethods = {
    isStrategyScope(scope) {
        return ['generator', 'ai', 'backtest', 'pension720'].includes(String(scope || '').trim());
    },

    mergeStrategyPrefs(raw) {
        const defaults = this.getDefaultStrategyPrefs();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            generator: {
                ...defaults.generator,
                ...(input.generator || {}),
                params: { ...defaults.generator.params, ...(input.generator?.params || {}) },
                filters: { ...defaults.generator.filters, ...(input.generator?.filters || {}) }
            },
            ai: {
                ...defaults.ai,
                ...(input.ai || {}),
                params: { ...defaults.ai.params, ...(input.ai?.params || {}) },
                filters: { ...defaults.ai.filters, ...(input.ai?.filters || {}) }
            },
            backtest: {
                ...defaults.backtest,
                ...(input.backtest || {}),
                params: { ...defaults.backtest.params, ...(input.backtest?.params || {}) },
                filters: { ...defaults.backtest.filters, ...(input.backtest?.filters || {}) }
            },
            pension720: {
                ...defaults.pension720,
                ...(input.pension720 || {}),
                params: { ...defaults.pension720.params, ...(input.pension720?.params || {}) },
                filters: { ...defaults.pension720.filters, ...(input.pension720?.filters || {}) }
            }
        };
    },

    setStrategyPrefs(scope, request) {
        if (!this.isStrategyScope(scope)) return;
        this.state.strategyPrefs[scope] = {
            ...this.state.strategyPrefs[scope],
            ...(request || {}),
            params: {
                ...(this.state.strategyPrefs[scope]?.params || {}),
                ...(request?.params || {})
            },
            filters: {
                ...(this.state.strategyPrefs[scope]?.filters || {}),
                ...(request?.filters || {})
            }
        };
        this.markDirty('settings');
    }
};