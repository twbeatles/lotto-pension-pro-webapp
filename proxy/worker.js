const DEFAULT_OFFICIAL_API_URL = 'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=';
const MAX_RANGE = 40;
const RANGE_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 4000;
const FETCH_RETRY_COUNT = 1;
const TTL_NEAR_LATEST_SECONDS = 60;
const TTL_HISTORICAL_SECONDS = 6 * 60 * 60;
const TTL_HISTORICAL_RANGE_SECONDS = 12 * 60 * 60;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toJsonResponse = (body, init = {}) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(payload, {
        ...init,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            ...CORS,
            ...(init.headers || {})
        }
    });
};

const withCacheMeta = (response, ttlSeconds, cacheState) => {
    const headers = new Headers(response.headers);
    Object.entries(CORS).forEach(([key, value]) => headers.set(key, value));
    if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
        headers.set('Cache-Control', `public, max-age=${ttlSeconds}`);
    }
    if (cacheState) headers.set('X-Lotto-Cache', cacheState);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
};

const cacheKeyFromRequest = (request) => new Request(request.url, { method: 'GET' });

async function respondWithEdgeCache(request, ttlSeconds, producer) {
    const cache = caches.default;
    const cacheKey = cacheKeyFromRequest(request);
    const cached = await cache.match(cacheKey);
    if (cached) return withCacheMeta(cached, ttlSeconds, 'HIT');

    const fresh = await producer();
    if (!fresh.ok) return withCacheMeta(fresh, 0, 'BYPASS');

    const cacheReady = withCacheMeta(fresh.clone(), ttlSeconds, 'MISS');
    await cache.put(cacheKey, cacheReady.clone());
    return withCacheMeta(fresh, ttlSeconds, 'MISS');
}

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

const fetchOfficialRaw = async (drawNo) => {
    const url = `${DEFAULT_OFFICIAL_API_URL}${drawNo}`;
    try {
        const res = await fetchWithRetry(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Referer: 'https://www.dhlottery.co.kr/lt645/lotto645_more.do',
                Accept: 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        const text = await res.text();
        return { ok: res.ok, text };
    } catch (err) {
        return { ok: false, text: '' };
    }
};

const normalizeOfficialData = (raw) => {
    const drawNo = Number(raw?.ltEpsd);
    if (!Number.isInteger(drawNo) || drawNo < 1) return null;

    const dateRaw = String(raw?.ltRflYmd || '');
    const date =
        dateRaw.length === 8 ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}` : dateRaw;

    const numbers = [raw.tm1WnNo, raw.tm2WnNo, raw.tm3WnNo, raw.tm4WnNo, raw.tm5WnNo, raw.tm6WnNo].map(Number);

    if (numbers.some((n) => Number.isNaN(n))) return null;

    return {
        draw_no: drawNo,
        date,
        numbers,
        bonus: Number(raw.bnsWnNo || 0),
        prize_amount: Number(raw.rnk1WnAmt || 0),
        winners_count: Number(raw.rnk1WnNope || 0),
        total_sales: Number(raw.rlvtEpsdSumNtslAmt || 0)
    };
};

const toLegacyDataRow = (row) => {
    const date = String(row?.date || '').replaceAll('-', '');
    const nums = Array.isArray(row?.numbers) ? row.numbers : [];
    return {
        ltEpsd: Number(row?.draw_no || 0),
        ltRflYmd: date,
        tm1WnNo: Number(nums[0] || 0),
        tm2WnNo: Number(nums[1] || 0),
        tm3WnNo: Number(nums[2] || 0),
        tm4WnNo: Number(nums[3] || 0),
        tm5WnNo: Number(nums[4] || 0),
        tm6WnNo: Number(nums[5] || 0),
        bnsWnNo: Number(row?.bonus || 0),
        rnk1WnAmt: Number(row?.prize_amount || 0),
        rnk1WnNope: Number(row?.winners_count || 0),
        rlvtEpsdSumNtslAmt: Number(row?.total_sales || 0)
    };
};

const getOneDraw = async (drawNo) => {
    const { ok, text } = await fetchOfficialRaw(drawNo);
    if (!ok) return null;
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return null;
    }
    const list = parsed?.data?.list;
    if (!Array.isArray(list) || list.length === 0) return null;
    return normalizeOfficialData(list[0]);
};

async function getRange(from, to) {
    const drawNos = [];
    for (let drawNo = from; drawNo <= to; drawNo++) drawNos.push(drawNo);

    const rows = new Array(drawNos.length).fill(null);
    let cursor = 0;
    const worker = async () => {
        while (true) {
            const index = cursor++;
            if (index >= drawNos.length) return;
            rows[index] = await getOneDraw(drawNos[index]);
        }
    };

    const workers = Array.from({ length: Math.max(1, Math.min(RANGE_CONCURRENCY, drawNos.length)) }, () => worker());
    await Promise.all(workers);

    const data = [];
    const missing = [];
    rows.forEach((row, idx) => {
        if (row) data.push(row);
        else missing.push(drawNos[idx]);
    });

    return { from, to, count: data.length, missing, data };
}

const getKstParts = () => {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = dtf.formatToParts(new Date());
    const pick = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    return {
        y: pick('year'),
        m: pick('month'),
        d: pick('day'),
        hh: pick('hour'),
        mm: pick('minute'),
        ss: pick('second')
    };
};

const estimateLatestDrawKST = () => {
    const BASE_DRAW_NO = 1;
    const BASE_DATE_UTC = Date.UTC(2002, 11, 7, 0, 0, 0);
    const INTERVAL_DAYS = 7;
    const CUTOFF_HOUR = 21;

    const p = getKstParts();
    const nowKstUtc = new Date(Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss));
    const daysDiff = Math.floor((nowKstUtc.getTime() - BASE_DATE_UTC) / 86400000);
    let estimated = Math.floor(daysDiff / INTERVAL_DAYS) + BASE_DRAW_NO;
    estimated = Math.max(BASE_DRAW_NO, estimated);

    const cutoffUtc = new Date(
        BASE_DATE_UTC + (estimated - BASE_DRAW_NO) * INTERVAL_DAYS * 86400000 + CUTOFF_HOUR * 3600000
    );
    if (nowKstUtc.getTime() < cutoffUtc.getTime()) estimated -= 1;

    return Math.max(BASE_DRAW_NO, estimated);
};

const isNearLatestDraw = (drawNo) => {
    const latestEstimate = estimateLatestDrawKST();
    return Number(drawNo) >= Math.max(latestEstimate - 1, 1);
};

const resolveLatestTtl = (drawNo) => (isNearLatestDraw(drawNo) ? TTL_NEAR_LATEST_SECONDS : TTL_HISTORICAL_SECONDS);
const resolveRangeTtl = (to) => (isNearLatestDraw(to) ? TTL_NEAR_LATEST_SECONDS : TTL_HISTORICAL_RANGE_SECONDS);

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return toJsonResponse('{}', { headers: { ...CORS, 'X-Lotto-Cache': 'BYPASS' } });
        }

        // Support ?url= parameter (AllOrigins-style passthrough)
        const targetUrlStr = url.searchParams.get('url');
        if (targetUrlStr) {
            try {
                const targetUrl = new URL(targetUrlStr);
                if (targetUrl.hostname !== 'www.dhlottery.co.kr') {
                    return toJsonResponse(
                        { error: 'Forbidden domain' },
                        {
                            status: 403,
                            headers: { 'X-Lotto-Cache': 'BYPASS' }
                        }
                    );
                }

                const res = await fetchWithRetry(targetUrl.toString(), {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        Referer: 'https://www.dhlottery.co.kr/',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                const text = await res.text();
                return toJsonResponse(text, { headers: { 'X-Lotto-Cache': 'BYPASS' } });
            } catch (e) {
                return toJsonResponse(
                    { error: 'Invalid URL' },
                    {
                        status: 400,
                        headers: { 'X-Lotto-Cache': 'BYPASS' }
                    }
                );
            }
        }

        if (url.pathname === '/proxy/latest') {
            const drawNoParam = url.searchParams.get('draw_no');
            const drawNo = drawNoParam ? Number(drawNoParam) : estimateLatestDrawKST();
            if (!Number.isInteger(drawNo) || drawNo < 1) {
                return toJsonResponse(
                    { error: 'invalid draw_no' },
                    {
                        status: 400,
                        headers: { 'X-Lotto-Cache': 'BYPASS' }
                    }
                );
            }
            const format = String(url.searchParams.get('format') || 'hybrid').toLowerCase();
            const ttlSeconds = resolveLatestTtl(drawNo);

            return respondWithEdgeCache(request, ttlSeconds, async () => {
                const row = await getOneDraw(drawNo);
                if (!row) return toJsonResponse({ error: 'upstream error' }, { status: 502 });
                const legacy = { data: { list: [toLegacyDataRow(row)] } };

                if (format === 'legacy') return toJsonResponse(legacy);
                if (format === 'normalized') return toJsonResponse({ data: [row] });
                return toJsonResponse({
                    ...legacy,
                    normalized: [row],
                    meta: { format: 'hybrid' }
                });
            });
        }

        if (url.pathname === '/proxy/range') {
            const from = Number(url.searchParams.get('from') || 0);
            const to = Number(url.searchParams.get('to') || 0);
            const format = String(url.searchParams.get('format') || 'normalized').toLowerCase();
            if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1 || from > to) {
                return toJsonResponse(
                    { error: 'invalid range' },
                    {
                        status: 400,
                        headers: { 'X-Lotto-Cache': 'BYPASS' }
                    }
                );
            }
            if (to - from > MAX_RANGE) {
                return toJsonResponse(
                    { error: 'range too large', maxRange: MAX_RANGE },
                    {
                        status: 400,
                        headers: { 'X-Lotto-Cache': 'BYPASS' }
                    }
                );
            }

            const ttlSeconds = resolveRangeTtl(to);
            return respondWithEdgeCache(request, ttlSeconds, async () => {
                const payload = await getRange(from, to);
                if (format === 'legacy') {
                    return toJsonResponse({
                        from: payload.from,
                        to: payload.to,
                        count: payload.count,
                        missing: payload.missing,
                        data: { list: payload.data.map(toLegacyDataRow) }
                    });
                }
                if (format === 'hybrid') {
                    return toJsonResponse({
                        ...payload,
                        legacy: { data: { list: payload.data.map(toLegacyDataRow) } }
                    });
                }
                return toJsonResponse(payload);
            });
        }

        return toJsonResponse(
            { error: 'Not Found' },
            {
                status: 404,
                headers: { 'X-Lotto-Cache': 'BYPASS' }
            }
        );
    }
};
