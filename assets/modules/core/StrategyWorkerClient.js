const DEFAULT_TIMEOUT_MS = 8000;

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
    }

    ensureWorker() {
        if (this.worker) return this.worker;
        if (typeof Worker === 'undefined') {
            throw new Error('Worker API를 지원하지 않는 환경입니다.');
        }

        const url = new URL('../../strategy.worker.js', import.meta.url);
        this.worker = new Worker(url, { type: 'module' });
        this.worker.onmessage = (event) => this.handleMessage(event.data || {});
        this.worker.onerror = (err) => {
            const message = err?.message || '전략 워커 오류가 발생했습니다.';
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
            task.reject(new Error(payload.message || '전략 워커 실행 오류'));
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
    }

    post(type, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
        const worker = this.ensureWorker();
        const requestId = createRequestId(type.toLowerCase());

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error(`전략 워커 타임아웃(${timeoutMs}ms)`));
            }, timeoutMs);

            this.pending.set(requestId, { resolve, reject, timer });
            worker.postMessage({ type, requestId, payload });
        });
    }

    warmup() {
        if (this.warmupPromise) return this.warmupPromise;
        this.warmupPromise = this.post('WARMUP', {}, 3000)
            .catch(() => null)
            .finally(() => {
                this.warmupPromise = null;
            });
        return this.warmupPromise;
    }

    async generate(payload) {
        return this.post('GENERATE', payload, DEFAULT_TIMEOUT_MS);
    }

    async recommend(payload) {
        return this.post('RECOMMEND', payload, DEFAULT_TIMEOUT_MS);
    }
}
