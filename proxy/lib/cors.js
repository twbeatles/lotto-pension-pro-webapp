const DEFAULT_CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

/** Official lottery path prefixes allowed for `?url=` passthrough. */
export const ALLOWED_DHLOTTERY_PATH_PREFIXES = ['/lt645/', '/pt720/'];

export { DEFAULT_CORS };

/**
 * Resolve CORS headers from optional Worker env `CORS_ALLOWED_ORIGINS`
 * (comma-separated origin list). Empty / missing keeps `*` for backward compatibility.
 */
export function resolveCorsHeaders(request, env = {}) {
    const configured = String(env?.CORS_ALLOWED_ORIGINS || env?.ALLOWED_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const base = {
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (!configured.length || configured.includes('*')) {
        return { ...base, 'Access-Control-Allow-Origin': '*' };
    }
    const origin = request?.headers?.get?.('Origin') || '';
    if (origin && configured.includes(origin)) {
        return { ...base, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    }
    if (!origin) {
        return { ...base, 'Access-Control-Allow-Origin': configured[0], Vary: 'Origin' };
    }
    // Disallowed browser origin: omit ACAO so the browser blocks the response body.
    return { ...base, Vary: 'Origin' };
}

export function isAllowedDhlotteryProxyPath(pathname = '') {
    const path = String(pathname || '');
    return ALLOWED_DHLOTTERY_PATH_PREFIXES.some((prefix) => path.startsWith(prefix) || path.includes(prefix));
}
