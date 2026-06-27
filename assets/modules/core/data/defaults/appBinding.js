export const dataDefaultsAppBindingMethods = {
    setApp(app) {
        this.app = app;
    },

    stableStringify(value) {
        if (value === null || typeof value !== 'object') {
            return JSON.stringify(value);
        }

        if (Array.isArray(value)) {
            const items = value.map((item) => {
                const serialized = this.stableStringify(item);
                return serialized === undefined ? 'null' : serialized;
            });
            return `[${items.join(',')}]`;
        }

        const keys = Object.keys(value).sort();
        const entries = [];
        keys.forEach((key) => {
            const next = value[key];
            if (next === undefined || typeof next === 'function' || typeof next === 'symbol') return;
            const serialized = this.stableStringify(next);
            if (serialized === undefined) return;
            entries.push(`${JSON.stringify(key)}:${serialized}`);
        });
        return `{${entries.join(',')}}`;
    }
};