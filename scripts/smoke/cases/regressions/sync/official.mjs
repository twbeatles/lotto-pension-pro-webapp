/* eslint-disable no-unused-vars */
import {
    assert,
    compareLottoOfficialFreshness,
    createDocumentStub,
    createField,
    DataManager,
    estimateLatestDrawKST,
    fetchOfficialDraw,
    isRetriableOfficialFetchError,
    LottoApp,
    readFile,
    resolve
} from '../support.mjs';

async function runStaticDataFreshnessBudgetRegression() {
    const raw = await readFile(resolve(process.cwd(), 'data/winning_stats.json'), 'utf8');

    const items = JSON.parse(raw);

    const maxDrawNo = Math.max(...items.map((item) => Number(item?.draw_no || 0)).filter(Number.isFinite));

    const estimatedLatestDrawNo = estimateLatestDrawKST();

    const staleBudgetDraws = 2;

    assert.ok(
        estimatedLatestDrawNo - maxDrawNo <= staleBudgetDraws,

        `static winning data must be within ${staleBudgetDraws} draws of estimated latest draw`
    );
}

function runEstimateLatestDrawKstBoundaryRegression() {
    assert.equal(
        estimateLatestDrawKST(new Date(Date.UTC(2026, 4, 23, 21, 4, 0))),

        1224,

        'Saturday 21:04 KST must still report the previous Lotto draw during publish grace'
    );

    assert.equal(
        estimateLatestDrawKST(new Date(Date.UTC(2026, 4, 23, 21, 5, 0))),

        1225,

        'Saturday 21:05 KST must advance to the new Lotto draw after publish grace'
    );

    assert.equal(
        estimateLatestDrawKST(new Date(Date.UTC(2026, 4, 24, 0, 0, 0))),

        1225,

        'Sunday 00:00 KST must keep the newly published Lotto draw'
    );
}

function runLottoOfficialFreshnessComparisonRegression() {
    const localLatest = {
        draw_no: 10,

        date: '2026-05-16',

        numbers: [1, 2, 3, 4, 5, 6],

        bonus: 7,

        prize_amount: 1000,

        winners_count: 1,

        total_sales: 9000
    };

    const matching = compareLottoOfficialFreshness([localLatest], [{ ...localLatest }], {
        estimatedLatestDrawNo: 10
    });

    assert.equal(matching.ok, true, 'matching official latest draw fields must pass');

    const correctedOfficial = compareLottoOfficialFreshness(
        [localLatest],

        [
            {
                ...localLatest,

                numbers: [2, 3, 4, 5, 6, 8],

                bonus: 9
            }
        ],

        { estimatedLatestDrawNo: 10 }
    );

    assert.equal(correctedOfficial.ok, false, 'official row field mismatches must fail');

    assert.ok(
        correctedOfficial.issues.some((issue) => issue.includes('numbers mismatch')),

        'official mismatch report must identify number drift'
    );

    const estimatedBehind = compareLottoOfficialFreshness([localLatest], [{ ...localLatest }], {
        estimatedLatestDrawNo: 11
    });

    assert.equal(estimatedBehind.ok, false, 'estimated latest draw drift must still fail');

    assert.ok(
        estimatedBehind.issues.some((issue) => issue.includes('estimated latest draw 11')),

        'estimated drift report must identify the estimated latest draw'
    );
}

async function runLottoOfficialFetchRetryRegression() {
    let attempts = 0;

    const draw = {
        draw_no: 10,

        date: '2026-05-16',

        numbers: [1, 2, 3, 4, 5, 6],

        bonus: 7,

        prize_amount: 1000,

        winners_count: 1,

        total_sales: 9000
    };

    const result = await fetchOfficialDraw(10, {
        retries: 1,

        retryDelayMs: 0,

        dmFactory: () => ({
            async fetchOneDraw(_drawNo, _proxyConfig, log) {
                attempts += 1;

                log('attempt', 'TEST_ATTEMPT', { attempts });

                if (attempts === 1) throw new TypeError('socket closed');

                return draw;
            }
        })
    });

    assert.equal(attempts, 2, 'official Lotto fetch must retry transient failures');

    assert.equal(result.item.draw_no, 10, 'official Lotto retry must return the fetched draw');

    assert.equal(result.attempts, 2, 'official Lotto fetch must expose retry attempts');

    await assert.rejects(
        () =>
            fetchOfficialDraw(11, {
                retries: 1,

                retryDelayMs: 0,

                dmFactory: () => ({
                    async fetchOneDraw() {
                        return null;
                    }
                })
            }),

        /after 2 attempt/,

        'official Lotto fetch must fail when all retry attempts return no draw'
    );
}

function runLottoOfficialFetchWrappedErrorRegression() {
    const timeout = new TypeError('fetch failed');
    timeout.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };

    const wrapped = new Error('official lotto draw 10 could not be fetched after 3 attempt(s): fetch failed', {
        cause: timeout
    });

    const loggedTimeout = new Error('official lotto draw 10 could not be fetched after 3 attempt(s): no payload');
    loggedTimeout.logs = [
        {
            code: 'SYNC_FETCH_ONE_FAIL',
            meta: { message: 'fetch failed' }
        }
    ];

    const malformedJson = new Error('official lotto draw 10 could not be fetched after 1 attempt(s): bad json', {
        cause: new SyntaxError('Unexpected token')
    });
    malformedJson.logs = [
        {
            code: 'SYNC_FETCH_ONE_INVALID_PAYLOAD',
            meta: { keys: ['foo'] }
        }
    ];

    assert.equal(
        isRetriableOfficialFetchError(wrapped),
        true,
        'wrapped Lotto timeout must be classified as retriable for scheduled CI defer'
    );

    assert.equal(
        isRetriableOfficialFetchError(loggedTimeout),
        true,
        'logged Lotto provider fetch failures must be classified as retriable for scheduled CI defer'
    );

    assert.equal(
        isRetriableOfficialFetchError(malformedJson),
        false,
        'malformed Lotto official payload must not be treated as a deferred network outage'
    );
}

export {
    runStaticDataFreshnessBudgetRegression,
    runEstimateLatestDrawKstBoundaryRegression,
    runLottoOfficialFreshnessComparisonRegression,
    runLottoOfficialFetchRetryRegression,
    runLottoOfficialFetchWrappedErrorRegression
};
