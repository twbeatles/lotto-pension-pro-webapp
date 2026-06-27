import { $ } from '../../../utils/utils.js';

export const pension720OptionParserMethods = {
    readNumberInput(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const value = String(el.value || '').trim();
        if (!value) return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    },

    buildRange(minId, maxId) {
        const min = this.readNumberInput(minId, null);
        const max = this.readNumberInput(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    },

    parseGroups(value = '') {
        const groups = [
            ...new Set(
                String(value || '')
                    .split(/[^0-9]+/)
                    .map(Number)
                    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 5)
            )
        ].sort((a, b) => a - b);
        return groups.length ? groups : null;
    },

    parseFixedDigits(value = '') {
        const text = String(value || '').trim();
        if (!text) return null;
        const out = Array(6).fill(null);
        let found = false;
        for (const match of text.matchAll(/([1-6])\s*[:=]\s*([0-9])/g)) {
            out[Number(match[1]) - 1] = Number(match[2]);
            found = true;
        }
        return found ? out : null;
    },

    parseExcludedDigits(value = '') {
        const text = String(value || '').trim();
        if (!text) return null;
        const out = Array.from({ length: 6 }, () => []);
        let found = false;
        for (const segment of text.split(/[;|/]+/)) {
            const match = segment.match(/([1-6])\s*[:=]\s*([0-9,\s]+)/);
            if (!match) continue;
            const pos = Number(match[1]) - 1;
            const digits = [
                ...new Set(
                    match[2]
                        .split(/[^0-9]+/)
                        .map(Number)
                        .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9)
                )
            ];
            if (digits.length) {
                out[pos] = digits;
                found = true;
            }
        }
        return found ? out : null;
    }
};