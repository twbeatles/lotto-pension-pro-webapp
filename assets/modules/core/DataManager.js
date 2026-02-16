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
            aiResults: [] // Session persistence for AI tab
        };
    }

    setApp(app) {
        this.app = app;
    }

    load() {
        try {
            this.state.favorites = JSON.parse(localStorage.getItem(CONFIG.KEYS.FAV) || '[]');
            this.state.history = JSON.parse(localStorage.getItem(CONFIG.KEYS.HIST) || '[]');
            const settings = JSON.parse(localStorage.getItem(CONFIG.KEYS.SETTINGS) || '{}');
            this.state.theme = settings.theme || 'dark';
            this.state.customProxy = settings.customProxy || '';

            // UI sync if input exists
            const proxyInput = $('#customProxyUrl');
            if (proxyInput) proxyInput.value = this.state.customProxy;
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

            localStorage.setItem(CONFIG.KEYS.SETTINGS, JSON.stringify({
                theme: this.state.theme,
                customProxy: this.state.customProxy
            }));
        } catch (e) {
            console.error('Data save failed', e);
        }
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
            const res = await fetch(`data/winning_stats.json?t=${new Date().getTime()}`);
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

    async fetchLatestFromAPI(silent = false) {
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

            // Robust Proxy List
            // 1. User Custom
            // 2. AllOrigins (Stable but sometimes slow)
            // 3. CorsProxy.io (Fast public proxy)
            const PROXIES = [
                (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
                (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
            ];

            let updatedCount = 0;
            const newItems = [];

            for (let no = latestKnown + 1; no <= estNo; no++) {
                log(`📡 ${no}회차 데이터 요청 중... (Internal API)`);

                // Use the Internal API (same as legacy Python app) for faster updates
                const targetUrl = `https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${no}`;
                const customProxy = $('#customProxyUrl')?.value?.trim();

                let success = false;
                let data = null;

                // Strategy: Try Custom -> Proxy 1 -> Proxy 2
                const strategies = [];
                if (customProxy) {
                    strategies.push((url) => customProxy + encodeURIComponent(url));
                }
                strategies.push(...PROXIES);

                for (const strategy of strategies) {
                    try {
                        const fetchUrl = strategy(targetUrl);
                        const res = await fetch(fetchUrl);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);

                        const wrapper = await res.json();

                        // Unpack Proxy Wrappers
                        let inner = wrapper;
                        if (wrapper.contents && typeof wrapper.contents === 'string') {
                            inner = JSON.parse(wrapper.contents);
                        } else if (wrapper.contents) {
                            inner = wrapper.contents;
                        }

                        // Validate Internal API Structure
                        // Python: if 'data' in result and 'list' in result['data']:
                        if (inner.data && inner.data.list && inner.data.list.length > 0) {
                            data = inner.data.list[0];
                            success = true;
                            break;
                        }
                    } catch (err) {
                        console.warn(`Proxy failed: ${err.message}`);
                        continue;
                    }
                }

                if (success && data) {
                    // Map Internal API fields to our schema
                    // Python: ltEpsd, ltRflYmd, tm1WnNo...
                    const dateRaw = String(data.ltRflYmd || '');
                    const dateStr = dateRaw.length === 8
                        ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
                        : dateRaw;

                    const item = {
                        draw_no: data.ltEpsd,
                        date: dateStr,
                        numbers: [
                            data.tm1WnNo, data.tm2WnNo, data.tm3WnNo,
                            data.tm4WnNo, data.tm5WnNo, data.tm6WnNo
                        ].map(Number),
                        bonus: Number(data.bnsWnNo),
                        prize_amount: Number(data.rnk1WnAmt || 0),
                        winners_count: Number(data.rnk1WnNope || 0),
                        total_sales: Number(data.rlvtEpsdSumNtslAmt || 0)
                    };

                    newItems.push(item);
                    log(`✨ ${no}회차 확보 완료! (${item.date})`);
                    updatedCount++;
                    await sleep(200);
                } else {
                    log(`⚠️ ${no}회차 데이터 확인 실패 (서버 응답 없음 or 아직 추첨 전)`);
                    break;
                }
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
                this.app?.refreshCurrentRoute();
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
