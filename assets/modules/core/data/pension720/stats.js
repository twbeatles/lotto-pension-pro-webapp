import { CONFIG } from '../../../utils/config.js';
import { normalizePension720Draw } from './normalize.js';

const PENSION720_OFFICIAL_LIST_URL = 'https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do';

function extractOfficialList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data?.result)) return payload.data.result;
    if (Array.isArray(payload?.result)) return payload.result;
    return [];
}

export const dataPension720StatsMethods = {
    normalizePension720DrawItem(raw) {
        return normalizePension720Draw(raw);
    },

    normalizePension720Stats(items = []) {
        const map = new Map();
        (Array.isArray(items) ? items : []).forEach((item) => {
            const normalized = this.normalizePension720DrawItem(item);
            if (!normalized) return;
            map.set(normalized.draw_no, normalized);
        });
        return Array.from(map.values()).sort((a, b) => b.draw_no - a.draw_no);
    },

    readPension720StatsCache() {
        if (typeof localStorage === 'undefined') return [];
        try {
            const raw = this.safeJsonParse(
                localStorage.getItem(CONFIG.KEYS.PENSION720_STATS_CACHE) || '{}',
                {},
                CONFIG.KEYS.PENSION720_STATS_CACHE
            );
            if (Number(raw?.version || 0) !== 1) return [];
            return this.normalizePension720Stats(raw.items || []);
        } catch (_e) {
            return [];
        }
    },

    writePension720StatsCache(items = []) {
        if (typeof localStorage === 'undefined') return false;
        const normalized = this.normalizePension720Stats(items);
        if (!normalized.length) return false;
        return this._safeSetItem(
            CONFIG.KEYS.PENSION720_STATS_CACHE,
            JSON.stringify({
                version: 1,
                updatedAt: new Date().toISOString(),
                items: normalized
            })
        );
    },

    clearPension720StatsCache() {
        if (typeof localStorage === 'undefined') return false;
        try {
            const hadCache = Boolean(localStorage.getItem(CONFIG.KEYS.PENSION720_STATS_CACHE));
            localStorage.removeItem(CONFIG.KEYS.PENSION720_STATS_CACHE);
            return hadCache;
        } catch (_e) {
            return false;
        }
    },

    async fetchPension720Stats(options = {}) {
        const useRemote = options.remote !== false;
        const preserveExisting = options.preserveExistingOnFailure !== false;
        const previous = Array.isArray(this.state.pension720Stats) ? this.state.pension720Stats : [];
        let bestItems = [];
        let source = 'none';
        let errorMessage = '';

        try {
            const res = await this.fetchWithTimeout('data/pension720_stats.json', { cache: 'default' }, 5000);
            if (!res.ok) throw new Error(`static HTTP ${res.status}`);
            bestItems = this.normalizePension720Stats(await res.json());
            if (bestItems.length) source = 'static';
        } catch (error) {
            errorMessage = String(error?.message || '');
            console.warn('연금복권 정적 데이터 조회 실패', error);
        }

        const cachedItems = this.readPension720StatsCache();
        if (cachedItems.length && (!bestItems.length || cachedItems[0].draw_no > bestItems[0].draw_no)) {
            bestItems = cachedItems;
            source = 'official_cache';
        }

        if (useRemote) {
            try {
                const res = await this.fetchWithTimeout(
                    PENSION720_OFFICIAL_LIST_URL,
                    {
                        cache: 'no-cache',
                        headers: {
                            Accept: 'application/json'
                        }
                    },
                    7000
                );
                if (!res.ok) throw new Error(`official HTTP ${res.status}`);
                const remoteItems = this.normalizePension720Stats(extractOfficialList(await res.json()));
                if (remoteItems.length && (!bestItems.length || remoteItems[0].draw_no >= bestItems[0].draw_no)) {
                    bestItems = remoteItems;
                    source = 'official';
                }
                if (remoteItems.length && (!cachedItems.length || remoteItems[0].draw_no >= cachedItems[0].draw_no)) {
                    this.writePension720StatsCache(remoteItems);
                }
            } catch (error) {
                errorMessage = String(error?.message || errorMessage || '');
                console.warn('연금복권 공식 데이터 조회 실패', error);
            }
        }

        if (!bestItems.length && preserveExisting && previous.length) {
            bestItems = previous;
            source = this.pension720DataHealth?.source || 'static';
            errorMessage = errorMessage || '새로고침 실패로 이전 데이터를 유지합니다.';
        }

        this.state.pension720Stats = bestItems;
        this.setPension720DataHealth({
            availability: bestItems.length ? 'full' : 'none',
            source: bestItems.length ? source : 'none',
            latestDrawNo: bestItems[0]?.draw_no || 0,
            message: bestItems.length
                ? source === 'official'
                    ? '동행복권 공식 연금복권 데이터를 사용 중입니다.'
                    : source === 'official_cache'
                      ? '동행복권 공식 연금복권 캐시 데이터를 사용 중입니다.'
                      : '기본 포함 연금복권 데이터를 사용 중입니다.'
                : errorMessage || '연금복권 데이터를 구성하지 못했습니다.',
            updatedAt: new Date().toISOString()
        });

        return bestItems.length > 0;
    }
};

export { extractOfficialList, PENSION720_OFFICIAL_LIST_URL };
