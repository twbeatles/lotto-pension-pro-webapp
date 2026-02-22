import { CONFIG } from '../utils/config.js';
import { $, sleep, estimateLatestDrawKST } from '../utils/utils.js';
import { UIManager } from './UIManager.js';
import { createDefaultStrategyRequest } from './StrategyCatalog.js';

export class DataManager {
    constructor() {
        this.app = null;
        this.lastTicketAlertKey = '';
        this.state = {
            theme: 'dark',
            favorites: [],
            history: [],
            winningStats: [],
            generated: [],
            customProxy: '',
            aiResults: [],
            analytics: null,
            strategyPrefs: this.getDefaultStrategyPrefs(),
            ticketBook: [],
            campaigns: [],
            strategyPresets: [],
            alertPrefs: this.getDefaultAlertPrefs()
        };
        // Debounce timer for storage I/O
        this._saveTimer = null;
    }

    getDefaultStrategyPrefs() {
        return {
            generator: createDefaultStrategyRequest('ensemble_weighted'),
            ai: createDefaultStrategyRequest('ensemble_weighted'),
            backtest: createDefaultStrategyRequest('random_baseline')
        };
    }

    getDefaultAlertPrefs() {
        return {
            enableInApp: true,
            enableSystemNotification: false,
            notifyOnNewResult: true
        };
    }

    mergeStrategyPrefs(raw) {
        const defaults = this.getDefaultStrategyPrefs();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            generator: {
                ...defaults.generator,
                ...(input.generator || {}),
                params: { ...defaults.generator.params, ...(input.generator?.params || {}) },
                filters: { ...defaults.generator.filters, ...(input.generator?.filters || {}) }
            },
            ai: {
                ...defaults.ai,
                ...(input.ai || {}),
                params: { ...defaults.ai.params, ...(input.ai?.params || {}) },
                filters: { ...defaults.ai.filters, ...(input.ai?.filters || {}) }
            },
            backtest: {
                ...defaults.backtest,
                ...(input.backtest || {}),
                params: { ...defaults.backtest.params, ...(input.backtest?.params || {}) },
                filters: { ...defaults.backtest.filters, ...(input.backtest?.filters || {}) }
            }
        };
    }

    mergeAlertPrefs(raw) {
        const defaults = this.getDefaultAlertPrefs();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            ...defaults,
            ...input,
            enableInApp: input.enableInApp !== false,
            enableSystemNotification: Boolean(input.enableSystemNotification),
            notifyOnNewResult: input.notifyOnNewResult !== false
        };
    }

    setStrategyPrefs(scope, request) {
        if (!['generator', 'ai', 'backtest'].includes(scope)) return;
        this.state.strategyPrefs[scope] = {
            ...this.state.strategyPrefs[scope],
            ...(request || {}),
            params: {
                ...(this.state.strategyPrefs[scope]?.params || {}),
                ...(request?.params || {})
            },
            filters: {
                ...(this.state.strategyPrefs[scope]?.filters || {}),
                ...(request?.filters || {})
            }
        };
    }

    setAlertPrefs(next) {
        this.state.alertPrefs = this.mergeAlertPrefs({
            ...(this.state.alertPrefs || {}),
            ...(next || {})
        });
        this.save();
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
            customProxy: this.state.customProxy,
            strategyPrefs: this.state.strategyPrefs
        }));
    }

    persistExtendedData() {
        localStorage.setItem(CONFIG.KEYS.TICKET_BOOK, JSON.stringify(this.state.ticketBook));
        localStorage.setItem(CONFIG.KEYS.CAMPAIGNS, JSON.stringify(this.state.campaigns));
        localStorage.setItem(CONFIG.KEYS.ALERT_PREFS, JSON.stringify(this.state.alertPrefs));
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
            if (proxyUrl) return { source: 'URL 쿼리(proxyUrl)', url: proxyUrl };
            const proxy = (params.get('proxy') || '').trim();
            if (proxy) return { source: 'URL 쿼리(proxy)', url: proxy };
        } catch (e) {
            return null;
        }
        return null;
    }

    resolveProxyConfig() {
        const queryProxy = this.getQueryProxyUrl();
        if (queryProxy) return queryProxy;

        const legacyProxy = this.readLegacyProxyUrl();
        if (legacyProxy) return { source: '이전 설정(v1)', url: legacyProxy };

        const v2Proxy = (this.state.customProxy || '').trim();
        if (v2Proxy) return { source: '앱 설정(v2)', url: v2Proxy };

        return { source: '공용 기본값', url: '' };
    }

    safeJsonParse(raw, fallback) {
        try {
            return JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    }

    normalizeNumbers(nums) {
        if (!Array.isArray(nums)) return [];
        const clean = [...new Set(nums.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 45))];
        if (clean.length !== 6) return [];
        return clean.sort((a, b) => a - b);
    }

    createId(prefix = 'id') {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return `${prefix}_${crypto.randomUUID()}`;
        }
        return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    }

    normalizeTicketEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const numbers = this.normalizeNumbers(raw.numbers || []);
        if (numbers.length !== 6) return null;

        const targetDrawNo = Number(raw.targetDrawNo);
        if (!Number.isFinite(targetDrawNo) || targetDrawNo < 1) return null;

        const source = ['generator', 'ai', 'import'].includes(raw.source) ? raw.source : 'import';
        const checkedDraw = Number(raw?.checked?.drawNo);
        const checkedRank = Number(raw?.checked?.rank);

        return {
            id: raw.id || this.createId('ticket'),
            numbers,
            targetDrawNo: Math.floor(targetDrawNo),
            source,
            strategyRequest: raw.strategyRequest && typeof raw.strategyRequest === 'object' ? raw.strategyRequest : null,
            memo: typeof raw.memo === 'string' ? raw.memo.slice(0, 200) : '',
            createdAt: raw.createdAt || new Date().toISOString(),
            checked: Number.isFinite(checkedDraw) && Number.isFinite(checkedRank) && checkedRank >= 0 && checkedRank <= 5
                ? {
                    drawNo: Math.floor(checkedDraw),
                    rank: Math.floor(checkedRank),
                    checkedAt: raw.checked.checkedAt || new Date().toISOString()
                }
                : null
        };
    }

    normalizeCampaignEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const startDrawNo = Number(raw.startDrawNo);
        const weeks = Number(raw.weeks);
        const setsPerWeek = Number(raw.setsPerWeek);
        if (!Number.isFinite(startDrawNo) || !Number.isFinite(weeks) || !Number.isFinite(setsPerWeek)) return null;

        return {
            id: raw.id || this.createId('campaign'),
            name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '캠페인',
            startDrawNo: Math.max(1, Math.floor(startDrawNo)),
            weeks: Math.max(1, Math.floor(weeks)),
            setsPerWeek: Math.max(1, Math.floor(setsPerWeek)),
            strategyRequest: raw.strategyRequest && typeof raw.strategyRequest === 'object' ? raw.strategyRequest : null,
            createdAt: raw.createdAt || new Date().toISOString()
        };
    }

    buildTicketKey(ticket) {
        const strategySnapshot = ticket?.strategyRequest ? JSON.stringify(ticket.strategyRequest) : '-';
        return [ticket?.targetDrawNo, ticket?.source || '-', (ticket?.numbers || []).join(','), strategySnapshot].join('|');
    }

    load() {
        try {
            let needsPersist = false;
            this.state.favorites = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.FAV) || '[]', []);
            this.state.history = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.HIST) || '[]', []);

            const settings = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.SETTINGS) || '{}', {});
            this.state.theme = settings.theme || 'dark';
            this.state.customProxy = settings.customProxy || '';
            this.state.strategyPrefs = this.mergeStrategyPrefs(settings.strategyPrefs);

            const rawTickets = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.TICKET_BOOK) || '[]', []);
            const rawCampaigns = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.CAMPAIGNS) || '[]', []);
            const rawAlertPrefs = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.ALERT_PREFS) || '{}', {});

            const normalizedTickets = Array.isArray(rawTickets)
                ? rawTickets.map((x) => this.normalizeTicketEntry(x)).filter(Boolean)
                : [];
            const normalizedCampaigns = Array.isArray(rawCampaigns)
                ? rawCampaigns.map((x) => this.normalizeCampaignEntry(x)).filter(Boolean)
                : [];
            const normalizedAlertPrefs = this.mergeAlertPrefs(rawAlertPrefs);

            if (Array.isArray(rawTickets) && normalizedTickets.length !== rawTickets.length) needsPersist = true;
            if (Array.isArray(rawCampaigns) && normalizedCampaigns.length !== rawCampaigns.length) needsPersist = true;
            if (JSON.stringify(normalizedAlertPrefs) !== JSON.stringify(rawAlertPrefs || {})) needsPersist = true;

            this.state.ticketBook = normalizedTickets;
            this.state.campaigns = normalizedCampaigns;
            this.state.alertPrefs = normalizedAlertPrefs;
            this.state.strategyPresets = [];

            // Legacy proxy settings migration (v1 -> v2)
            const legacyProxy = this.readLegacyProxyUrl();
            if (!this.state.customProxy && legacyProxy) {
                this.state.customProxy = legacyProxy;
                needsPersist = true;
            }

            // UI sync if input exists
            const proxyInput = $('#customProxyUrl');
            if (proxyInput) {
                const resolved = this.resolveProxyConfig();
                proxyInput.value = resolved?.url || this.state.customProxy;
            }

            if (needsPersist) {
                this.persistSettings();
                this.persistExtendedData();
            }
        } catch (e) {
            console.error('데이터 불러오기 실패', e);
            UIManager.toast('데이터 로드 실패', 'error');
        }
    }

    save(immediate = false) {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }

        const executeSave = () => {
            try {
                localStorage.setItem(CONFIG.KEYS.FAV, JSON.stringify(this.state.favorites));
                localStorage.setItem(CONFIG.KEYS.HIST, JSON.stringify(this.state.history));
                const proxyInput = $('#customProxyUrl');
                if (proxyInput) this.state.customProxy = proxyInput.value.trim();

                this.persistSettings();
                this.persistExtendedData();
            } catch (e) {
                console.error('데이터 저장 실패', e);
            }
        };

        if (immediate) {
            executeSave();
            return;
        }

        // Debounce storage I/O using requestIdleCallback if available, fallback to setTimeout
        this._saveTimer = setTimeout(() => {
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => executeSave(), { timeout: 1000 });
            } else {
                executeSave();
            }
        }, 300);
    }

    addTicket(numbers, options = {}) {
        const normalized = this.normalizeNumbers(numbers);
        if (normalized.length !== 6) return null;

        const latestDrawNo = Number(this.state.winningStats?.[0]?.draw_no || estimateLatestDrawKST() || 1);
        const targetDrawNo = Math.max(1, Math.floor(Number(options.targetDrawNo || latestDrawNo + 1)));

        const ticket = this.normalizeTicketEntry({
            id: this.createId('ticket'),
            numbers: normalized,
            targetDrawNo,
            source: options.source || 'import',
            strategyRequest: options.strategyRequest || null,
            memo: options.memo || '',
            createdAt: new Date().toISOString(),
            checked: null
        });
        if (!ticket) return null;

        const key = this.buildTicketKey(ticket);
        const exists = this.state.ticketBook.some((x) => this.buildTicketKey(x) === key);
        if (exists) return null;

        this.state.ticketBook.unshift(ticket);
        this.save();
        return ticket;
    }

    addTicketsBulk(items = [], options = {}) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return 0;

        const existingKeys = new Set(this.state.ticketBook.map((x) => this.buildTicketKey(x)));
        let inserted = 0;

        for (const raw of list) {
            const ticket = this.normalizeTicketEntry(raw);
            if (!ticket) continue;
            const key = this.buildTicketKey(ticket);
            if (existingKeys.has(key)) continue;
            existingKeys.add(key);
            this.state.ticketBook.unshift(ticket);
            inserted++;
        }

        if (inserted > 0) {
            this.save();
            if (!options.silent) UIManager.toast(`${inserted}개 티켓 추가 완료`, 'success');
        }
        return inserted;
    }

    removeTicket(id) {
        const before = this.state.ticketBook.length;
        this.state.ticketBook = this.state.ticketBook.filter((x) => x.id !== id);
        const removed = before - this.state.ticketBook.length;
        if (removed > 0) this.save();
        return removed > 0;
    }

    updateTicketMemo(id, memo) {
        const target = this.state.ticketBook.find((x) => x.id === id);
        if (!target) return false;
        target.memo = typeof memo === 'string' ? memo.slice(0, 200) : '';
        this.save();
        return true;
    }

    clearTicketBook(filter = 'all') {
        const isPending = (t) => !t.checked;
        const isWin = (t) => t.checked && t.checked.rank > 0;
        const isLose = (t) => t.checked && t.checked.rank === 0;

        const before = this.state.ticketBook.length;
        if (filter === 'pending') this.state.ticketBook = this.state.ticketBook.filter((t) => !isPending(t));
        else if (filter === 'win') this.state.ticketBook = this.state.ticketBook.filter((t) => !isWin(t));
        else if (filter === 'lose') this.state.ticketBook = this.state.ticketBook.filter((t) => !isLose(t));
        else this.state.ticketBook = [];

        const removed = before - this.state.ticketBook.length;
        if (removed > 0) this.save();
        return removed;
    }

    addCampaign(entry) {
        const normalized = this.normalizeCampaignEntry(entry);
        if (!normalized) return null;
        this.state.campaigns.unshift(normalized);
        this.save();
        return normalized;
    }

    removeCampaign(id) {
        const before = this.state.campaigns.length;
        this.state.campaigns = this.state.campaigns.filter((x) => x.id !== id);
        const removed = before - this.state.campaigns.length;
        if (removed > 0) this.save();
        return removed > 0;
    }

    clearCampaigns() {
        this.state.campaigns = [];
        this.save();
    }

    rankTicket(myNums, winNums, bonus) {
        let hit = 0;
        let hasBonus = false;
        myNums.forEach((n) => {
            if (winNums.includes(n)) hit++;
            if (n === bonus) hasBonus = true;
        });

        if (hit === 6) return 1;
        if (hit === 5 && hasBonus) return 2;
        if (hit === 5) return 3;
        if (hit === 4) return 4;
        if (hit === 3) return 5;
        return 0;
    }

    async notifyTicketSettlement(summary = {}) {
        const prefs = this.state.alertPrefs || this.getDefaultAlertPrefs();
        if (!prefs.notifyOnNewResult || !summary.settled) return;

        const alertKey = `${summary.latestDrawNo || 0}:${summary.settled}:${summary.wins}`;
        if (alertKey === this.lastTicketAlertKey) return;
        this.lastTicketAlertKey = alertKey;

        const message = summary.wins > 0
            ? `티켓 정산 완료: ${summary.settled}개 중 당첨 ${summary.wins}개`
            : `티켓 정산 완료: ${summary.settled}개`;

        if (prefs.enableInApp) {
            UIManager.toast(message, summary.wins > 0 ? 'success' : 'info', 3500);
        }

        if (prefs.enableSystemNotification && typeof Notification !== 'undefined') {
            try {
                let permission = Notification.permission;
                if (permission === 'default') {
                    permission = await Notification.requestPermission();
                }
                if (permission === 'granted') {
                    new Notification('로또 프로 티켓 정산', { body: message });
                }
            } catch (e) {
                console.warn('시스템 알림 전송 실패', e);
            }
        }
    }

    async settlePendingTickets({ silent = true } = {}) {
        if (!this.state.ticketBook.length || !this.state.winningStats.length) {
            return { settled: 0, wins: 0, latestDrawNo: this.state.winningStats?.[0]?.draw_no || 0 };
        }

        const drawMap = new Map(this.state.winningStats.map((d) => [Number(d.draw_no), d]));
        const latestDrawNo = Number(this.state.winningStats[0]?.draw_no || 0);

        let settled = 0;
        let wins = 0;

        for (const ticket of this.state.ticketBook) {
            if (!ticket || ticket.checked) continue;
            if (Number(ticket.targetDrawNo) > latestDrawNo) continue;
            const draw = drawMap.get(Number(ticket.targetDrawNo));
            if (!draw) continue;

            const rank = this.rankTicket(ticket.numbers, draw.numbers, draw.bonus);
            ticket.checked = {
                drawNo: Number(draw.draw_no),
                rank,
                checkedAt: new Date().toISOString()
            };
            settled++;
            if (rank > 0) wins++;
        }

        if (settled > 0) {
            this.save();
            if (!silent) await this.notifyTicketSettlement({ settled, wins, latestDrawNo });
        }

        return { settled, wins, latestDrawNo };
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

    async fetchWinningStats(options = {}) {
        const statusEl = $('#syncStatus');
        const notifyTicketSettle = options.notifyTicketSettle !== false;
        const updateStatus = (text, color) => {
            if (statusEl) {
                statusEl.querySelector('.text') && (statusEl.querySelector('.text').textContent = text);
                statusEl.querySelector('.dot') && (statusEl.querySelector('.dot').style.background = color);
            }
        };

        try {
            updateStatus('로컬 확인 중', 'var(--warning)');

            const res = await fetch('data/winning_stats.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const staticData = json.data || json || [];

            const localUpdates = JSON.parse(localStorage.getItem('lotto_pro_updates_v2') || '[]');

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

            await this.settlePendingTickets({ silent: !notifyTicketSettle });

            const latestNo = this.state.winningStats[0]?.draw_no || 0;
            const estNo = estimateLatestDrawKST();

            if (latestNo > 0 && estNo > 0 && latestNo < estNo) {
                updateStatus(`업데이트 가능 (+${estNo - latestNo})`, 'var(--warning)');
            } else {
                updateStatus('최신', 'var(--success)');
            }
            return true;
        } catch (e) {
            console.warn('당첨 데이터 조회 실패', e);
            updateStatus('오프라인', 'var(--danger)');
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
            console.log(`[동기화] ${msg}`);
        };

        if (btn) btn.disabled = true;

        try {
            const latestKnown = this.state.winningStats[0]?.draw_no || 1000;
            const estNo = estimateLatestDrawKST();

            if (latestKnown >= estNo) {
                log('✅ 이미 최신 데이터입니다.');
                if (!silent) UIManager.toast('이미 최신 데이터입니다.', 'info');
                await this.settlePendingTickets({ silent: false });
                return;
            }

            log(`🔍 최신 회차 검색: ${latestKnown + 1} ~ ${estNo}`);

            const proxyInput = $('#customProxyUrl');
            if (proxyInput) this.state.customProxy = proxyInput.value.trim();
            const proxyConfig = this.resolveProxyConfig();
            log(`🔗 프록시 소스: ${proxyConfig.source}`);

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
                const currentUpdates = JSON.parse(localStorage.getItem('lotto_pro_updates_v2') || '[]');
                const merged = [...currentUpdates, ...newItems];
                const unique = Array.from(new Map(merged.map(item => [item.draw_no, item])).values());
                localStorage.setItem('lotto_pro_updates_v2', JSON.stringify(unique));

                log(`💾 ${updatedCount}개 회차 정보 저장 완료.`);
                await this.fetchWinningStats();
                await this.app?.refreshCurrentRoute();
                UIManager.toast(`${updatedCount}개 회차 업데이트 완료`, 'success');
            } else {
                log('ℹ️ 업데이트된 데이터가 없습니다.');
                await this.settlePendingTickets({ silent: false });
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
