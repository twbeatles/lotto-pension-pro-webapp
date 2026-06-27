export function toObject(value, fallback = {}) {
    return value && typeof value === 'object' ? value : fallback;
}

export function toArray(value) {
    return Array.isArray(value) ? value : [];
}