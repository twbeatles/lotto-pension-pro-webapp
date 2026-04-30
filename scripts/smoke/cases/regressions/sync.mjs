import {
    assert,
    createDocumentStub,
    createField,
    DataManager,
    estimateLatestDrawKST,
    LottoApp,
    readFile,
    resolve
} from './support.mjs';

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

async function runSyncInvalidPayloadRegression() {
    const dm = new DataManager();
    const syncLogs = [];
    const uiLogs = [];

    dm.buildCustomSingleFetchUrls = () => [
        {
            label: 'test-proxy',
            url: 'https://proxy.example/proxy/latest?draw_no=1210'
        }
    ];
    dm.buildBuiltInSingleFetchUrls = () => [];
    dm.fetchWithTimeout = async () => ({
        ok: true,
        async text() {
            return JSON.stringify({ foo: 'bar', meta: { ok: true } });
        }
    });
    dm.logSync = (code, message, meta = null) => {
        syncLogs.push({ code, message, meta });
    };

    const result = await dm.fetchOneDraw(1210, { url: 'https://proxy.example/proxy/latest' }, (message, code, meta) => {
        uiLogs.push({ message, code, meta });
    });

    assert.equal(result, null, 'unexpected payload shape must not be accepted as draw data');
    assert.ok(
        syncLogs.some((entry) => entry.code === 'SYNC_FETCH_ONE_INVALID_PAYLOAD'),
        'unexpected payload shape must emit a sync diagnostic log'
    );
    assert.ok(
        uiLogs.some((entry) => entry.code === 'SYNC_FETCH_ONE_INVALID_PAYLOAD'),
        'unexpected payload shape must surface through sync log callback'
    );
}

function runSyncPayloadDrawIntegerGuardRegression() {
    const dm = new DataManager();

    assert.equal(
        dm.normalizeDrawItem({
            draw_no: 1210.5,
            date: '2026-02-07',
            numbers: [1, 2, 3, 4, 5, 6],
            bonus: 7
        }),
        null,
        'decimal draw_no must be rejected'
    );
    assert.equal(
        dm.normalizeDrawItem({
            ltEpsd: '1211.5',
            ltRflYmd: '20260214',
            tm1WnNo: 1,
            tm2WnNo: 2,
            tm3WnNo: 3,
            tm4WnNo: 4,
            tm5WnNo: 5,
            tm6WnNo: 6,
            bnsWnNo: 7
        }),
        null,
        'decimal official ltEpsd must be rejected'
    );
    assert.equal(
        dm.sanitizeLocalUpdates([
            {
                draw_no: 1212.5,
                date: '2026-02-21',
                numbers: [1, 2, 3, 4, 5, 6],
                bonus: 7
            }
        ]).droppedInvalid,
        1,
        'decimal local update draw numbers must be dropped as invalid'
    );
}

function runMalformedDrawDateRejectedRegression() {
    const dm = new DataManager();

    assert.equal(
        dm.normalizeDrawItem({
            draw_no: 1210,
            date: '<img src=x onerror=alert(1)>',
            numbers: [1, 2, 3, 4, 5, 6],
            bonus: 7
        }),
        null,
        'draw date must reject non-YYYY-MM-DD text'
    );
    assert.equal(
        dm.normalizeDrawItem({
            draw_no: 1210,
            date: '2026-02-31',
            numbers: [1, 2, 3, 4, 5, 6],
            bonus: 7
        }),
        null,
        'draw date must reject impossible calendar dates'
    );
    assert.deepEqual(
        dm.normalizeDrawItem({
            ltEpsd: 1210,
            ltRflYmd: '20260425',
            tm1WnNo: 1,
            tm2WnNo: 2,
            tm3WnNo: 3,
            tm4WnNo: 4,
            tm5WnNo: 5,
            tm6WnNo: 6,
            bnsWnNo: 7
        })?.date,
        '2026-04-25',
        'official 8-digit dates must normalize to YYYY-MM-DD'
    );
}

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

function runBuiltInSyncProviderRegression() {
    const dm = new DataManager();
    const urls = dm.buildBuiltInSingleFetchUrls(1215);

    assert.equal(urls[0]?.label, '공식 API', 'built-in sync must try the official API first');
    assert.match(
        urls[0]?.url || '',
        /https:\/\/www\.dhlottery\.co\.kr\/lt645\/selectPstLt645Info\.do\?srchLtEpsd=1215/,
        'official API candidate must target the requested draw number directly'
    );
    assert.ok(
        urls.some((item) => item.label === 'corsproxy.io'),
        'built-in sync must keep corsproxy.io as a fallback provider'
    );
    assert.ok(
        urls.some((item) => item.label === 'CodeTabs'),
        'built-in sync may still keep CodeTabs as a last fallback provider'
    );

    assert.equal(dm.isAbortError(dm.createAbortError()), true, 'explicit sync abort errors must still be recognized');
    assert.equal(
        dm.isAbortError({ name: 'TypeError', message: 'net::ERR_ABORTED' }),
        false,
        'generic provider failures must not be misclassified as user aborts'
    );
}

async function runSyncGuardRegression() {
    const previousDocument = globalThis.document;
    globalThis.document = { querySelector: () => null };

    try {
        const dm = new DataManager();
        let callCount = 0;

        dm._fetchLatestFromAPIInternal = async () => {
            callCount++;
            await new Promise((resolve) => setTimeout(resolve, 40));
            return true;
        };

        const p1 = dm.fetchLatestFromAPI({ trigger: 'manual', silent: false });
        const p2 = dm.fetchLatestFromAPI({ trigger: 'manual', silent: false });
        await Promise.all([p1, p2]);
        assert.equal(callCount, 1, 'sync internal runner must execute only once while in-flight');

        dm.syncAbortController = new AbortController();
        dm.syncCancelable = true;
        assert.equal(dm.cancelActiveSync(), true, 'manual sync cancel must return true when abortable');
        assert.equal(dm.syncAbortController.signal.aborted, true, 'manual sync cancel must abort signal');

        dm.syncCancelable = false;
        assert.equal(dm.cancelActiveSync(), false, 'cancel must return false when not cancelable');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runProxyChangeAbortRegression() {
    const previousDocument = globalThis.document;
    globalThis.document = { querySelector: () => null };

    try {
        const dm = new DataManager();
        const calls = [];
        let currentProxyUrl = 'https://proxy-a.example/proxy/latest';

        dm.resolveProxyConfig = () => ({
            url: currentProxyUrl,
            source: currentProxyUrl
        });
        dm._fetchLatestFromAPIInternal = async (_options, signal, runId) => {
            const localUrl = currentProxyUrl;
            calls.push(`start:${runId}:${localUrl}`);

            return await new Promise((resolve, reject) => {
                const onAbort = () => {
                    calls.push(`abort:${runId}:${localUrl}`);
                    reject(dm.createAbortError('Sync aborted'));
                };

                if (signal?.aborted) {
                    onAbort();
                    return;
                }

                signal?.addEventListener('abort', onAbort, { once: true });
                setTimeout(
                    () => {
                        signal?.removeEventListener('abort', onAbort);
                        if (signal?.aborted || !dm.isActiveSyncRun(runId)) {
                            reject(dm.createAbortError('Sync aborted'));
                            return;
                        }
                        calls.push(`resolve:${runId}:${localUrl}`);
                        resolve(true);
                    },
                    localUrl.includes('proxy-a') ? 40 : 5
                );
            });
        };

        const first = dm.fetchLatestFromAPI({ trigger: 'auto', silent: true });
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentProxyUrl = 'https://proxy-b.example/proxy/latest';
        const second = dm.fetchLatestFromAPI({
            trigger: 'proxy-change',
            silent: true
        });

        const [firstResult, secondResult] = await Promise.all([first, second]);
        assert.equal(firstResult, false, 'aborted stale sync must resolve to false');
        assert.equal(secondResult, true, 'replacement sync must complete successfully');
        assert.ok(
            calls.some((entry) => entry.includes('abort:1:https://proxy-a.example/proxy/latest')),
            'proxy-change must abort the previous in-flight sync'
        );
        assert.ok(
            calls.some((entry) => entry.includes('resolve:2:https://proxy-b.example/proxy/latest')),
            'proxy-change must allow the replacement sync to apply'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runProxyInputChangeAbortRegression() {
    const previousDocument = globalThis.document;
    const customProxyUrl = createField({
        value: '',
        addEventListener(type, handler) {
            if (type === 'change') this._changeHandler = handler;
        }
    });

    globalThis.document = createDocumentStub({
        '#customProxyUrl': customProxyUrl
    });

    try {
        const calls = [];
        const ctx = {
            data: {
                state: {
                    customProxy: 'https://proxy-a.example/proxy/latest'
                },
                abortSyncInFlight(options) {
                    calls.push(`abort:${Boolean(options?.force)}`);
                    return true;
                },
                markDirty(key) {
                    calls.push(`dirty:${key}`);
                },
                save() {
                    calls.push('save');
                },
                resolveProxyConfig() {
                    return {
                        url: '',
                        invalid: false
                    };
                }
            },
            renderSettingsPanel() {
                calls.push('renderSettingsPanel');
            },
            queueAutoSync(reason, options) {
                calls.push(`queue:${reason}:${Boolean(options?.force)}`);
            }
        };

        LottoApp.prototype.bindDataEvents.call(ctx);
        customProxyUrl._changeHandler?.({ target: customProxyUrl });

        assert.deepEqual(
            calls,
            ['abort:true', 'dirty:settings', 'save', 'renderSettingsPanel', 'queue:proxy-change:true'],
            'proxy input changes must abort any in-flight sync and queue a replacement check even when cleared'
        );
    } finally {
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

async function runAutoSyncFallbackRegression() {
    const previousDocument = globalThis.document;
    const dm = new DataManager();
    const est = estimateLatestDrawKST();
    dm.save = () => {};
    dm.state.winningStats = [
        {
            draw_no: Math.max(1, est - 2),
            date: '2026-03-07',
            numbers: [1, 2, 3, 4, 5, 6],
            bonus: 7
        }
    ];
    dm.state.staticLatestDrawNo = dm.state.winningStats[0].draw_no;

    let rangeCalls = 0;
    let fallbackCalls = 0;
    dm.fetchRangeChunkedFromProxy = async () => {
        rangeCalls++;
        return { items: [], missing: [], failedDraws: [] };
    };
    dm.fetchMissingDraws = async () => {
        fallbackCalls++;
        return [];
    };

    globalThis.document = {
        querySelector(selector) {
            if (selector === '#customProxyUrl') return { value: '' };
            return null;
        }
    };

    try {
        const result = await dm._fetchLatestFromAPIInternal({ trigger: 'manual', silent: true }, null);
        assert.equal(result, false, 'manual sync must fail explicitly when automatic fallback sources return no data');
        assert.equal(rangeCalls, 1, 'range sync path must still run without configured custom proxy');
        assert.equal(fallbackCalls, 1, 'fallback single-draw sync must run without configured custom proxy');
        assert.equal(
            dm.state.syncMeta.mode,
            'automatic_fallback',
            'sync meta mode must reflect automatic fallback mode'
        );
        assert.equal(
            dm.state.syncMeta.currentSource,
            '기본 자동 동기화',
            'sync meta source must reflect automatic fallback source'
        );
        assert.match(
            dm.state.syncMeta.lastFailureMessage,
            /최신 회차/,
            'sync meta must explain automatic sync failure reason'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runOfflineProbeRecoveryRegression() {
    const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const previousFetch = globalThis.fetch;
    const previousWindow = globalThis.window;

    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { onLine: false }
    });
    globalThis.window = {
        location: {
            href: 'https://twbeatles.github.io/lotto---webapp/index.html'
        }
    };

    const fetchCalls = [];
    globalThis.fetch = async (url) => {
        fetchCalls.push(String(url));
        return {
            ok: true,
            headers: {
                get() {
                    return '';
                }
            }
        };
    };

    try {
        const app = new LottoApp();
        app.data.state.customProxy = 'https://proxy.example/proxy/latest';

        const offline = await app.isProbablyOffline({ forceProbe: true });
        assert.equal(offline, false, 'successful reachability probe must override false navigator.onLine state');
        assert.ok(fetchCalls.length >= 1, 'offline probe must issue a network reachability request');
        assert.match(
            fetchCalls[0],
            /online-check\.txt\?__online_check=/,
            'offline probe must prefer the uncached same-origin probe URL first'
        );
    } finally {
        if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
        else delete globalThis.navigator;
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        globalThis.fetch = previousFetch;
    }
}

async function runBackgroundAutoSyncRegression() {
    const app = new LottoApp();
    const calls = [];

    app.data.fetchLatestFromAPI = async (options) => {
        calls.push(options);
        return true;
    };
    app.isProbablyOffline = async () => false;

    await app.runAutoSync({ reason: 'proxy-bootstrap', force: true });
    assert.deepEqual(
        calls,
        [{ silent: true, trigger: 'auto', reason: 'proxy-bootstrap' }],
        'auto sync runner must dispatch a silent auto-triggered sync'
    );

    app._lastAutoSyncAt = Date.now();
    await app.runAutoSync({ reason: 'resume' });
    assert.equal(calls.length, 1, 'background auto sync must throttle repeated resume checks');

    app.isProbablyOffline = async () => true;
    await app.runAutoSync({ reason: 'online', force: true });
    assert.equal(calls.length, 1, 'background auto sync must skip dispatch while offline');
}

function runProxyPolicyRegression() {
    const dm = new DataManager();

    const supported = dm.validateCustomProxyUrl('https://worker.example/proxy/latest?foo=1');
    assert.equal(supported.valid, true, 'official /proxy/latest proxy must be supported');
    assert.equal(
        supported.normalizedUrl,
        'https://worker.example/proxy/latest?foo=1',
        'supported proxy must be normalized'
    );

    const prefixStyle = dm.validateCustomProxyUrl('https://worker.example/?url=');
    assert.equal(prefixStyle.valid, false, 'generic ?url= proxy must no longer be supported');

    dm.state.customProxy = 'https://worker.example/{url}';
    const resolved = dm.resolveProxyConfig();
    assert.equal(resolved.invalid, true, 'unsupported stored proxy must be marked invalid');
    assert.equal(resolved.url, '', 'unsupported stored proxy must not be used at runtime');
    assert.equal(
        dm.getSyncMode(resolved),
        'automatic_fallback',
        'unsupported proxy must fall back to automatic sync mode'
    );
    assert.equal(
        dm.getSyncSourceLabel(resolved),
        '기본 자동 동기화',
        'unsupported proxy must report automatic sync source'
    );
}

export {
    runAutoSyncFallbackRegression,
    runBackgroundAutoSyncRegression,
    runBuiltInSyncProviderRegression,
    runExpectedMissingDrawAllowanceRegression,
    runMalformedDrawDateRejectedRegression,
    runOfflineProbeRecoveryRegression,
    runMergedLocalUpdatesGapClassificationRegression,
    runPartialWinningStatsRecoveryRegression,
    runProxyInputChangeAbortRegression,
    runProxyChangeAbortRegression,
    runProxyPolicyRegression,
    runRefreshCurrentRouteStaleRegression,
    runRouteDataGateRegression,
    runStaticDataFreshnessBudgetRegression,
    runSyncGuardRegression,
    runSyncInvalidPayloadRegression,
    runSyncLatestWinRefreshRegression,
    runSyncPayloadDrawIntegerGuardRegression,
    runUnexpectedStaticHoleClassificationRegression,
    runWinningStatsPreserveExistingOnStaticFailureRegression,
    runWinningStatsLoadClassificationRegression
};
