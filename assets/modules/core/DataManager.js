import { CONFIG } from '../utils/config.js';
import { $, sleep, estimateLatestDrawKST } from '../utils/utils.js';
import { UIManager } from './UIManager.js';

export class DataManager {
    constructor() {
        this.app = null; // Will be linked later if needed, or passed in init
        this.state = {
            theme: 'dark',
            favorites: [],
            history: [],
            winningStats: [],
            generated: [],
            customProxy: '', // Explicitly init
            aiResults: [], // Session persistence for AI tab
            analytics: null
        };
    }

    setApp(app) {
        this.app = app;
    }

    getCustomProxyInput() {
        const proxyInput = $('#customProxyUrl');
        return proxyInput ? proxyInput.value.trim() : '';
    }

    persistSettings() {
        localStorage.setItem(CONFIG.KEYS.SETTINGS, JSON.stringify({
            theme: this.state.theme,
            customProxy: this.state.customProxy
        }));
    }

    readLegacyProxyUrl() {
        const direct = (localStorage.getItem(CONFIG.KEYS.LEGACY_PROXY) || '').trim();
        if (direct) return direct;

        const legacySettingsRaw = localStorage.getItem(CONFIG.KEYS.LEGACY_SETTINGS);
        if (!legacySettingsRaw) return '';
        try {
            const legacySettings = JSON.parse(legacySettingsRaw);
            const nested = (legacySettings?.proxyLatestUrl || '').trim();
            return nested;
        } catch (e) {
            return '';
        }
    }

    getQueryProxyUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const proxyUrl = (params.get('proxyUrl') || '').trim();
            if (proxyUrl) return { source: 'query.proxyUrl', url: proxyUrl };
            const proxy = (params.get('proxy') || '').trim();
            if (proxy) return { source: 'query.proxy', url: proxy };
        } catch (e) {
            return null;
        }
        return null;
    }

    resolveProxyConfig() {
        const queryProxy = this.getQueryProxyUrl();
        if (queryProxy) return queryProxy;

        const legacyProxy = this.readLegacyProxyUrl();
        if (legacyProxy) return { source: 'legacy.v1', url: legacyProxy };

        const v2Proxy = (this.state.customProxy || '').trim();
        if (v2Proxy) return { source: 'settings.v2', url: v2Proxy };

        return { source: 'public', url: '' };
    }

    load() {
        try {
            this.state.favorites = JSON.parse(localStorage.getItem(CONFIG.KEYS.FAV) || '[]');
            this.state.history = JSON.parse(localStorage.getItem(CONFIG.KEYS.HIST) || '[]');
            const settings = JSON.parse(localStorage.getItem(CONFIG.KEYS.SETTINGS) || '{}');
            this.state.theme = settings.theme || 'dark';
            this.state.customProxy = settings.customProxy || '';

            // Legacy proxy settings migration (v1 -> v2)
            const legacyProxy = this.readLegacyProxyUrl();
            if (!this.state.customProxy && legacyProxy) {
                this.state.customProxy = legacyProxy;
                this.persistSettings();
            }

            // UI sync if input exists
            const proxyInput = $('#customProxyUrl');
            if (proxyInput) {
                const resolved = this.resolveProxyConfig();
                proxyInput.value = resolved?.url || this.state.customProxy;
            }
        } catch (e) {
            console.error('Data load failed', e);
            UIManager.toast('데이터 로드 실패', 'error');
        }
    }

    save() {
        try {
            localStorage.setItem(CONFIG.KEYS.FAV, JSON.stringify(this.state.favorites));
            localStorage.setItem(CONFIG.KEYS.HIST, JSON.stringify(this.state.history));
            const proxyInput = $('#customProxyUrl');
            if (proxyInput) this.state.customProxy = proxyInput.value.trim();

            this.persistSettings();
        } catch (e) {
            console.error('Data save failed', e);
        }
    }

    buildAnalyticsCache() {
        const source = this.state.winningStats || [];
        if (!source.length) {
            this.state.analytics = {
                id: 'empty',
                freq: Array(46).fill(0),
                rangeCounts: [0, 0, 0, 0, 0],
                oddEven: [0, 0],
                topPairs: [],
                hot: [],
                cold: []
            };
            return this.state.analytics;
        }

        const freq = Array(46).fill(0);
        const rangeCounts = [0, 0, 0, 0, 0];
        const oddEven = [0, 0];
        const pairCounts = new Map();

        source.forEach(d => {
            const nums = d.numbers || [];
            nums.forEach(n => {
                if (n < 1 || n > 45) return;
                freq[n]++;
                if (n <= 10) rangeCounts[0]++;
                else if (n <= 20) rangeCounts[1]++;
                else if (n <= 30) rangeCounts[2]++;
                else if (n <= 40) rangeCounts[3]++;
                else rangeCounts[4]++;
                if (n % 2 === 0) oddEven[0]++;
                else oddEven[1]++;
            });

            for (let i = 0; i < nums.length; i++) {
                for (let j = i + 1; j < nums.length; j++) {
                    const pair = `${nums[i]}-${nums[j]}`;
                    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
                }
            }
        });

        const indexed = freq
            .map((c, i) => ({ n: i, c }))
            .slice(1)
            .sort((a, b) => b.c - a.c);

        const hot = indexed.slice(0, 5);
        const cold = indexed.slice(-5).reverse();

        const topPairs = Array.from(pairCounts.entries())
            .map(([k, count]) => ({ pair: k.split('-').map(Number), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const latestNo = source[0]?.draw_no || 0;
        this.state.analytics = {
            id: `${latestNo}:${source.length}`,
            freq,
            rangeCounts,
            oddEven,
            topPairs,
            hot,
            cold
        };
        return this.state.analytics;
    }

    getAnalytics() {
        return this.state.analytics || this.buildAnalyticsCache();
    }

    async fetchWinningStats() {
        const statusEl = $('#syncStatus');
        const updateStatus = (text, color) => {
            if (statusEl) {
                statusEl.querySelector('.text') && (statusEl.querySelector('.text').textContent = text);
                statusEl.querySelector('.dot') && (statusEl.querySelector('.dot').style.background = color);
            }
        };

        try {
            updateStatus('Check Local', 'var(--warning)');

            // 1. Load from Static JSON (Basline)
            const res = await fetch('data/winning_stats.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const staticData = json.data || json || [];

            // 2. Load from LocalStorage (Updates)
            const localUpdates = JSON.parse(localStorage.getItem('lotto_pro_updates_v2') || '[]');

            // 3. Merge: Local Updates take precedence
            const mergedMap = new Map();
            staticData.forEach(d => mergedMap.set(Number(d.draw_no), d));
            localUpdates.forEach(d => mergedMap.set(Number(d.draw_no), d));

            this.state.winningStats = Array.from(mergedMap.values()).map(r => ({
                draw_no: Number(r.draw_no),
                numbers: (r.numbers || []).map(Number).sort((a, b) => a - b),
                bonus: Number(r.bonus),
                date: r.date,
                prize_amount: r.prize_amount ? Number(r.prize_amount) : 0,
                winners_count: r.winners_count ? Number(r.winners_count) : 0,
                total_sales: r.total_sales ? Number(r.total_sales) : 0
            })).sort((a, b) => b.draw_no - a.draw_no);
            this.buildAnalyticsCache();

            const latestNo = this.state.winningStats[0]?.draw_no || 0;
            const estNo = estimateLatestDrawKST();

            if (latestNo > 0 && estNo > 0 && latestNo < estNo) {
                updateStatus(`Update Avail (+${estNo - latestNo})`, 'var(--warning)');
            } else {
                updateStatus('Latest', 'var(--success)');
            }
            return true;
        } catch (e) {
            console.warn('Winning stats fetch failed', e);
            updateStatus('Offline', 'var(--danger)');
            return false;
        }
    }

    async fetchRangeFromProxy(fromNo, toNo, proxyConfig, log) {
        if (!proxyConfig?.url || fromNo > toNo) return [];

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
            if (!baseUrl) return [];

            const url = `${baseUrl}/proxy/range?from=${fromNo}&to=${toNo}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();
            const list = Array.isArray(payload?.data) ? payload.data : [];
            const normalized = list.map(item => this.normalizeDrawItem(item)).filter(Boolean);
            if (normalized.length) log(`⚡ range 동기화 성공: ${normalized.length}개 회차`);
            return normalized;
        } catch (e) {
            log(`ℹ️ range 동기화 사용 불가: ${e.message}`);
            return [];
        }
    }

    normalizeDrawItem(raw) {
        if (!raw) return null;
        const drawNo = Number(raw.draw_no ?? raw.ltEpsd);
        if (!drawNo || !Number.isFinite(drawNo)) return null;

        const numbers = Array.isArray(raw.numbers)
            ? raw.numbers
            : [raw.tm1WnNo, raw.tm2WnNo, raw.tm3WnNo, raw.tm4WnNo, raw.tm5WnNo, raw.tm6WnNo];

        const dateRaw = String(raw.date ?? raw.ltRflYmd ?? '');
        const date = dateRaw.length === 8
            ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
            : dateRaw;

        const normalized = {
            draw_no: drawNo,
            date,
            numbers: (numbers || []).map(Number).filter(n => n >= 1 && n <= 45).sort((a, b) => a - b),
            bonus: Number(raw.bonus ?? raw.bnsWnNo ?? 0),
            prize_amount: Number(raw.prize_amount ?? raw.rnk1WnAmt ?? 0),
            winners_count: Number(raw.winners_count ?? raw.rnk1WnNope ?? 0),
            total_sales: Number(raw.total_sales ?? raw.rlvtEpsdSumNtslAmt ?? 0)
        };
        if (normalized.numbers.length !== 6 || normalized.bonus < 1 || normalized.bonus > 45) return null;
        return normalized;
    }

    async fetchOneDraw(drawNo, proxyConfig) {
        const targetUrl = `https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${drawNo}`;
        const urls = [];
        const customProxy = proxyConfig?.url || '';

        if (customProxy) {
            if (customProxy.includes('{draw_no}')) {
                urls.push(customProxy.replace('{draw_no}', String(drawNo)));
            } else if (customProxy.includes('/proxy/latest')) {
                if (customProxy.includes('draw_no=')) {
                    urls.push(customProxy.replace(/draw_no=\d*/i, `draw_no=${drawNo}`));
                } else {
                    const delim = customProxy.includes('?') ? '&' : '?';
                    urls.push(`${customProxy}${delim}draw_no=${drawNo}`);
                }
            } else if (customProxy.includes('{url}')) {
                urls.push(customProxy.replace('{url}', encodeURIComponent(targetUrl)));
            } else {
                urls.push(`${customProxy}${encodeURIComponent(targetUrl)}`);
            }
        }

        urls.push(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
        urls.push(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);

        for (const fetchUrl of urls) {
            try {
                const res = await fetch(fetchUrl);
                if (!res.ok) continue;
                const wrapper = await res.json();

                let inner = wrapper;
                if (wrapper?.contents && typeof wrapper.contents === 'string') {
                    inner = JSON.parse(wrapper.contents);
                } else if (wrapper?.contents) {
                    inner = wrapper.contents;
                }

                const candidate = inner?.data?.list?.[0]
                    ? this.normalizeDrawItem(inner.data.list[0])
                    : (inner?.data?.[0] ? this.normalizeDrawItem(inner.data[0]) : this.normalizeDrawItem(inner));
                if (candidate) return candidate;
            } catch (e) {
                continue;
            }
        }
        return null;
    }

    async fetchLatestFromAPI(options = {}) {
        if (typeof options === 'boolean') options = { silent: options };
        const silent = Boolean(options.silent);
        const logEl = $('#syncLog');
        const btn = $('#syncDataBtn');
        if (logEl && !silent) { logEl.style.display = 'block'; logEl.innerHTML = ''; }

        const log = (msg) => {
            if (logEl && !silent) {
                logEl.innerHTML += `<div>${msg}</div>`;
                logEl.scrollTop = logEl.scrollHeight;
            }
            console.log(`[Sync] ${msg}`);
        };

        if (btn) btn.disabled = true;

        try {
            const latestKnown = this.state.winningStats[0]?.draw_no || 1000;
            const estNo = estimateLatestDrawKST();

            if (latestKnown >= estNo) {
                log('✅ 이미 최신 데이터입니다.');
                if (!silent) UIManager.toast('이미 최신 데이터입니다.', 'info');
                return;
            }

            log(`🔍 최신 회차 검색: ${latestKnown + 1} ~ ${estNo}`);

            // Keep state in sync with live input (if data tab is visible)
            const proxyInput = $('#customProxyUrl');
            if (proxyInput) this.state.customProxy = proxyInput.value.trim();
            const proxyConfig = this.resolveProxyConfig();
            log(`🔗 Proxy Source: ${proxyConfig.source}`);

            let updatedCount = 0;
            const newItems = [];
            const rangeItems = await this.fetchRangeFromProxy(latestKnown + 1, estNo, proxyConfig, log);
            rangeItems.forEach(item => newItems.push(item));

            const fetched = new Set(newItems.map(x => x.draw_no));
            for (let no = latestKnown + 1; no <= estNo; no++) {
                if (fetched.has(no)) continue;
                log(`📡 ${no}회차 데이터 요청 중... (fallback)`);
                const item = await this.fetchOneDraw(no, proxyConfig);
                if (item) {
                    newItems.push(item);
                    fetched.add(no);
                    log(`✨ ${no}회차 확보 완료! (${item.date})`);
                    updatedCount++;
                    await sleep(120);
                } else {
                    log(`⚠️ ${no}회차 데이터 확인 실패 (서버 응답 없음 or 아직 추첨 전)`);
                    break;
                }
            }

            if (rangeItems.length > 0) {
                updatedCount += rangeItems.length;
            }

            if (updatedCount > 0) {
                // Save to LocalStorage
                const currentUpdates = JSON.parse(localStorage.getItem('lotto_pro_updates_v2') || '[]');
                const merged = [...currentUpdates, ...newItems];
                // Dedupe
                const unique = Array.from(new Map(merged.map(item => [item.draw_no, item])).values());
                localStorage.setItem('lotto_pro_updates_v2', JSON.stringify(unique));

                log(`💾 ${updatedCount}개 회차 정보 저장 완료.`);
                await this.fetchWinningStats(); // Reload to update memory & UI
                await this.app?.refreshCurrentRoute();
                UIManager.toast(`${updatedCount}개 회차 업데이트 완료`, 'success');
            } else {
                log('ℹ️ 업데이트된 데이터가 없습니다.');
            }

        } catch (e) {
            log(`❌ 오류 발생: ${e.message}`);
            UIManager.toast('동기화 중 오류가 발생했습니다.', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    addToFavorites(nums) {
        const key = nums.join(',');
        if (this.state.favorites.some(f => f.numbers.join(',') === key)) {
            UIManager.toast('이미 즐겨찾기에 있습니다.', 'warning');
            return false;
        }
        this.state.favorites.unshift({ numbers: nums, date: new Date().toISOString() });
        this.save();
        UIManager.toast('즐겨찾기 저장 완료', 'success');
        return true;
    }

    clearFavorites() {
        this.state.favorites = [];
        this.save();
    }

    clearHistory() {
        this.state.history = [];
        this.save();
    }
}
