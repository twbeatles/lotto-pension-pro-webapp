const OFFICIAL_DRAW_API_URL = 'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=';

const BUILTIN_SYNC_SINGLE_PROVIDERS = [
    {
        label: '공식 API',
        buildUrl(targetUrl) {
            return targetUrl;
        }
    },
    {
        label: 'corsproxy.io',
        buildUrl(targetUrl) {
            return `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        }
    },
    {
        label: 'CodeTabs',
        buildUrl(targetUrl) {
            return `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(targetUrl)}`;
        }
    }
];

export const dataSyncProviderMethods = {
    buildCustomSingleFetchUrls(drawNo, proxyConfig = this.resolveProxyConfig()) {
        const targetUrl = `${OFFICIAL_DRAW_API_URL}${drawNo}`;
        const customProxy = proxyConfig?.url || '';
        if (!customProxy) return [];

        const urls = [];
        const label = proxyConfig?.source || '사용자 프록시';

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
        return BUILTIN_SYNC_SINGLE_PROVIDERS.map((provider) => ({
            label: provider.label,
            url: provider.buildUrl(targetUrl)
        }));
    }
};
