export const REMOTE_DATA_SOURCE = {
    STATIC: 'static',
    OFFICIAL: 'official',
    OFFICIAL_CACHE: 'official_cache',
    CUSTOM_PROXY: 'custom_proxy',
    THIRD_PARTY: 'third_party',
    NONE: 'none'
};

export const LOTTO_LOAD_SOURCE = {
    STATIC: 'static',
    STATIC_LOCAL: 'static_local',
    LOCAL_ONLY: 'local_only',
    NONE: 'none'
};

export const REMOTE_DATA_SOURCE_VALUES = Object.values(REMOTE_DATA_SOURCE);
export const LOTTO_LOAD_SOURCE_VALUES = Object.values(LOTTO_LOAD_SOURCE);

export function isRemoteDataSource(source) {
    return REMOTE_DATA_SOURCE_VALUES.includes(source);
}

export function getRemoteDataSourceLabel(source = REMOTE_DATA_SOURCE.NONE) {
    if (source === REMOTE_DATA_SOURCE.OFFICIAL) return '동행복권 공식';
    if (source === REMOTE_DATA_SOURCE.CUSTOM_PROXY) return '고급 연결 주소';
    if (source === REMOTE_DATA_SOURCE.THIRD_PARTY) return '공개 CORS 중계';
    if (source === REMOTE_DATA_SOURCE.OFFICIAL_CACHE) return '공식 캐시';
    if (source === REMOTE_DATA_SOURCE.STATIC) return '기본 포함 데이터';
    return '없음';
}

export function getLottoLoadSourceLabel(source = LOTTO_LOAD_SOURCE.NONE) {
    if (source === LOTTO_LOAD_SOURCE.STATIC) return '기본 포함 데이터';
    if (source === LOTTO_LOAD_SOURCE.STATIC_LOCAL) return '기본 포함 데이터 + 내 기기 보정';
    if (source === LOTTO_LOAD_SOURCE.LOCAL_ONLY) return '내 기기 보정 데이터만';
    return '데이터 없음';
}

export function resolveRemoteDataSourceFromFetch({ providerLabel = '', proxyConfig = null } = {}) {
    const label = String(providerLabel || '').trim();
    if (label === '공식 API') return REMOTE_DATA_SOURCE.OFFICIAL;
    if (
        label === '고급 연결 주소' ||
        (proxyConfig?.source && label === proxyConfig.source)
    ) {
        return REMOTE_DATA_SOURCE.CUSTOM_PROXY;
    }
    if (label === 'corsproxy.io' || label === 'CodeTabs') {
        return REMOTE_DATA_SOURCE.THIRD_PARTY;
    }
    if (proxyConfig?.url) return REMOTE_DATA_SOURCE.CUSTOM_PROXY;
    if (label) return REMOTE_DATA_SOURCE.THIRD_PARTY;
    return REMOTE_DATA_SOURCE.NONE;
}

export function mergeRemoteDataHealth(raw, allowedSources = REMOTE_DATA_SOURCE_VALUES) {
    const defaults = {
        availability: 'none',
        source: REMOTE_DATA_SOURCE.NONE,
        latestDrawNo: 0,
        message: '',
        updatedAt: ''
    };
    const input = raw && typeof raw === 'object' ? raw : {};
    const availability = ['full', 'partial', 'none'].includes(input.availability)
        ? input.availability
        : defaults.availability;
    const source = allowedSources.includes(input.source) ? input.source : defaults.source;
    return {
        availability,
        source,
        latestDrawNo: Math.max(0, Math.floor(Number(input.latestDrawNo || 0))),
        message: typeof input.message === 'string' ? input.message.slice(0, 240) : defaults.message,
        updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : defaults.updatedAt
    };
}