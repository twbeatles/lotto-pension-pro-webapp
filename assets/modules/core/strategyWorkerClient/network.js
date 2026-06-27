/** 저속 네트워크(2G/slow-2G) 감지 시 타임아웃을 배수로 확장 */
export function getNetworkSlowFactor() {
    try {
        const conn = navigator?.connection || navigator?.mozConnection || navigator?.webkitConnection;
        if (!conn) return 1;
        if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return 2.5;
        if (conn.effectiveType === '3g') return 1.5;
    } catch (_e) {
        // navigator.connection 미지원 환경은 무시
    }
    return 1;
}

export function createRequestId(prefix = 'strategy') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}