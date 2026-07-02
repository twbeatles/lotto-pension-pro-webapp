import { buildBuiltinCorsFetchUrls } from './builtinProviders.js';

const OFFICIAL_DRAW_API_URL = 'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=';

export const dataSyncProviderMethods = {
    buildCustomSingleFetchUrls(drawNo, proxyConfig = this.resolveProxyConfig()) {
        const targetUrl = `${OFFICIAL_DRAW_API_URL}${drawNo}`;
        const customProxy = proxyConfig?.url || '';
        if (!customProxy) return [];

        const urls = [];
        const label = proxyConfig?.source || '고급 연결 주소';

        if (customProxy.includes('{draw_no}')) {
            urls.push({ label, url: customProxy.replace('{draw_no}', String(drawNo)) });
        } else if (customProxy.includes('/proxy/latest')) {
            if (customProxy.includes('draw_no=')) {
                urls.push({ label, url: customProxy.replace(/draw_no=\d*/i, `draw_no=${drawNo}`) });
            } else {
                const delim = customProxy.includes('?') ? '&' : '?';
                urls.push({ label, url: `${customProxy}${delim}draw_no=${drawNo}` });
            }
        } else if (customProxy.includes('{url}')) {
            urls.push({ label, url: customProxy.replace('{url}', encodeURIComponent(targetUrl)) });
        } else {
            urls.push({ label, url: `${customProxy}${encodeURIComponent(targetUrl)}` });
        }

        return urls;
    },

    buildBuiltInSingleFetchUrls(drawNo) {
        const targetUrl = `${OFFICIAL_DRAW_API_URL}${drawNo}`;
        return buildBuiltinCorsFetchUrls(targetUrl);
    }
};
