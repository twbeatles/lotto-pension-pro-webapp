import { withRuntimeSeed } from '../strategy/runtimeEntropy.js';
import { MAX_RETRY, STRATEGY_WORKER_ASSET_VERSION } from './config.js';
import { createStatsFingerprint } from './fingerprint.js';
import { createRequestId } from './network.js';
import { createTimeoutError, resolveTimeoutMs } from './timeouts.js';

export class StrategyWorkerClient {
    constructor() {
        this.worker = null;
        this.pending = new Map();
        this.warmupPromise = null;
        this.workerStatsFingerprint = '';
        this._dispatchChain = Promise.resolve();
    }

    ensureWorker() {
        if (this.worker) return this.worker;
        if (typeof Worker === 'undefined') {
            throw new Error('Worker API is not available in this environment.');
        }

        const url = new URL('../../strategy.worker.js', import.meta.url);
        url.searchParams.set('v', STRATEGY_WORKER_ASSET_VERSION);
        this.worker = new Worker(url, { type: 'module' });
        this.worker.onmessage = (event) => this.handleMessage(event.data || {});
        this.worker.onerror = (err) => {
            const message = err?.message || 'Strategy worker runtime error.';
            this.rejectAllPending(message);
        };
        return this.worker;
    }

    handleMessage(message) {
        const requestId = message?.requestId || message?.payload?.requestId;
        if (!requestId) return;

        const task = this.pending.get(requestId);
        if (!task) return;

        clearTimeout(task.timer);
        this.pending.delete(requestId);

        if (message.type === 'ERROR') {
            const payload = message.payload || {};
            const err = new Error(payload.message || 'Strategy worker request failed.');
            err.code = payload.code || 'STRATEGY_WORKER_ERROR';
            err.requestId = requestId;
            task.reject(err);
            return;
        }

        task.resolve(message.payload || null);
    }

    rejectAllPending(reason) {
        const pending = [...this.pending.values()];
        this.pending.clear();
        pending.forEach((task) => {
            clearTimeout(task.timer);
            task.reject(new Error(reason));
        });
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.warmupPromise = null;
        this.workerStatsFingerprint = '';
    }

    resetWorker() {
        if (!this.worker) return;
        this.worker.terminate();
        this.worker = null;
        this.workerStatsFingerprint = '';
    }

    preparePayloadForWorker(type, payload, options = {}) {
        if (!['GENERATE', 'RECOMMEND'].includes(type) || !Array.isArray(payload?.statsData)) {
            return payload;
        }

        const statsKey = createStatsFingerprint(payload.statsData);
        if (!statsKey) return payload;

        if (!options.forceStatsData && this.workerStatsFingerprint === statsKey) {
            const rest = { ...payload };
            delete rest.statsData;
            return {
                ...rest,
                statsKey
            };
        }

        this.workerStatsFingerprint = statsKey;
        return {
            ...payload,
            statsKey
        };
    }

    postOnce(type, payload, timeoutMs, options = {}) {
        const worker = this.ensureWorker();
        const requestId = createRequestId(type.toLowerCase());
        const workerPayload = this.preparePayloadForWorker(type, payload, options);

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(createTimeoutError(timeoutMs, false));
            }, timeoutMs);

            this.pending.set(requestId, { resolve, reject, timer });
            try {
                worker.postMessage({ type, requestId, payload: workerPayload });
            } catch (err) {
                clearTimeout(timer);
                this.pending.delete(requestId);
                reject(err);
            }
        });
    }

    async post(type, payload, timeoutMs = null, retries = MAX_RETRY) {
        const run = async () => {
            const resolvedTimeoutMs = timeoutMs ?? resolveTimeoutMs(type, payload);
            let attempt = 0;
            let cacheRetryUsed = false;
            let forceStatsData = false;

            while (attempt <= retries) {
                try {
                    return await this.postOnce(type, payload, resolvedTimeoutMs, { forceStatsData });
                } catch (err) {
                    if (
                        err?.code === 'STRATEGY_WORKER_CACHE_EMPTY' &&
                        !cacheRetryUsed &&
                        Array.isArray(payload?.statsData)
                    ) {
                        console.warn(`[STRATEGY_WORKER_CACHE_EMPTY_RETRY] ${type} retrying with full statsData`);
                        this.workerStatsFingerprint = '';
                        cacheRetryUsed = true;
                        forceStatsData = true;
                        continue;
                    }
                    forceStatsData = false;
                    const isTimeout = err?.code === 'WORKER_TIMEOUT';
                    if (isTimeout && attempt < retries) {
                        console.warn(`[WORKER_TIMEOUT_RETRY] ${type} attempt=${attempt + 1}/${retries + 1}`);
                        this.resetWorker();
                        attempt++;
                        continue;
                    }
                    if (isTimeout) {
                        this.resetWorker();
                        throw createTimeoutError(resolvedTimeoutMs, true);
                    }
                    throw err;
                }
            }

            throw createTimeoutError(resolvedTimeoutMs, true);
        };

        const next = this._dispatchChain.then(run, run);
        this._dispatchChain = next.catch(() => {});
        return next;
    }

    warmup() {
        if (this.warmupPromise) return this.warmupPromise;
        this.warmupPromise = this.post('WARMUP', {}, 3000, 0)
            .catch(() => null)
            .finally(() => {
                this.warmupPromise = null;
            });
        return this.warmupPromise;
    }

    async generate(payload) {
        return this.post('GENERATE', withRuntimeSeed(payload));
    }

    async recommend(payload) {
        return this.post('RECOMMEND', withRuntimeSeed(payload));
    }
}