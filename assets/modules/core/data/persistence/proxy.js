import { CONFIG } from '../../../utils/config.js';

export const dataPersistenceProxyMethods = {
    getCustomProxyInput() {
        return (this.state.customProxy || '').trim();
    },

    validateCustomProxyUrl(rawUrl = '') {
        const input = String(rawUrl || '').trim();
        if (!input) {
            return {
                input: '',
                normalizedUrl: '',
                valid: false,
                empty: true,
                reason: ''
            };
        }

        try {
            const parsed = new URL(input);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return {
                    input,
                    normalizedUrl: '',
                    valid: false,
                    empty: false,
                    reason: 'http(s) 주소만 지원합니다.'
                };
            }
            if (!parsed.pathname.includes('/proxy/latest')) {
                return {
                    input,
                    normalizedUrl: '',
                    valid: false,
                    empty: false,
                    reason: '공식 지원 형식은 /proxy/latest 엔드포인트입니다.'
                };
            }
            return {
                input,
                normalizedUrl: parsed.toString(),
                valid: true,
                empty: false,
                reason: ''
            };
        } catch (_e) {
            return {
                input,
                normalizedUrl: '',
                valid: false,
                empty: false,
                reason: '절대 URL 형식으로 입력해주세요.'
            };
        }
    },

    buildProxyConfig(source, rawUrl) {
        const validation = this.validateCustomProxyUrl(rawUrl);
        if (validation.empty) return null;
        return {
            source,
            input: validation.input,
            url: validation.valid ? validation.normalizedUrl : '',
            invalid: !validation.valid,
            invalidReason: validation.reason
        };
    },

    readLegacyProxyUrl() {
        if (typeof localStorage === 'undefined') return '';
        const direct = (localStorage.getItem(CONFIG.KEYS.LEGACY_PROXY) || '').trim();
        if (direct) return direct;

        const legacySettingsRaw = localStorage.getItem(CONFIG.KEYS.LEGACY_SETTINGS);
        if (!legacySettingsRaw) return '';
        try {
            const legacySettings = JSON.parse(legacySettingsRaw);
            return (legacySettings?.proxyLatestUrl || '').trim();
        } catch (_e) {
            return '';
        }
    },

    getQueryProxyUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const proxyUrl = (params.get('proxyUrl') || '').trim();
            if (proxyUrl) return this.buildProxyConfig('URL 쿼리(proxyUrl)', proxyUrl);
            const proxy = (params.get('proxy') || '').trim();
            if (proxy) return this.buildProxyConfig('URL 쿼리(proxy)', proxy);
        } catch (_e) {
            return null;
        }
        return null;
    },

    resolveProxyConfig() {
        const queryProxy = this.getQueryProxyUrl();
        if (queryProxy) return queryProxy;

        const legacyProxy = this.readLegacyProxyUrl();
        if (legacyProxy) return this.buildProxyConfig('legacy settings (v1)', legacyProxy);

        const v2Proxy = (this.state.customProxy || '').trim();
        if (v2Proxy) return this.buildProxyConfig('saved settings (v2)', v2Proxy);

        return {
            source: '미설정',
            input: '',
            url: '',
            invalid: false,
            invalidReason: ''
        };
    }
};
