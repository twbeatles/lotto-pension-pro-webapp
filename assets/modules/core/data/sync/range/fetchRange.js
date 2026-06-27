export const dataSyncRangeFetchMethods = {
    async fetchRangeFromProxy(fromNo, toNo, proxyConfig, log, signal = null) {
        if (!proxyConfig?.url || fromNo > toNo) {
            return { items: [], missing: [], failed: true };
        }

        try {
            let baseUrl = '';
            const customProxy = proxyConfig.url;
            const proxyIndex = customProxy.indexOf('/proxy/');
            if (proxyIndex >= 0) {
                baseUrl = customProxy.slice(0, proxyIndex);
            } else {
                const u = new URL(customProxy);
                baseUrl = `${u.origin}`;
            }
            if (!baseUrl) return { items: [], missing: [], failed: true };

            const url = `${baseUrl}/proxy/range?from=${fromNo}&to=${toNo}`;
            const res = await this.fetchWithTimeout(url, {}, this.SYNC_FETCH_TIMEOUT_MS, signal);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const ct = res.headers.get('Content-Type') || '';
            if (!ct.includes('application/json') && !ct.includes('text/plain') && !ct.includes('text/json')) {
                throw new Error(`예상치 못한 응답 형식 (Content-Type: ${ct || '없음'})`);
            }

            const payload = await res.json();
            const list = Array.isArray(payload?.data) ? payload.data : [];
            const normalized = list.map((item) => this.normalizeDrawItem(item)).filter(Boolean);
            const missing = Array.isArray(payload?.missing)
                ? payload.missing.map((x) => Number(x)).filter(Number.isFinite)
                : [];
            if (normalized.length) {
                log(`[range] 수집 성공: ${fromNo}~${toNo} (${normalized.length}개)`);
            }
            return { items: normalized, missing, failed: false };
        } catch (e) {
            if (this.isAbortError(e)) throw e;
            this.logSync('SYNC_RANGE_FAIL', `Range fetch failed ${fromNo}-${toNo}`, { message: e.message });
            log(`[range] 수집 실패 (${fromNo}~${toNo}): ${e.message}`);
            return { items: [], missing: [], failed: true };
        }
    }
};