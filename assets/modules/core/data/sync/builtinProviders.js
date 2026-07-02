export const BUILTIN_CORS_PROVIDERS = [
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

export function buildBuiltinCorsFetchUrls(targetUrl) {
    const url = String(targetUrl || '').trim();
    if (!url) return [];
    return BUILTIN_CORS_PROVIDERS.map((provider) => ({
        label: provider.label,
        url: provider.buildUrl(url)
    }));
}