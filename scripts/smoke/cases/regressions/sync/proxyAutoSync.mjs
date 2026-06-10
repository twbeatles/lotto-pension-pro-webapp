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
            href: 'https://twbeatles.github.io/lotto-pension-pro-webapp/index.html'
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
    runSyncGuardRegression,
    runProxyChangeAbortRegression,
    runProxyInputChangeAbortRegression,
    runAutoSyncFallbackRegression,
    runOfflineProbeRecoveryRegression,
    runBackgroundAutoSyncRegression,
    runProxyPolicyRegression
};
