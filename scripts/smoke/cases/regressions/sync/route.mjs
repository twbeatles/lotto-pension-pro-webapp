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

async function runRefreshCurrentRouteStaleRegression() {
    const calls = [];

    let release;

    const pending = new Promise((resolve) => {
        release = resolve;
    });

    const ctx = {
        currentRoute: 'stats',

        routeToken: 3,

        renderSettingsPanel() {
            calls.push('renderSettingsPanel');
        },

        syncRouteDataNotice() {},

        renderRouteDataGate() {
            return false;
        },

        ensureModule(name) {
            calls.push(`ensureModule:${name}`);

            return pending;
        },

        stats: {
            render() {
                calls.push('stats.render');
            }
        },

        renderDataLists() {
            calls.push('renderDataLists');
        },

        check: {
            onEnter() {
                calls.push('check.onEnter');
            }
        },

        backtest: {
            resetUI() {
                calls.push('backtest.resetUI');
            }
        }
    };

    const task = LottoApp.prototype.refreshCurrentRoute.call(ctx);

    ctx.routeToken += 1;

    ctx.currentRoute = 'gen';

    release();

    await task;

    assert.deepEqual(
        calls,

        ['renderSettingsPanel', 'ensureModule:stats'],

        'refreshCurrentRoute must stop rendering stale route work after route changes'
    );
}

async function runSyncLatestWinRefreshRegression() {
    const previousDocument = globalThis.document;

    globalThis.document = createDocumentStub({
        '#toast-container': null
    });

    try {
        const dm = new DataManager();

        const estNo = estimateLatestDrawKST();

        const calls = [];

        dm.state.winningStats = [
            {
                draw_no: estNo - 1,

                date: '2026-03-07',

                numbers: [1, 2, 3, 4, 5, 6],

                bonus: 7,

                prize_amount: 0,

                winners_count: 0,

                total_sales: 0
            }
        ];

        dm.resolveProxyConfig = () => ({
            source: 'test',

            url: 'https://proxy.example/proxy/latest'
        });

        dm.fetchRangeChunkedFromProxy = async () => ({
            items: [
                {
                    draw_no: estNo,

                    date: '2026-03-14',

                    numbers: [2, 4, 6, 8, 10, 12],

                    bonus: 14,

                    prize_amount: 0,

                    winners_count: 0,

                    total_sales: 0
                }
            ],

            missing: new Set(),

            failedDraws: new Set()
        });

        dm.fetchMissingDraws = async () => [];

        dm.getLocalUpdates = () => [];

        dm.setLocalUpdates = (items) => {
            calls.push(`setLocalUpdates:${items.length}`);

            return { items, droppedFuture: 0 };
        };

        dm.fetchWinningStats = async () => {
            calls.push('fetchWinningStats');

            return true;
        };

        dm.app = {
            updateLatestWin() {
                calls.push('updateLatestWin');
            },

            async refreshCurrentRoute() {
                calls.push('refreshCurrentRoute');
            }
        };

        const result = await dm._fetchLatestFromAPIInternal({ trigger: 'manual' }, null);

        assert.equal(result, true, 'sync must succeed in regression scenario');

        assert.deepEqual(
            calls,

            ['setLocalUpdates:1', 'fetchWinningStats', 'updateLatestWin', 'refreshCurrentRoute'],

            'sync success must refresh latest win card before route refresh'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runRouteDataGateRegression() {
    const previousDocument = globalThis.document;

    const pages = {};

    const createPage = () => {
        const state = {
            gate: null,

            banner: null
        };

        const header = {
            insertAdjacentElement(_position, element) {
                if (String(element.className || '').includes('data-health-gate')) {
                    state.gate = element;
                }

                if (String(element.className || '').includes('data-health-banner')) {
                    state.banner = element;
                }

                element.remove = () => {
                    if (state.gate === element) state.gate = null;

                    if (state.banner === element) state.banner = null;
                };
            }
        };

        return {
            state,

            classList: {
                values: new Set(),

                add(value) {
                    this.values.add(value);
                },

                remove(value) {
                    this.values.delete(value);
                },

                contains(value) {
                    return this.values.has(value);
                }
            },

            querySelector(selector) {
                if (selector === '.page-header') return header;

                if (selector === '.data-health-gate') return state.gate;

                if (selector === '.data-health-banner') return state.banner;

                return null;
            }
        };
    };

    pages['#page-stats'] = createPage();

    pages['#page-check'] = createPage();

    globalThis.document = {
        querySelector(selector) {
            return pages[selector] || null;
        },

        createElement() {
            return {
                className: '',

                innerHTML: '',

                remove() {}
            };
        }
    };

    try {
        const ctx = {
            data: {
                lastWinningStatsLoad: { updatedAt: '2026-04-07T00:00:00.000Z' },

                state: {
                    winningStats: [{ draw_no: 1210 }]
                },

                getDataFreshness() {
                    return {
                        availability: 'partial',

                        isPartial: true,

                        isUnavailable: false,

                        dataHealthMessage: '정적 JSON을 불러오지 못해 로컬 최신 회차 일부 데이터만 사용 중입니다.'
                    };
                }
            },

            routeRequiresFullData: LottoApp.prototype.routeRequiresFullData,

            getRouteDataHealthCopy: LottoApp.prototype.getRouteDataHealthCopy,

            clearRouteDataGate: LottoApp.prototype.clearRouteDataGate
        };

        const gated = LottoApp.prototype.renderRouteDataGate.call(ctx, 'stats');

        assert.equal(gated, true, 'stats route must render a gate when data availability is partial');

        assert.equal(
            pages['#page-stats'].classList.contains('route-data-gated'),

            true,

            'gated route must add route-data-gated class'
        );

        assert.match(
            pages['#page-stats'].state.gate?.innerHTML || '',

            /다시 동기화/,

            'gate panel must expose a resync action'
        );

        LottoApp.prototype.syncRouteDataNotice.call(ctx, 'check');

        assert.match(
            pages['#page-check'].state.banner?.innerHTML || '',

            /부분 복구/,

            'check route must show a partial-recovery banner'
        );

        ctx.data.getDataFreshness = () => ({
            availability: 'full',

            isPartial: false,

            isUnavailable: false,

            dataHealthMessage: ''
        });

        const cleared = LottoApp.prototype.renderRouteDataGate.call(ctx, 'stats');

        assert.equal(cleared, false, 'stats route gate must clear once full data is restored');

        assert.equal(
            pages['#page-stats'].classList.contains('route-data-gated'),

            false,

            'full data must remove route-data-gated class'
        );

        LottoApp.prototype.syncRouteDataNotice.call(ctx, 'check');

        assert.equal(pages['#page-check'].state.banner, null, 'full data must remove check-route availability banner');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

export { runRefreshCurrentRouteStaleRegression, runSyncLatestWinRefreshRegression, runRouteDataGateRegression };
