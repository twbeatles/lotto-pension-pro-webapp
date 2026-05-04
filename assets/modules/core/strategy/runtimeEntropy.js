import { xorshift32 } from './shared.js';

export function hasExplicitSeed(request = {}) {
    const seed = request?.params?.seed;
    return seed !== null && seed !== undefined && seed !== '' && Number.isFinite(Number(seed));
}

export function createRuntimeSeed() {
    let seed = 0;

    try {
        if (globalThis.crypto?.getRandomValues) {
            const values = new Uint32Array(2);
            globalThis.crypto.getRandomValues(values);
            seed = (values[0] ^ values[1] ^ Date.now()) >>> 0;
        }
    } catch (_e) {
        seed = 0;
    }

    if (!seed) {
        const now = Date.now() >>> 0;
        const perf =
            typeof globalThis.performance?.now === 'function'
                ? Math.floor(globalThis.performance.now() * 1000) >>> 0
                : 0;
        seed = (Math.floor(Math.random() * 0xffffffff) ^ now ^ perf) >>> 0;
    }

    return seed || 0x9e3779b9;
}

export function withRuntimeSeed(payload = {}) {
    if (!payload || typeof payload !== 'object') return payload;
    if (hasExplicitSeed(payload.request)) return payload;
    if (Number.isFinite(Number(payload.runtimeSeed))) return payload;
    return {
        ...payload,
        runtimeSeed: createRuntimeSeed()
    };
}

export function createRuntimeRng(request = {}, runtimeSeed = null) {
    if (hasExplicitSeed(request)) return null;
    const seed = Number(runtimeSeed);
    if (!Number.isFinite(seed)) return null;
    return xorshift32(Math.floor(seed));
}
