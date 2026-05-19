import { isAutoStrategyId } from './StrategyCatalog.js';
import { withRuntimeSeed } from './strategy/runtimeEntropy.js';

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRY = 1;
const GENERATE_TIMEOUT_CAP_MS = 32000;
const RECOMMEND_TIMEOUT_CAP_MS = 40000;
const AUTO_RECOMMEND_TIMEOUT_CAP_MS = 60000;
const STRATEGY_WORKER_ASSET_VERSION = 'v21';

function createStatsFingerprint(statsData = []) {
    if (!Array.isArray(statsData) || !statsData.length) return '';
    const first = statsData[0] || {};
    const last = statsData[statsData.length - 1] || {};
    const signature = (row) =>
        [
            Number(row?.draw_no || 0),
            ...(Array.isArray(row?.numbers) ? row.numbers : []).map(Number),
            Number(row?.bonus || 0)
        ].join('.');
    return `${statsData.length}:${signature(first)}:${signature(last)}`;
}

/** 저속 네트워크(2G/slow-2G) 감지 시 타임아웃을 배수로 확장 */
function getNetworkSlowFactor() {
    try {
        const conn = navigator?.connection || navigator?.mozConnection || navigator?.webkitConnection;
        if (!conn) return 1;
        if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return 2.5;
        if (conn.effectiveType === '3g') return 1.5;
    } catch (_e) {
        // navigator.connection 미지원 환경은 무시
    }
    return 1;
}

function createRequestId(prefix = 'strategy') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

export class StrategyWorkerClient {
    constructor() {
        this.worker = null;
        this.pending = new Map();
        this.warmupPromise = null;
        this.workerStatsFingerprint = '';
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
            task.reject(new Error(payload.message || 'Strategy worker request failed.'));
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

    resolveTimeoutMs(type, payload) {
        const slowFactor = getNetworkSlowFactor();
        if (type === 'GENERATE') {
            const count = Math.max(1, Number(payload?.count || 1));
            const base = Math.min(DEFAULT_TIMEOUT_MS + count * 120, GENERATE_TIMEOUT_CAP_MS);
            return Math.min(Math.ceil(base * slowFactor), GENERATE_TIMEOUT_CAP_MS);
        }
        if (type === 'RECOMMEND') {
            const simulationCount = Math.max(1000, Number(payload?.request?.params?.simulationCount || 5000));
            const base = DEFAULT_TIMEOUT_MS + Math.ceil(simulationCount / 1000) * 1200;
            if (isAutoStrategyId(payload?.request?.strategyId)) {
                const autoBase = Math.min(Math.ceil(base * 2.5), AUTO_RECOMMEND_TIMEOUT_CAP_MS);
                return Math.min(Math.ceil(autoBase * slowFactor), AUTO_RECOMMEND_TIMEOUT_CAP_MS);
            }
            return Math.min(Math.ceil(Math.min(base, RECOMMEND_TIMEOUT_CAP_MS) * slowFactor), RECOMMEND_TIMEOUT_CAP_MS);
        }
        return Math.min(Math.ceil(DEFAULT_TIMEOUT_MS * slowFactor), RECOMMEND_TIMEOUT_CAP_MS);
    }

    createTimeoutError(timeoutMs, final = false) {
        const code = final ? 'WORKER_TIMEOUT_FINAL' : 'WORKER_TIMEOUT';
        const err = new Error(`[${code}] strategy worker timeout (${timeoutMs}ms)`);
        err.code = code;
        return err;
    }

    preparePayloadForWorker(type, payload) {
        if (!['GENERATE', 'RECOMMEND'].includes(type) || !Array.isArray(payload?.statsData)) {
            return payload;
        }

        const statsKey = createStatsFingerprint(payload.statsData);
        if (!statsKey) return payload;

        if (this.workerStatsFingerprint === statsKey) {
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

    postOnce(type, payload, timeoutMs) {
        const worker = this.ensureWorker();
        const requestId = createRequestId(type.toLowerCase());
        const workerPayload = this.preparePayloadForWorker(type, payload);

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(this.createTimeoutError(timeoutMs, false));
            }, timeoutMs);

            this.pending.set(requestId, { resolve, reject, timer });
            worker.postMessage({ type, requestId, payload: workerPayload });
        });
    }

    async post(type, payload, timeoutMs = null, retries = MAX_RETRY) {
        const resolvedTimeoutMs = timeoutMs ?? this.resolveTimeoutMs(type, payload);
        let attempt = 0;

        while (attempt <= retries) {
            try {
                return await this.postOnce(type, payload, resolvedTimeoutMs);
            } catch (err) {
                const isTimeout = err?.code === 'WORKER_TIMEOUT';
                if (isTimeout && attempt < retries) {
                    console.warn(`[WORKER_TIMEOUT_RETRY] ${type} attempt=${attempt + 1}/${retries + 1}`);
                    this.resetWorker();
                    attempt++;
                    continue;
                }
                if (isTimeout) {
                    this.resetWorker();
                    throw this.createTimeoutError(resolvedTimeoutMs, true);
                }
                throw err;
            }
        }

        throw this.createTimeoutError(resolvedTimeoutMs, true);
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
