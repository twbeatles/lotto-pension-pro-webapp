import assert from 'node:assert/strict';

function normalizeStats(raw) {
    const list = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
    return list
        .map((row) => ({
            draw_no: Number(row.draw_no),
            numbers: (row.numbers || []).map(Number).sort((a, b) => a - b),
            bonus: Number(row.bonus),
            date: row.date,
            prize_amount: Number(row.prize_amount || 0),
            winners_count: Number(row.winners_count || 0),
            total_sales: Number(row.total_sales || 0)
        }))
        .filter((row) => Number.isFinite(row.draw_no) && row.numbers.length === 6 && Number.isFinite(row.bonus))
        .sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
}

function buildSmokeRequest() {
    return {
        strategyId: 'ensemble_weighted',
        params: {
            simulationCount: 3000,
            lookbackWindow: 20,
            wheelPoolSize: null,
            wheelGuarantee: null,
            seed: 20260228,
            payoutMode: 'hybrid_dynamic_first'
        },
        filters: {
            oddEven: [2, 4],
            highLow: [2, 4],
            sumRange: [90, 200],
            acRange: [4, 9],
            maxConsecutivePairs: 2,
            endDigitUniqueMin: 3
        }
    };
}

function assertTicketShape(sets, expectedCount) {
    assert.ok(Array.isArray(sets), 'sets must be an array');
    assert.ok(sets.length > 0, 'sets must not be empty');
    assert.ok(sets.length <= expectedCount, 'sets must not exceed requested count');
    for (const set of sets) {
        assert.equal(set.length, 6, 'each set must contain 6 numbers');
        const sorted = [...set].sort((a, b) => a - b);
        assert.deepEqual(set, sorted, 'set must be sorted');
        assert.equal(new Set(set).size, 6, 'set must contain unique numbers');
        for (const n of set) assert.ok(n >= 1 && n <= 45, 'numbers must be in [1, 45]');
    }
}

function createField(overrides = {}) {
    return {
        value: '',
        checked: false,
        disabled: false,
        innerHTML: '',
        textContent: '',
        style: {},
        dataset: {},
        classList: {
            add() {},
            remove() {}
        },
        addEventListener() {},
        appendChild() {},
        setAttribute() {},
        ...overrides
    };
}

function createDocumentStub(map = {}) {
    return {
        querySelector(selector) {
            return map[selector] ?? null;
        },
        getElementById(id) {
            return map[`#${id}`] ?? null;
        },
        querySelectorAll() {
            return [];
        }
    };
}

export {
    normalizeStats,
    buildSmokeRequest,
    assertTicketShape,
    createField,
    createDocumentStub
};
