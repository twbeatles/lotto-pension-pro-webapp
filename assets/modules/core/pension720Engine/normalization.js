import { createDefaultPension720StrategyRequest, resolvePension720StrategyId } from '../Pension720StrategyCatalog.js';

function normalizeSixDigitString(value = '') {
    const text = String(value ?? '').trim();
    return /^\d{6}$/.test(text) ? text : '';
}

function normalizeDraw(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const drawNo = Number(raw.draw_no);
    const group = Number(raw.group);
    const number = normalizeSixDigitString(raw.number);
    const bonusNumber = normalizeSixDigitString(raw.bonus_number);
    if (!Number.isInteger(drawNo) || drawNo < 1) return null;
    if (!Number.isInteger(group) || group < 1 || group > 5) return null;
    if (!number || !bonusNumber) return null;
    return {
        draw_no: drawNo,
        date: typeof raw.date === 'string' ? raw.date : '',
        group,
        digits: number.split('').map(Number),
        number,
        bonus_digits: bonusNumber.split('').map(Number),
        bonus_number: bonusNumber
    };
}

function clampInt(value, min, max, fallback) {
    const next = Math.floor(Number(value));
    if (!Number.isFinite(next)) return fallback;
    return Math.min(max, Math.max(min, next));
}

function normalizePair(value, min, max) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const a = Number(value[0]);
    const b = Number(value[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const left = Math.max(min, Math.min(max, Math.floor(a)));
    const right = Math.max(min, Math.min(max, Math.floor(b)));
    return left <= right ? [left, right] : [right, left];
}

function normalizeGroups(value) {
    if (value === null || value === undefined || value === '') return null;
    const source = Array.isArray(value) ? value : String(value).split(/[^0-9]+/);
    const groups = [
        ...new Set(source.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 5))
    ].sort((a, b) => a - b);
    return groups.length ? groups : null;
}

function normalizeDigit(value) {
    if (value === null || value === undefined || value === '') return null;
    const digit = Number(value);
    return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? digit : null;
}

function normalizeFixedDigits(value) {
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

function normalizeExcludedDigits(value) {
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

function normalizeFilters(filters = {}) {
    return {
        groups: normalizeGroups(filters.groups),
        fixedDigits: normalizeFixedDigits(filters.fixedDigits),
        excludedDigitsByPosition: normalizeExcludedDigits(filters.excludedDigitsByPosition),
        digitSumRange: normalizePair(filters.digitSumRange, 0, 54),
        oddDigitRange: normalizePair(filters.oddDigitRange, 0, 6),
        highDigitRange: normalizePair(filters.highDigitRange, 0, 6),
        uniqueDigitMin: clampNullableInt(filters.uniqueDigitMin, 1, 6),
        maxSameDigit: clampNullableInt(filters.maxSameDigit, 1, 6)
    };
}

function clampNullableInt(value, min, max) {
    if (value === null || value === undefined || value === '') return null;
    return clampInt(value, min, max, null);
}

function applyProfileDefaults(params, profile = '') {
    if (profile === 'fast') {
        return {
            ...params,
            lookbackWindow: params.lookbackWindow ?? 20,
            candidatePoolSize: params.candidatePoolSize ?? 80
        };
    }
    if (profile === 'precise') {
        return {
            ...params,
            lookbackWindow: params.lookbackWindow ?? 80,
            candidatePoolSize: params.candidatePoolSize ?? 240
        };
    }
    return {
        ...params,
        lookbackWindow: params.lookbackWindow ?? 40,
        candidatePoolSize: params.candidatePoolSize ?? 140
    };
}

function normalizeRequest(raw = {}) {
    const profile = ['fast', 'basic', 'precise'].includes(raw.profile) ? raw.profile : '';
    const strategyId = resolvePension720StrategyId(raw.strategyId || raw.id || profile || 'mixed_balance');
    const defaults = createDefaultPension720StrategyRequest(strategyId);
    const params = applyProfileDefaults(
        {
            ...defaults.params,
            ...(raw.params || {}),
            seed: raw.seed ?? raw.params?.seed ?? defaults.params.seed
        },
        profile
    );

    return {
        strategyId,
        evidenceTier: defaults.evidenceTier,
        params: {
            seed:
                Number.isFinite(Number(params.seed)) && Number(params.seed) > 0
                    ? Math.floor(Number(params.seed))
                    : null,
            lookbackWindow: clampInt(params.lookbackWindow, 1, 300, defaults.params.lookbackWindow),
            candidatePoolSize: clampInt(params.candidatePoolSize, 20, 800, defaults.params.candidatePoolSize)
        },
        filters: normalizeFilters({
            ...defaults.filters,
            ...(raw.filters || {})
        })
    };
}

export {
    applyProfileDefaults,
    clampInt,
    clampNullableInt,
    normalizeDigit,
    normalizeDraw,
    normalizeExcludedDigits,
    normalizeFilters,
    normalizeFixedDigits,
    normalizeGroups,
    normalizePair,
    normalizeRequest,
    normalizeSixDigitString
};
