import { measureAsync } from '../../../utils/perf.js';

export const dataSyncHttpMethods = {
    async fetchWithTimeout(url, options = {}, timeoutMs = this.SYNC_FETCH_TIMEOUT_MS, externalSignal = null) {
        return measureAsync(
            'sync.fetch',
            async () => {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
                let onExternalAbort = null;

                try {
                    if (controller && externalSignal) {
                        if (externalSignal.aborted) throw this.createAbortError('Sync aborted');
                        onExternalAbort = () => controller.abort();
                        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
                    }
                    const nextOptions = controller ? { ...options, signal: controller.signal } : options;
                    return await fetch(url, nextOptions);
                } finally {
                    if (timer) clearTimeout(timer);
                    if (externalSignal && onExternalAbort) {
                        externalSignal.removeEventListener('abort', onExternalAbort);
                    }
                }
            },
            {
                timeoutMs,
                url: String(url).slice(0, 120)
            }
        );
    }
};
