import { isAutoStrategyId } from '../StrategyCatalog.js';
import {
    AUTO_RECOMMEND_TIMEOUT_CAP_MS,
    DEFAULT_TIMEOUT_MS,
    GENERATE_TIMEOUT_CAP_MS,
    RECOMMEND_TIMEOUT_CAP_MS
} from './config.js';
import { getNetworkSlowFactor } from './network.js';

export function resolveTimeoutMs(type, payload) {
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

export function createTimeoutError(timeoutMs, final = false) {
    const code = final ? 'WORKER_TIMEOUT_FINAL' : 'WORKER_TIMEOUT';
    const err = new Error(`[${code}] strategy worker timeout (${timeoutMs}ms)`);
    err.code = code;
    return err;
}