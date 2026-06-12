/* eslint-disable no-unused-vars */
import {
    assert,
    compareLottoOfficialFreshness,
    createDocumentStub,
    createField,
    DataManager,
    estimateLatestDrawKST,
    fetchOfficialDraw,
    LottoApp,
    readFile,
    resolve
} from '../support.mjs';

async function runWinningStatsLoadClassificationRegression() {
    const previousDocument = globalThis.document;

    const previousWarn = console.warn;

    const statusText = createField();

    const statusDot = createField({ style: {} });

    const statusEl = {
        querySelector(selector) {
            if (selector === '.text') return statusText;

            if (selector === '.dot') return statusDot;

            return null;
        }
    };

    console.warn = (...args) => {
        if (String(args[0] || '').includes('정적 당첨 데이터 조회 실패')) return;

        previousWarn(...args);
    };

    globalThis.document = createDocumentStub({
        '#syncStatus': statusEl
    });

    try {
        const dm = new DataManager();

        dm.fetchWithTimeout = async () => {
            throw new Error('network-timeout');
        };

        dm.app = {
            async isProbablyOffline() {
                return false;
            }
        };

        const result = await dm.fetchWinningStats({ notifyTicketSettle: false });

        assert.equal(result, false, 'winning stats fetch failure must still report false');

        assert.equal(dm.lastWinningStatsLoad.offline, false, 'online fetch failure must not be classified as offline');

        assert.equal(
            statusText.textContent,

            '데이터 없음',

            'online fetch failure without fallback data must surface data-unavailable state'
        );
    } finally {
        console.warn = previousWarn;

        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runUnexpectedStaticHoleClassificationRegression() {
    const dm = new DataManager();

    const staticItems = [1, 2, 4].map((drawNo) => ({
        draw_no: drawNo,

        date: `2026-03-0${drawNo}`,

        numbers: [1, 2, 3, 4, 5, 6],

        bonus: 7
    }));

    const health = dm.getWinningStatsDataHealth({
        staticItems,

        localUpdates: [],

        mergedItems: [...staticItems].sort((a, b) => b.draw_no - a.draw_no),

        staticError: null
    });

    assert.equal(health.availability, 'partial', 'unexpected static holes must downgrade data availability to partial');

    assert.equal(health.source, 'static', 'partial static hole without local updates must still report static source');

    assert.match(
        health.message,

        /누락 회차: 3/,

        'partial static hole message must identify the unexpected missing draw'
    );
}

function runExpectedMissingDrawAllowanceRegression() {
    const dm = new DataManager();

    const staticItems = [];

    for (let drawNo = 1; drawNo <= 147; drawNo++) {
        if (drawNo === 146) continue;

        staticItems.push({
            draw_no: drawNo,

            date: `2026-03-${String(((drawNo - 1) % 28) + 1).padStart(2, '0')}`,

            numbers: [1, 2, 3, 4, 5, 6],

            bonus: 7
        });
    }

    const health = dm.getWinningStatsDataHealth({
        staticItems,

        localUpdates: [],

        mergedItems: [...staticItems].sort((a, b) => b.draw_no - a.draw_no),

        staticError: null
    });

    assert.equal(health.availability, 'full', 'documented missing draws must not break full-data classification');

    assert.equal(health.source, 'static', 'allowed missing-draw classification must preserve static source');
}

function runMergedLocalUpdatesGapClassificationRegression() {
    const dm = new DataManager();

    const staticItems = [];

    for (let drawNo = 1; drawNo <= 1209; drawNo++) {
        if (drawNo === 146) continue;

        staticItems.push({
            draw_no: drawNo,

            date: `2026-01-${String(((drawNo - 1) % 28) + 1).padStart(2, '0')}`,

            numbers: [1, 2, 3, 4, 5, 6],

            bonus: 7
        });
    }

    const localUpdates = [
        {
            draw_no: 1221,

            date: '2026-04-25',

            numbers: [6, 13, 18, 28, 30, 36],

            bonus: 9
        }
    ];

    const mergedItems = [...staticItems, ...localUpdates].sort((a, b) => b.draw_no - a.draw_no);

    const health = dm.getWinningStatsDataHealth({
        staticItems,

        localUpdates,

        mergedItems,

        staticError: null
    });

    assert.equal(
        health.availability,

        'partial',

        'merged local update gaps must downgrade data availability to partial'
    );

    assert.equal(health.source, 'static_local', 'merged gap classification must still report static_local source');

    assert.match(health.message, /1210/, 'merged gap message must identify the first missing draw');
}

async function runPartialWinningStatsRecoveryRegression() {
    const previousDocument = globalThis.document;

    const previousWarn = console.warn;

    const statusText = createField();

    const statusDot = createField({ style: {} });

    const statusEl = {
        querySelector(selector) {
            if (selector === '.text') return statusText;

            if (selector === '.dot') return statusDot;

            return null;
        }
    };

    console.warn = (...args) => {
        if (String(args[0] || '').includes('정적 당첨 데이터 조회 실패')) return;

        previousWarn(...args);
    };

    globalThis.document = createDocumentStub({
        '#syncStatus': statusEl
    });

    try {
        const dm = new DataManager();

        dm.save = () => {};

        dm.localUpdatesCache = [
            {
                draw_no: 1210,

                date: '2026-03-07',

                numbers: [1, 2, 3, 4, 5, 6],

                bonus: 7
            }
        ];

        dm.fetchWithTimeout = async () => {
            throw new Error('network-timeout');
        };

        const result = await dm.fetchWinningStats({ notifyTicketSettle: false });

        assert.equal(result, true, 'local-only winning stats must still hydrate partial recovery state');

        assert.equal(dm.dataHealth.availability, 'partial', 'local-only hydrate must report partial availability');

        assert.equal(dm.dataHealth.source, 'local_only', 'local-only hydrate must report local_only source');

        assert.equal(
            dm.state.winningStats[0]?.draw_no,

            1210,

            'local-only hydrate must rebuild winning stats from local updates'
        );

        assert.equal(
            statusText.textContent,

            '부분 복구',

            'partial recovery must surface a partial-recovery status label'
        );
    } finally {
        console.warn = previousWarn;

        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runWinningStatsPreserveExistingOnStaticFailureRegression() {
    const previousDocument = globalThis.document;

    const previousWarn = console.warn;

    const statusText = createField();

    const statusDot = createField({ style: {} });

    const statusEl = {
        querySelector(selector) {
            if (selector === '.text') return statusText;

            if (selector === '.dot') return statusDot;

            return null;
        }
    };

    console.warn = (...args) => {
        if (String(args[0] || '').includes('정적 당첨 데이터 조회 실패')) return;

        previousWarn(...args);
    };

    globalThis.document = createDocumentStub({
        '#syncStatus': statusEl
    });

    try {
        const dm = new DataManager();

        dm.save = () => {};

        dm.state.winningStats = [
            {
                draw_no: 1210,

                date: '2026-03-07',

                numbers: [1, 2, 3, 4, 5, 6],

                bonus: 7
            }
        ];

        dm.state.staticLatestDrawNo = 1210;

        dm.dataHealth = dm.mergeDataHealth({
            availability: 'full',

            source: 'static',

            latestDrawNo: 1210,

            message: 'previous full data'
        });

        dm.localUpdatesCache = [];

        dm.fetchWithTimeout = async () => {
            throw new Error('transient-static-failure');
        };

        const result = await dm.fetchWinningStats({ notifyTicketSettle: false });

        assert.equal(result, true, 'transient static failure must preserve existing in-memory winning data');

        assert.equal(dm.state.winningStats[0]?.draw_no, 1210, 'preserved winning stats must remain available');

        assert.equal(dm.dataHealth.availability, 'full', 'preserved health should keep previous availability');

        assert.match(
            dm.dataHealth.message,

            /이전에 로드된 데이터/,

            'preserved health message must explain the fallback'
        );

        assert.equal(statusText.textContent, '이전 데이터 유지', 'status must surface preserved-data mode');
    } finally {
        console.warn = previousWarn;

        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runWinningStatsPreserveExistingWithLocalUpdatesRegression() {
    const previousDocument = globalThis.document;

    const previousWarn = console.warn;

    const statusText = createField();

    const statusDot = createField({ style: {} });

    const statusEl = {
        querySelector(selector) {
            if (selector === '.text') return statusText;

            if (selector === '.dot') return statusDot;

            return null;
        }
    };

    console.warn = (...args) => {
        if (String(args[0] || '').includes('정적 당첨 데이터 조회 실패')) return;

        previousWarn(...args);
    };

    globalThis.document = createDocumentStub({
        '#syncStatus': statusEl
    });

    try {
        const dm = new DataManager();

        dm.save = () => {};

        dm.state.winningStats = [5, 4, 3, 2, 1].map((drawNo) => ({
            draw_no: drawNo,

            date: `2026-03-${String(drawNo).padStart(2, '0')}`,

            numbers: [1, 2, 3, 4, 5, 6],

            bonus: 7
        }));

        dm.state.staticLatestDrawNo = 5;

        dm.dataHealth = dm.mergeDataHealth({
            availability: 'full',

            source: 'static',

            latestDrawNo: 5,

            message: 'previous full data'
        });

        dm.localUpdatesCache = [
            {
                draw_no: 6,

                date: '2026-03-06',

                numbers: [6, 7, 8, 9, 10, 11],

                bonus: 12
            }
        ];

        dm.fetchWithTimeout = async () => {
            throw new Error('transient-static-failure');
        };

        const result = await dm.fetchWinningStats({ notifyTicketSettle: false });

        assert.equal(result, true, 'local updates must not force a local-only downgrade after static failure');

        assert.deepEqual(
            dm.state.winningStats.map((item) => item.draw_no),

            [6, 5, 4, 3, 2, 1],

            'preserved winning stats must merge previous full rows with local updates'
        );

        assert.equal(dm.state.staticLatestDrawNo, 5, 'static latest draw must stay anchored to previous static data');

        assert.equal(dm.dataHealth.availability, 'full', 'merged preserved data should keep full availability');

        assert.equal(dm.dataHealth.source, 'static_local', 'merged preserved data must expose static plus local source');

        assert.match(
            dm.dataHealth.message,

            /로컬 보정 데이터/,

            'preserved health message must explain local update preservation'
        );

        assert.equal(statusText.textContent, '이전 데이터 유지', 'status must surface preserved-data mode');
    } finally {
        console.warn = previousWarn;

        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

export {
    runWinningStatsLoadClassificationRegression,
    runUnexpectedStaticHoleClassificationRegression,
    runExpectedMissingDrawAllowanceRegression,
    runMergedLocalUpdatesGapClassificationRegression,
    runPartialWinningStatsRecoveryRegression,
    runWinningStatsPreserveExistingOnStaticFailureRegression,
    runWinningStatsPreserveExistingWithLocalUpdatesRegression
};
