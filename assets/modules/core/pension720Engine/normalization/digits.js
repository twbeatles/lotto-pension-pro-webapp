import { normalizeDigit } from './primitives.js';

export function normalizeFixedDigits(value) {
    if (value === null || value === undefined || value === '') return null;
    const out = Array(6).fill(null);
    let found = false;

    if (Array.isArray(value)) {
        value.slice(0, 6).forEach((item, pos) => {
            const digit = normalizeDigit(item);
            if (digit === null) return;
            out[pos] = digit;
            found = true;
        });
        return found ? out : null;
    }

    if (typeof value === 'object') {
        const hasZeroBasedKey = Object.prototype.hasOwnProperty.call(value, '0');
        Object.entries(value).forEach(([key, rawDigit]) => {
            const rawPos = Number(key);
            if (!Number.isInteger(rawPos)) return;
            const pos = hasZeroBasedKey ? rawPos : rawPos - 1;
            const digit = normalizeDigit(rawDigit);
            if (pos < 0 || pos > 5 || digit === null) return;
            out[pos] = digit;
            found = true;
        });
    }

    return found ? out : null;
}

export function normalizeExcludedDigits(value) {
    if (value === null || value === undefined || value === '') return null;
    const out = Array.from({ length: 6 }, () => []);
    let found = false;

    const addDigit = (pos, rawDigit) => {
        const digit = normalizeDigit(rawDigit);
        if (pos < 0 || pos > 5 || digit === null || out[pos].includes(digit)) return;
        out[pos].push(digit);
        found = true;
    };

    if (Array.isArray(value)) {
        value.slice(0, 6).forEach((items, pos) => {
            (Array.isArray(items) ? items : [items]).forEach((item) => addDigit(pos, item));
        });
        return found ? out : null;
    }

    if (typeof value === 'object') {
        const hasZeroBasedKey = Object.prototype.hasOwnProperty.call(value, '0');
        Object.entries(value).forEach(([key, rawItems]) => {
            const rawPos = Number(key);
            if (!Number.isInteger(rawPos)) return;
            const pos = hasZeroBasedKey ? rawPos : rawPos - 1;
            (Array.isArray(rawItems) ? rawItems : [rawItems]).forEach((item) => addDigit(pos, item));
        });
    }

    return found ? out.map((items) => items.sort((a, b) => a - b)) : null;
}