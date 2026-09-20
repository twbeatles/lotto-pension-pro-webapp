const FETCH_TIMEOUT_MS = 4000;
const FETCH_RETRY_COUNT = 1;

export { FETCH_TIMEOUT_MS, FETCH_RETRY_COUNT };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

async function fetchWithRetry(url, init = {}, retries = FETCH_RETRY_COUNT) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetchWithTimeout(url, init, FETCH_TIMEOUT_MS);
            if (!res.ok && res.status >= 500 && attempt < retries) {
                await sleep(120 * (attempt + 1));
                continue;
            }
            return res;
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                await sleep(120 * (attempt + 1));
                continue;
            }
        }
    }
    throw lastError || new Error('upstream fetch failed');
}

export { fetchWithTimeout, fetchWithRetry };
