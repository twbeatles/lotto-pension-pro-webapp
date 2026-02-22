const marks = new Map();

function readDebugFlag() {
    try {
        return Boolean(globalThis?.window?.__LOTTO_PERF_DEBUG__ === true);
    } catch (e) {
        return false;
    }
}

function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) {
        return performance.now();
    }
    return Date.now();
}

function logPerf(label, durationMs, meta = null) {
    if (!readDebugFlag()) return;
    if (meta && typeof meta === 'object') {
        console.debug(`[Perf] ${label}: ${durationMs.toFixed(2)}ms`, meta);
        return;
    }
    console.debug(`[Perf] ${label}: ${durationMs.toFixed(2)}ms`);
}

export function isPerfDebugEnabled() {
    return readDebugFlag();
}

export function startMark(label) {
    if (!readDebugFlag() || !label) return;
    marks.set(label, nowMs());
}

export function endMark(label, meta = null) {
    if (!readDebugFlag() || !label) return 0;
    const started = marks.get(label);
    if (typeof started !== 'number') return 0;
    marks.delete(label);
    const durationMs = nowMs() - started;
    logPerf(label, durationMs, meta);
    return durationMs;
}

export async function measureAsync(label, task, meta = null) {
    const started = nowMs();
    const result = await task();
    const durationMs = nowMs() - started;
    logPerf(label, durationMs, meta);
    return result;
}

