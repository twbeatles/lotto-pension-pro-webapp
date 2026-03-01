import { CONFIG } from '../utils/config.js';
import { $, estimateLatestDrawKST } from '../utils/utils.js';
import { UIManager } from './UIManager.js';
import { createDefaultStrategyRequest } from './StrategyCatalog.js';
import { measureAsync } from '../utils/perf.js';

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
        this._dirtyKeys = {
            fav: false,
            hist: false,
            settings: false,
            ticketBook: false,
            campaigns: false,
            alerts: false,
            presets: false
        };
        this.localUpdatesCache = null;
        this.RANGE_CHUNK_SIZE = 40;
        this.RANGE_CHUNK_CONCURRENCY = 2;
        this.FALLBACK_FETCH_CONCURRENCY = 3;
        this.SYNC_FETCH_TIMEOUT_MS = 4500;
    }

    markDirty(...keys) {
        keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(this._dirtyKeys, key)) {
                this._dirtyKeys[key] = true;
            }
        });
    }

    markAllDirty() {
        Object.keys(this._dirtyKeys).forEach((key) => {
            this._dirtyKeys[key] = true;
        });
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

    mergeStrategyPresets(raw) {
        const list = Array.isArray(raw) ? raw : [];
        const byId = new Map();
        const byScopeName = new Set();

        list.forEach((item, index) => {
            if (!item || typeof item !== 'object') return;
            const scope = typeof item.scope === 'string' ? item.scope.trim() : '';
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            const request = item.request && typeof item.request === 'object'
                ? item.request
                : (item.strategyRequest && typeof item.strategyRequest === 'object' ? item.strategyRequest : null);
            if (!scope || !name || !request) return;

            const id = (typeof item.id === 'string' && item.id.trim())
                ? item.id.trim()
                : `preset_${scope}_${name}_${index}`;
            const scopeNameKey = `${scope}|${name}`;
            if (byId.has(id) || byScopeName.has(scopeNameKey)) return;

            byId.set(id, {
                id,
                scope,
                name,
                description: typeof item.description === 'string' ? item.description.slice(0, 200) : '',
                request,
                createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
                updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()
            });
            byScopeName.add(scopeNameKey);
        });

        return Array.from(byId.values());
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
        this.markDirty('settings');
    }

    setAlertPrefs(next) {
        this.state.alertPrefs = this.mergeAlertPrefs({
            ...(this.state.alertPrefs || {}),
            ...(next || {})
        });
        this.markDirty('alerts');
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
        localStorage.setItem(CONFIG.KEYS.SETTINGS, JSON.stringify(this.getSettingsPayload()));
    }

    persistExtendedData() {
        localStorage.setItem(CONFIG.KEYS.TICKET_BOOK, JSON.stringify(this.state.ticketBook));
        localStorage.setItem(CONFIG.KEYS.CAMPAIGNS, JSON.stringify(this.state.campaigns));
        localStorage.setItem(CONFIG.KEYS.ALERT_PREFS, JSON.stringify(this.state.alertPrefs));
        localStorage.setItem(CONFIG.KEYS.STRATEGY_PRESETS, JSON.stringify(this.state.strategyPresets || []));
    }

    getSettingsPayload() {
        return {
            theme: this.state.theme,
            customProxy: this.state.customProxy,
            strategyPrefs: this.state.strategyPrefs
        };
    }

    getLocalUpdates() {
        if (Array.isArray(this.localUpdatesCache)) return this.localUpdatesCache;
        const parsed = this.safeJsonParse(localStorage.getItem('lotto_pro_updates_v2') || '[]', []);
        this.localUpdatesCache = Array.isArray(parsed) ? parsed : [];
        return this.localUpdatesCache;
    }

    setLocalUpdates(items = []) {
        this.localUpdatesCache = Array.isArray(items) ? items : [];
        localStorage.setItem('lotto_pro_updates_v2', JSON.stringify(this.localUpdatesCache));
    }

    async fetchWithTimeout(url, options = {}, timeoutMs = this.SYNC_FETCH_TIMEOUT_MS) {
        return measureAsync('sync.fetch', async () => {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller
                ? setTimeout(() => controller.abort(), timeoutMs)
                : null;

            try {
                const nextOptions = controller ? { ...options, signal: controller.signal } : options;
                return await fetch(url, nextOptions);
            } finally {
                if (timer) clearTimeout(timer);
            }
        }, {
            timeoutMs,
            url: String(url).slice(0, 120)
        });
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
            if (proxyUrl) return { source: 'URL 荑쇰━(proxyUrl)', url: proxyUrl };
            const proxy = (params.get('proxy') || '').trim();
            if (proxy) return { source: 'URL 荑쇰━(proxy)', url: proxy };
        } catch (e) {
            return null;
        }
        return null;
    }

    resolveProxyConfig() {
        const queryProxy = this.getQueryProxyUrl();
        if (queryProxy) return queryProxy;

        const legacyProxy = this.readLegacyProxyUrl();
        if (legacyProxy) return { source: 'legacy settings (v1)', url: legacyProxy };

        const v2Proxy = (this.state.customProxy || '').trim();
        if (v2Proxy) return { source: 'saved settings (v2)', url: v2Proxy };

        return { source: 'public default', url: '' };
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

        const ticket = {
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

        this.buildTicketKey(ticket);
        return ticket;
    }

    normalizeCampaignEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const startDrawNo = Number(raw.startDrawNo);
        const weeks = Number(raw.weeks);
        const setsPerWeek = Number(raw.setsPerWeek);
        if (!Number.isFinite(startDrawNo) || !Number.isFinite(weeks) || !Number.isFinite(setsPerWeek)) return null;

        return {
            id: raw.id || this.createId('campaign'),
            name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : 'campaign',
            startDrawNo: Math.max(1, Math.floor(startDrawNo)),
            weeks: Math.max(1, Math.floor(weeks)),
            setsPerWeek: Math.max(1, Math.floor(setsPerWeek)),
            strategyRequest: raw.strategyRequest && typeof raw.strategyRequest === 'object' ? raw.strategyRequest : null,
            createdAt: raw.createdAt || new Date().toISOString()
        };
    }

    buildTicketKey(ticket) {
        if (ticket && typeof ticket.__dedupeKey === 'string') {
            return ticket.__dedupeKey;
        }
        const strategySnapshot = ticket?.strategyRequest ? JSON.stringify(ticket.strategyRequest) : '-';
        const key = [ticket?.targetDrawNo, ticket?.source || '-', (ticket?.numbers || []).join(','), strategySnapshot].join('|');
        if (ticket && typeof ticket === 'object') {
            try {
                Object.defineProperty(ticket, '__dedupeKey', {
                    value: key,
                    writable: true,
                    configurable: true,
                    enumerable: false
                });
            } catch (e) {
                ticket.__dedupeKey = key;
            }
        }
        return key;
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
            const rawStrategyPresets = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.STRATEGY_PRESETS) || '[]', []);

            const normalizedTickets = Array.isArray(rawTickets)
                ? rawTickets.map((x) => this.normalizeTicketEntry(x)).filter(Boolean)
                : [];
            const normalizedCampaigns = Array.isArray(rawCampaigns)
                ? rawCampaigns.map((x) => this.normalizeCampaignEntry(x)).filter(Boolean)
                : [];
            const normalizedAlertPrefs = this.mergeAlertPrefs(rawAlertPrefs);
            const normalizedStrategyPresets = this.mergeStrategyPresets(rawStrategyPresets);

            if (Array.isArray(rawTickets) && normalizedTickets.length !== rawTickets.length) needsPersist = true;
            if (Array.isArray(rawCampaigns) && normalizedCampaigns.length !== rawCampaigns.length) needsPersist = true;
            if (JSON.stringify(normalizedAlertPrefs) !== JSON.stringify(rawAlertPrefs || {})) needsPersist = true;
            if (Array.isArray(rawStrategyPresets) && normalizedStrategyPresets.length !== rawStrategyPresets.length) needsPersist = true;

            this.state.ticketBook = normalizedTickets;
            this.state.campaigns = normalizedCampaigns;
            this.state.alertPrefs = normalizedAlertPrefs;
            this.state.strategyPresets = normalizedStrategyPresets;
            this.localUpdatesCache = null;
            this.getLocalUpdates();

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

            Object.keys(this._dirtyKeys).forEach((key) => {
                this._dirtyKeys[key] = false;
            });
        } catch (e) {
            console.error('?곗씠??遺덈윭?ㅺ린 ?ㅽ뙣', e);
            UIManager.toast('?곗씠??濡쒕뱶 ?ㅽ뙣', 'error');
        }
    }

    save(immediate = false) {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }

        const executeSave = () => {
            try {
                const proxyInput = $('#customProxyUrl');
                if (proxyInput) {
                    const nextProxy = proxyInput.value.trim();
                    if (nextProxy !== this.state.customProxy) {
                        this.state.customProxy = nextProxy;
                        this.markDirty('settings');
                    }
                }

                if (this._dirtyKeys.fav) {
                    localStorage.setItem(CONFIG.KEYS.FAV, JSON.stringify(this.state.favorites));
                    this._dirtyKeys.fav = false;
                }
                if (this._dirtyKeys.hist) {
                    localStorage.setItem(CONFIG.KEYS.HIST, JSON.stringify(this.state.history));
                    this._dirtyKeys.hist = false;
                }
                if (this._dirtyKeys.settings) {
                    localStorage.setItem(CONFIG.KEYS.SETTINGS, JSON.stringify(this.getSettingsPayload()));
                    this._dirtyKeys.settings = false;
                }
                if (this._dirtyKeys.ticketBook) {
                    localStorage.setItem(CONFIG.KEYS.TICKET_BOOK, JSON.stringify(this.state.ticketBook));
                    this._dirtyKeys.ticketBook = false;
                }
                if (this._dirtyKeys.campaigns) {
                    localStorage.setItem(CONFIG.KEYS.CAMPAIGNS, JSON.stringify(this.state.campaigns));
                    this._dirtyKeys.campaigns = false;
                }
                if (this._dirtyKeys.alerts) {
                    localStorage.setItem(CONFIG.KEYS.ALERT_PREFS, JSON.stringify(this.state.alertPrefs));
                    this._dirtyKeys.alerts = false;
                }
                if (this._dirtyKeys.presets) {
                    localStorage.setItem(CONFIG.KEYS.STRATEGY_PRESETS, JSON.stringify(this.state.strategyPresets || []));
                    this._dirtyKeys.presets = false;
                }
            } catch (e) {
                console.error('?곗씠??????ㅽ뙣', e);
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
        this.markDirty('ticketBook');
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
            this.markDirty('ticketBook');
            this.save();
            if (!options.silent) UIManager.toast(`${inserted}媛??곗폆 異붽? ?꾨즺`, 'success');
        }
        return inserted;
    }

    removeTicket(id) {
        const before = this.state.ticketBook.length;
        this.state.ticketBook = this.state.ticketBook.filter((x) => x.id !== id);
        const removed = before - this.state.ticketBook.length;
        if (removed > 0) {
            this.markDirty('ticketBook');
            this.save();
        }
        return removed > 0;
    }

    updateTicketMemo(id, memo) {
        const target = this.state.ticketBook.find((x) => x.id === id);
        if (!target) return false;
        target.memo = typeof memo === 'string' ? memo.slice(0, 200) : '';
        this.markDirty('ticketBook');
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
        if (removed > 0) {
            this.markDirty('ticketBook');
            this.save();
        }
        return removed;
    }

    addCampaign(entry) {
        const normalized = this.normalizeCampaignEntry(entry);
        if (!normalized) return null;
        this.state.campaigns.unshift(normalized);
        this.markDirty('campaigns');
        this.save();
        return normalized;
    }

    removeCampaign(id) {
        const before = this.state.campaigns.length;
        this.state.campaigns = this.state.campaigns.filter((x) => x.id !== id);
        const removed = before - this.state.campaigns.length;
        if (removed > 0) {
            this.markDirty('campaigns');
            this.save();
        }
        return removed > 0;
    }

    clearCampaigns() {
        this.state.campaigns = [];
        this.markDirty('campaigns');
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

    async notifyTicketSettlement(summary = {}, options = {}) {
        const prefs = this.state.alertPrefs || this.getDefaultAlertPrefs();
        if (!prefs.notifyOnNewResult || !summary.settled) return;
        const requestSystemNotification = options.requestSystemNotification !== false;

        const alertKey = `${summary.latestDrawNo || 0}:${summary.settled}:${summary.wins}`;
        if (alertKey === this.lastTicketAlertKey) return;
        this.lastTicketAlertKey = alertKey;

        const message = summary.wins > 0
            ? `티켓 정산 완료: ${summary.settled}개 중 당첨 ${summary.wins}개`
            : `티켓 정산 완료: ${summary.settled}개`;

        if (prefs.enableInApp) {
            UIManager.toast(message, summary.wins > 0 ? 'success' : 'info', 3500);
        }

        if (requestSystemNotification && prefs.enableSystemNotification && typeof Notification !== 'undefined') {
            try {
                let permission = Notification.permission;
                if (permission === 'default') {
                    permission = await Notification.requestPermission();
                }
                if (permission === 'granted') {
                    new Notification('濡쒕삉 ?꾨줈 ?곗폆 ?뺤궛', { body: message });
                }
            } catch (e) {
                console.warn('?쒖뒪???뚮┝ ?꾩넚 ?ㅽ뙣', e);
            }
        }
    }

    async settlePendingTickets({ silent = true, requestSystemNotification = true } = {}) {
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
            this.markDirty('ticketBook');
            this.save();
            if (!silent) {
                await this.notifyTicketSettlement(
                    { settled, wins, latestDrawNo },
                    { requestSystemNotification }
                );
            }
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

    createSyncProfile(options = {}) {
        const trigger = String(options?.trigger || '');
        if (trigger === 'idle') {
            return {
                trigger,
                silent: true,
                settleSilent: true,
                toast: false,
                requestSystemNotification: false
            };
        }
        return {
            trigger: trigger === 'refresh' ? 'refresh' : 'manual',
            silent: false,
            settleSilent: false,
            toast: true,
            requestSystemNotification: true
        };
    }

    logSync(code, message, meta = null) {
        if (meta && typeof meta === 'object') {
            console.log(`[${code}] ${message}`, meta);
            return;
        }
        console.log(`[${code}] ${message}`);
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
            updateStatus('로또 확인 중', 'var(--warning)');

            const res = await this.fetchWithTimeout('data/winning_stats.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const staticData = json.data || json || [];

            const localUpdates = this.getLocalUpdates();

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
                updateStatus(`?낅뜲?댄듃 媛??(+${estNo - latestNo})`, 'var(--warning)');
            } else {
                updateStatus('理쒖떊', 'var(--success)');
            }
            return true;
        } catch (e) {
            console.warn('?뱀꺼 ?곗씠??議고쉶 ?ㅽ뙣', e);
            updateStatus('?ㅽ봽?쇱씤', 'var(--danger)');
            return false;
        }
    }

    async fetchRangeFromProxy(fromNo, toNo, proxyConfig, log) {
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
            const res = await this.fetchWithTimeout(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();
            const list = Array.isArray(payload?.data) ? payload.data : [];
            const normalized = list.map(item => this.normalizeDrawItem(item)).filter(Boolean);
            const missing = Array.isArray(payload?.missing)
                ? payload.missing.map((x) => Number(x)).filter(Number.isFinite)
                : [];
            if (normalized.length) {
                log(`??range ?숆린???깃났: ${fromNo}~${toNo} (${normalized.length}媛?`);
            }
            return { items: normalized, missing, failed: false };
        } catch (e) {
            this.logSync('SYNC_RANGE_FAIL', `Range fetch failed ${fromNo}-${toNo}`, { message: e.message });
            log(`?뱄툘 range ?숆린???ㅽ뙣(${fromNo}~${toNo}): ${e.message}`);
            return { items: [], missing: [], failed: true };
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

    async fetchOneDraw(drawNo, proxyConfig, log = () => {}) {
        const targetUrl = `https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${drawNo}`;
        const internalUrls = [];
        const externalUrls = [];
        const customProxy = proxyConfig?.url || '';

        if (customProxy) {
            if (customProxy.includes('{draw_no}')) {
                internalUrls.push(customProxy.replace('{draw_no}', String(drawNo)));
            } else if (customProxy.includes('/proxy/latest')) {
                if (customProxy.includes('draw_no=')) {
                    internalUrls.push(customProxy.replace(/draw_no=\d*/i, `draw_no=${drawNo}`));
                } else {
                    const delim = customProxy.includes('?') ? '&' : '?';
                    internalUrls.push(`${customProxy}${delim}draw_no=${drawNo}`);
                }
            } else if (customProxy.includes('{url}')) {
                internalUrls.push(customProxy.replace('{url}', encodeURIComponent(targetUrl)));
            } else {
                internalUrls.push(`${customProxy}${encodeURIComponent(targetUrl)}`);
            }
        } else {
            internalUrls.push(`proxy/latest?draw_no=${drawNo}`);
        }

        externalUrls.push(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
        externalUrls.push(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);

        const urls = [...internalUrls, ...externalUrls];
        for (const fetchUrl of urls) {
            const isExternalFallback = externalUrls.includes(fetchUrl);
            if (isExternalFallback) {
                this.logSync('SYNC_FALLBACK_EXTERNAL', `Using external fallback for draw ${drawNo}`, { fetchUrl });
                log(`fallback(external): draw ${drawNo}`);
            }

            try {
                const res = await this.fetchWithTimeout(fetchUrl);
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
                this.logSync('SYNC_FETCH_ONE_FAIL', `Failed single draw fetch ${drawNo}`, { fetchUrl, message: e.message });
            }
        }
        return null;
    }

    buildRangeChunks(fromNo, toNo, chunkSize = this.RANGE_CHUNK_SIZE) {
        const chunks = [];
        for (let start = fromNo; start <= toNo; start += chunkSize) {
            const end = Math.min(start + chunkSize - 1, toNo);
            chunks.push([start, end]);
        }
        return chunks;
    }

    async runWithConcurrency(items, concurrency, handler) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return [];
        const out = new Array(list.length);
        let cursor = 0;

        const worker = async () => {
            while (true) {
                const index = cursor++;
                if (index >= list.length) return;
                out[index] = await handler(list[index], index);
            }
        };

        const workers = Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, () => worker());
        await Promise.all(workers);
        return out;
    }

    async fetchRangeChunkedFromProxy(fromNo, toNo, proxyConfig, log) {
        if (!proxyConfig?.url || fromNo > toNo) {
            return { items: [], missing: new Set(), failedDraws: new Set() };
        }
        const chunks = this.buildRangeChunks(fromNo, toNo, this.RANGE_CHUNK_SIZE);
        const chunkResults = await this.runWithConcurrency(chunks, this.RANGE_CHUNK_CONCURRENCY, async ([start, end]) => {
            return this.fetchRangeFromProxy(start, end, proxyConfig, log);
        });

        const items = [];
        const missing = new Set();
        const failedDraws = new Set();

        chunkResults.forEach((result, idx) => {
            const [start, end] = chunks[idx];
            if (!result || result.failed) {
                for (let no = start; no <= end; no++) failedDraws.add(no);
                return;
            }
            (result.items || []).forEach((item) => items.push(item));
            (result.missing || []).forEach((drawNo) => missing.add(Number(drawNo)));
        });

        return { items, missing, failedDraws };
    }

    async fetchMissingDraws(drawNos, proxyConfig, log) {
        const sorted = [...new Set((drawNos || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
        if (!sorted.length) return [];

        const results = await this.runWithConcurrency(sorted, this.FALLBACK_FETCH_CONCURRENCY, async (drawNo) => {
            log(`?뱻 ${drawNo}?뚯감 ?곗씠???붿껌 以?.. (fallback)`);
            let item = await this.fetchOneDraw(drawNo, proxyConfig, log);
            if (!item) {
                await new Promise((resolve) => setTimeout(resolve, 180));
                item = await this.fetchOneDraw(drawNo, proxyConfig, log);
            }
            if (item) {
                log(`??${drawNo}?뚯감 ?뺣낫 ?꾨즺! (${item.date})`);
                return item;
            }
            log(`?좑툘 ${drawNo}?뚯감 ?곗씠???뺤씤 ?ㅽ뙣 (?쒕쾭 ?묐떟 ?놁쓬 or ?꾩쭅 異붿꺼 ??`);
            return null;
        });

        return results.filter(Boolean);
    }

    async fetchLatestFromAPI(options = {}) {
        if (typeof options === 'boolean') options = { silent: options };
        const profile = this.createSyncProfile(options);
        const silent = profile.silent;
        const logEl = $('#syncLog');
        const btn = $('#syncDataBtn');
        if (logEl && !silent) {
            logEl.style.display = 'block';
            logEl.innerHTML = '';
        }

        const logBuffer = [];
        let logFlushTimer = null;
        const flushLog = () => {
            if (!logEl || silent || !logBuffer.length) return;
            const fragment = document.createDocumentFragment();
            while (logBuffer.length) {
                const line = document.createElement('div');
                line.textContent = logBuffer.shift();
                fragment.appendChild(line);
            }
            logEl.appendChild(fragment);
            logEl.scrollTop = logEl.scrollHeight;
            logFlushTimer = null;
        };
        const scheduleFlush = () => {
            if (logFlushTimer) return;
            logFlushTimer = setTimeout(flushLog, 120);
        };

        const log = (msg, code = 'SYNC_INFO', meta = null) => {
            if (logEl && !silent) {
                logBuffer.push(msg);
                scheduleFlush();
            }
            this.logSync(code, msg, meta);
        };

        if (btn) btn.disabled = true;

        try {
            const latestKnown = this.state.winningStats[0]?.draw_no || 1000;
            const estNo = estimateLatestDrawKST();

            if (latestKnown >= estNo) {
                log('Already up to date.', 'SYNC_UP_TO_DATE');
                if (profile.toast) UIManager.toast('?대? 理쒖떊 ?곗씠?곗엯?덈떎.', 'info');
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                return;
            }

            log(`Sync target range: ${latestKnown + 1} ~ ${estNo}`, 'SYNC_RANGE_START');

            const proxyInput = $('#customProxyUrl');
            if (proxyInput) {
                const typedProxy = proxyInput.value.trim();
                if (typedProxy !== this.state.customProxy) {
                    this.state.customProxy = typedProxy;
                    this.markDirty('settings');
                    this.save();
                }
            }
            const proxyConfig = this.resolveProxyConfig();
            log(`Proxy source: ${proxyConfig.source}`, 'SYNC_PROXY_SOURCE');

            const newItems = [];
            const fetched = new Set();
            if (!proxyConfig?.url) {
                log('No custom proxy configured. Using fallback chain.', 'SYNC_PROXY_NOT_CONFIGURED');
            }

            const chunkResult = await this.fetchRangeChunkedFromProxy(latestKnown + 1, estNo, proxyConfig, log);
            (chunkResult.items || []).forEach((item) => {
                if (!item || fetched.has(item.draw_no)) return;
                fetched.add(item.draw_no);
                newItems.push(item);
            });

            const fallbackTargets = new Set([
                ...(chunkResult.missing || []),
                ...(chunkResult.failedDraws || [])
            ]);
            for (let drawNo = latestKnown + 1; drawNo <= estNo; drawNo++) {
                if (!fetched.has(drawNo)) fallbackTargets.add(drawNo);
            }

            const fallbackItems = await this.fetchMissingDraws([...fallbackTargets], proxyConfig, log);
            fallbackItems.forEach((item) => {
                if (!item || fetched.has(item.draw_no)) return;
                fetched.add(item.draw_no);
                newItems.push(item);
            });

            const updatedCount = newItems.length;

            if (updatedCount > 0) {
                const currentUpdates = this.getLocalUpdates();
                const merged = [...currentUpdates, ...newItems];
                const unique = Array.from(new Map(merged.map(item => [item.draw_no, item])).values());
                this.setLocalUpdates(unique);

                log(`Applied ${updatedCount} draw updates.`, 'SYNC_APPLIED', { updatedCount });
                await this.fetchWinningStats({ notifyTicketSettle: false });
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                await this.app?.refreshCurrentRoute();
                if (profile.toast) UIManager.toast(`${updatedCount}媛??뚯감 ?낅뜲?댄듃 ?꾨즺`, 'success');
            } else {
                log('No new draw data found.', 'SYNC_NO_UPDATE');
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
            }

        } catch (e) {
            log(`Sync error: ${e.message}`, 'SYNC_ERROR', { message: e.message });
            if (profile.toast) UIManager.toast('?숆린??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.', 'error');
        } finally {
            if (logFlushTimer) {
                clearTimeout(logFlushTimer);
                logFlushTimer = null;
            }
            flushLog();
            if (btn) btn.disabled = false;
        }
    }

    addToFavorites(nums) {
        const key = nums.join(',');
        if (this.state.favorites.some(f => f.numbers.join(',') === key)) {
            UIManager.toast('?대? 利먭꺼李얘린???덉뒿?덈떎.', 'warning');
            return false;
        }
        this.state.favorites.unshift({ numbers: nums, date: new Date().toISOString() });
        this.markDirty('fav');
        this.save();
        UIManager.toast('利먭꺼李얘린 ????꾨즺', 'success');
        return true;
    }

    clearFavorites() {
        this.state.favorites = [];
        this.markDirty('fav');
        this.save();
    }

    clearHistory() {
        this.state.history = [];
        this.markDirty('hist');
        this.save();
    }
}

