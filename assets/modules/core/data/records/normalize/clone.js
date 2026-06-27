import { CONFIG } from '../../../../utils/config.js';

export function getUtf8ByteLength(value = '') {
    const text = String(value || '');
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(text).length;
    }
    return unescape(encodeURIComponent(text)).length;
}

export const recordNormalizeCloneMethods = {
    cloneSerializableValue(value, depth = 0, seen = new WeakSet()) {
        if (value === null || typeof value !== 'object') {
            return value;
        }
        if (depth >= CONFIG.LIMITS.MAX_SERIALIZABLE_DEPTH || seen.has(value)) {
            return null;
        }
        seen.add(value);

        if (Array.isArray(value)) {
            return value
                .slice(0, CONFIG.LIMITS.MAX_SERIALIZABLE_ARRAY_ITEMS)
                .map((item) => this.cloneSerializableValue(item, depth + 1, seen));
        }

        const cloned = {};
        Object.keys(value)
            .slice(0, CONFIG.LIMITS.MAX_SERIALIZABLE_KEYS)
            .forEach((key) => {
                const next = value[key];
                if (next === undefined || typeof next === 'function' || typeof next === 'symbol') return;
                cloned[key] = this.cloneSerializableValue(next, depth + 1, seen);
            });
        return cloned;
    },

    getUtf8ByteLength(value = '') {
        return getUtf8ByteLength(value);
    },

    normalizeStrategyRequestSnapshot(value) {
        if (!value || typeof value !== 'object') return null;
        const cloned = this.cloneSerializableValue(value);
        if (!cloned || typeof cloned !== 'object') return null;
        const serialized = this.stableStringify(cloned) || '';
        if (this.getUtf8ByteLength(serialized) > CONFIG.LIMITS.MAX_STRATEGY_REQUEST_BYTES) return null;
        return cloned;
    },

    createId(prefix = 'id') {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return `${prefix}_${crypto.randomUUID()}`;
        }
        return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    }
};