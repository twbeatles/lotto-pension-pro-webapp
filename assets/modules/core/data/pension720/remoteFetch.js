import { buildBuiltinCorsFetchUrls } from '../sync/builtinProviders.js';

const PENSION720_OFFICIAL_LIST_URL = 'https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do';
const PENSION720_PROXY_LIST_PATH = '/proxy/pension720/list';

function extractOfficialList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data?.result)) return payload.data.result;
    if (Array.isArray(payload?.result)) return payload.result;
    return [];
}

export function derivePension720ListProxyUrl(lottoProxyUrl = '') {
    const input = String(lottoProxyUrl || '').trim();
    if (!input) return '';

    try {
        const parsed = new URL(input);
        if (parsed.pathname.includes(PENSION720_PROXY_LIST_PATH)) {
            return parsed.toString();
        }
        if (parsed.pathname.includes('/proxy/latest')) {
            parsed.pathname = parsed.pathname.replace('/proxy/latest', PENSION720_PROXY_LIST_PATH);
            parsed.search = '';
            return parsed.toString();
        }
    } catch (_e) {
        return '';
    }
    return '';
}

export function buildPension720RemoteFetchCandidates(proxyConfig = null) {
    const candidates = [];
    const seen = new Set();
    const push = (label, url) => {
        const nextUrl = String(url || '').trim();
        if (!nextUrl || seen.has(nextUrl)) return;
        seen.add(nextUrl);
        candidates.push({ label, url: nextUrl });
    };

    const customProxy = proxyConfig?.url || '';
    if (customProxy) {
        const derived = derivePension720ListProxyUrl(customProxy);
        if (derived) {
            push(proxyConfig?.source || '고급 연결 주소', derived);
        }
    }

    buildBuiltinCorsFetchUrls(PENSION720_OFFICIAL_LIST_URL).forEach((item) => push(item.label, item.url));

    return candidates;
}

export function parsePension720RemotePayload(rawText = '') {
    let text = String(rawText || '').trim();
    if (!text) return null;

    if (text.startsWith('Title:') && text.includes('Markdown Content:')) {
        text = text.split('Markdown Content:').slice(1).join('Markdown Content:').trim();
    }

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (_e) {
        return null;
    }

    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch (_e) {
            return null;
        }
    }

    if (parsed?.contents && typeof parsed.contents === 'string') {
        try {
            parsed = JSON.parse(parsed.contents);
        } catch (_e) {
            return null;
        }
    } else if (parsed?.contents) {
        parsed = parsed.contents;
    }

    return parsed && typeof parsed === 'object' ? parsed : null;
}

export function extractPension720ListFromPayload(payload) {
    if (Array.isArray(payload?.data) && payload.data[0]?.draw_no) {
        return payload.data;
    }
    return extractOfficialList(payload);
}

export { PENSION720_OFFICIAL_LIST_URL, PENSION720_PROXY_LIST_PATH };