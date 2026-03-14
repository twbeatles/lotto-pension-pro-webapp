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
            staticLatestDrawNo: 0,
            generated: [],
            customProxy: '',
            aiResults: [],
            analytics: null,
            strategyPrefs: this.getDefaultStrategyPrefs(),
            ticketBook: [],
            campaigns: [],
            strategyPresets: [],
            alertPrefs: this.getDefaultAlertPrefs(),
            syncMeta: this.getDefaultSyncMeta()
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
            presets: false,
            syncMeta: false
        };
        this.localUpdatesCache = null;
        this.RANGE_CHUNK_SIZE = 40;
        this.RANGE_CHUNK_CONCURRENCY = 2;
        this.FALLBACK_FETCH_CONCURRENCY = 3;
        this.SYNC_FETCH_TIMEOUT_MS = 4500;
        this.STORAGE_WARNING_BYTES = 350000;
        this.STORAGE_DANGER_BYTES = 900000;
        this.syncInFlightPromise = null;
        this.syncAbortController = null;
        this.syncCancelable = false;
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

    getDefaultSyncMeta() {
        return {
            mode: 'static_only',
            currentSource: '정적 JSON',
            lastSuccessAt: '',
            lastSuccessDrawNo: 0,
            lastFailureAt: '',
            lastFailureMessage: ''
        };
    }

    mergeSyncMeta(raw) {
        const defaults = this.getDefaultSyncMeta();
        const input = raw && typeof raw === 'object' ? raw : {};
        const lastSuccessDrawNo = Math.max(0, Math.floor(Number(input.lastSuccessDrawNo || 0)));
        return {
            mode: typeof input.mode === 'string' && input.mode.trim() ? input.mode.trim() : defaults.mode,
            currentSource: typeof input.currentSource === 'string' && input.currentSource.trim()
                ? input.currentSource.trim()
                : defaults.currentSource,
            lastSuccessAt: typeof input.lastSuccessAt === 'string' ? input.lastSuccessAt : defaults.lastSuccessAt,
            lastSuccessDrawNo,
            lastFailureAt: typeof input.lastFailureAt === 'string' ? input.lastFailureAt : defaults.lastFailureAt,
            lastFailureMessage: typeof input.lastFailureMessage === 'string'
                ? input.lastFailureMessage.slice(0, 240)
                : defaults.lastFailureMessage
        };
    }

    getSyncMode(proxyConfig = this.resolveProxyConfig()) {
        return proxyConfig?.url ? 'proxy_opt_in' : 'static_only';
    }

    getSyncModeLabel(mode = this.state.syncMeta?.mode) {
        return mode === 'proxy_opt_in' ? '프록시 옵트인' : '정적 JSON 전용';
    }

    getSyncSourceLabel(proxyConfig = this.resolveProxyConfig()) {
        if (proxyConfig?.url) return proxyConfig.source || '사용자 프록시';
        return '정적 JSON';
    }

    isStrategyScope(scope) {
        return ['generator', 'ai', 'backtest'].includes(String(scope || '').trim());
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
            if (!this.isStrategyScope(scope)) return;

            const normalizedRequest = this.normalizeStrategyPresetRequest(scope, request);
            if (!normalizedRequest) return;

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
                request: normalizedRequest,
                createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
                updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()
            });
            byScopeName.add(scopeNameKey);
        });

        return Array.from(byId.values());
    }

    normalizeStrategyPresetRequest(scope, request) {
        if (!this.isStrategyScope(scope)) return null;
        if (!request || typeof request !== 'object') return null;
        const merged = this.mergeStrategyPrefs({ [scope]: request });
        return merged[scope] || null;
    }

    getStrategyPresets(scope = '') {
        const targetScope = String(scope || '').trim();
        const list = this.mergeStrategyPresets(this.state.strategyPresets || []);
        const filtered = targetScope
            ? list.filter((item) => item.scope === targetScope)
            : list;
        return filtered.sort((a, b) => {
            const byUpdated = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
            if (byUpdated !== 0) return byUpdated;
            const byCreated = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            if (byCreated !== 0) return byCreated;
            return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
        });
    }

    getStrategyPresetById(id) {
        if (!id) return null;
        return this.getStrategyPresets().find((item) => item.id === id) || null;
    }

    findStrategyPreset(scope, name) {
        const targetScope = String(scope || '').trim();
        const targetName = String(name || '').trim();
        if (!targetScope || !targetName) return null;
        return this.getStrategyPresets(targetScope).find((item) => item.name === targetName) || null;
    }

    saveStrategyPreset(scope, name, request, description = '') {
        const normalizedScope = String(scope || '').trim();
        const normalizedName = String(name || '').trim().slice(0, 80);
        const normalizedRequest = this.normalizeStrategyPresetRequest(normalizedScope, request);
        if (!this.isStrategyScope(normalizedScope) || !normalizedName || !normalizedRequest) return null;

        const existing = this.findStrategyPreset(normalizedScope, normalizedName);
        const now = new Date().toISOString();
        const nextPreset = existing
            ? {
                ...existing,
                description: String(description || existing.description || '').slice(0, 200),
                request: normalizedRequest,
                updatedAt: now
            }
            : {
                id: this.createId('preset'),
                scope: normalizedScope,
                name: normalizedName,
                description: String(description || '').slice(0, 200),
                request: normalizedRequest,
                createdAt: now,
                updatedAt: now
            };

        const remaining = (this.state.strategyPresets || []).filter((item) => item?.id !== nextPreset.id);
        this.state.strategyPresets = this.mergeStrategyPresets([nextPreset, ...remaining]);
        this.markDirty('presets');
        this.save(true);

        return {
            preset: this.getStrategyPresetById(nextPreset.id),
            replaced: Boolean(existing)
        };
    }

    deleteStrategyPreset(id) {
        const before = (this.state.strategyPresets || []).length;
        this.state.strategyPresets = (this.state.strategyPresets || []).filter((item) => item?.id !== id);
        const removed = before - this.state.strategyPresets.length;
        if (removed > 0) {
            this.markDirty('presets');
            this.save(true);
        }
        return removed > 0;
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
        this.save(true);
    }

    setApp(app) {
        this.app = app;
    }

    setSyncControlsState({ running = false, cancelable = false } = {}) {
        if (typeof document === 'undefined') return;

        const syncBtn = $('#syncDataBtn');
        const refreshBtn = $('#refreshDataBtn');
        const cancelBtn = $('#cancelSyncBtn');

        if (syncBtn) syncBtn.disabled = running;
        if (refreshBtn) refreshBtn.disabled = running;
        if (cancelBtn) {
            cancelBtn.disabled = !running || !cancelable;
            cancelBtn.style.display = running ? 'inline-flex' : 'none';
        }
    }

    createAbortError(message = 'Sync aborted') {
        const err = new Error(message);
        err.name = 'AbortError';
        return err;
    }

    isAbortError(err) {
        if (!err) return false;
        if (err.name === 'AbortError') return true;
        const msg = String(err.message || '');
        return /abort/i.test(msg);
    }

    stableStringify(value) {
        if (value === null || typeof value !== 'object') {
            return JSON.stringify(value);
        }

        if (Array.isArray(value)) {
            const items = value.map((item) => {
                const serialized = this.stableStringify(item);
                return serialized === undefined ? 'null' : serialized;
            });
            return `[${items.join(',')}]`;
        }

        const keys = Object.keys(value).sort();
        const entries = [];
        keys.forEach((key) => {
            const next = value[key];
            if (next === undefined || typeof next === 'function' || typeof next === 'symbol') return;
            const serialized = this.stableStringify(next);
            if (serialized === undefined) return;
            entries.push(`${JSON.stringify(key)}:${serialized}`);
        });
        return `{${entries.join(',')}}`;
    }

    cancelActiveSync() {
        if (!this.syncAbortController || !this.syncCancelable) return false;
        if (this.syncAbortController.signal.aborted) return false;
        this.syncAbortController.abort();
        return true;
    }

    getCustomProxyInput() {
        const proxyInput = $('#customProxyUrl');
        return proxyInput ? proxyInput.value.trim() : '';
    }

    persistSettings() {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(CONFIG.KEYS.SETTINGS, JSON.stringify(this.getSettingsPayload()));
    }

    persistExtendedData() {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(CONFIG.KEYS.TICKET_BOOK, JSON.stringify(this.state.ticketBook));
        localStorage.setItem(CONFIG.KEYS.CAMPAIGNS, JSON.stringify(this.state.campaigns));
        localStorage.setItem(CONFIG.KEYS.ALERT_PREFS, JSON.stringify(this.state.alertPrefs));
        localStorage.setItem(CONFIG.KEYS.STRATEGY_PRESETS, JSON.stringify(this.state.strategyPresets || []));
    }

    persistSyncMeta() {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(CONFIG.KEYS.SYNC_META, JSON.stringify(this.state.syncMeta || this.getDefaultSyncMeta()));
    }

    getSettingsPayload() {
        return {
            theme: this.state.theme,
            customProxy: this.state.customProxy,
            strategyPrefs: this.state.strategyPrefs
        };
    }

    setSyncMeta(next, { immediate = false } = {}) {
        const merged = this.mergeSyncMeta({
            ...(this.state.syncMeta || this.getDefaultSyncMeta()),
            ...(next || {})
        });
        const prevSerialized = JSON.stringify(this.state.syncMeta || this.getDefaultSyncMeta());
        const nextSerialized = JSON.stringify(merged);
        this.state.syncMeta = merged;
        if (prevSerialized !== nextSerialized) {
            this.markDirty('syncMeta');
            this.save(immediate);
        }
        return this.state.syncMeta;
    }

    markSyncSuccess({ drawNo = 0, source = '', mode = this.getSyncMode() } = {}) {
        return this.setSyncMeta({
            mode,
            currentSource: source || this.getSyncSourceLabel(),
            lastSuccessAt: new Date().toISOString(),
            lastSuccessDrawNo: Math.max(0, Math.floor(Number(drawNo || 0))),
            lastFailureAt: '',
            lastFailureMessage: ''
        });
    }

    markSyncFailure(message, { source = '', mode = this.getSyncMode() } = {}) {
        return this.setSyncMeta({
            mode,
            currentSource: source || this.getSyncSourceLabel(),
            lastFailureAt: new Date().toISOString(),
            lastFailureMessage: String(message || '').slice(0, 240)
        });
    }

    getDataFreshness() {
        const latestDrawNo = Math.max(0, Math.floor(Number(this.state.winningStats?.[0]?.draw_no || 0)));
        const staticLatestDrawNo = Math.max(0, Math.floor(Number(this.state.staticLatestDrawNo || 0)));
        const estimatedLatestDrawNo = Math.max(0, Math.floor(Number(estimateLatestDrawKST() || 0)));
        const behindBy = latestDrawNo > 0 && estimatedLatestDrawNo > 0
            ? Math.max(0, estimatedLatestDrawNo - latestDrawNo)
            : 0;
        const staticBehindBy = staticLatestDrawNo > 0 && estimatedLatestDrawNo > 0
            ? Math.max(0, estimatedLatestDrawNo - staticLatestDrawNo)
            : 0;
        const hasProxy = Boolean(this.resolveProxyConfig()?.url);
        return {
            latestDrawNo,
            staticLatestDrawNo,
            estimatedLatestDrawNo,
            behindBy,
            staticBehindBy,
            hasProxy,
            isStale: behindBy > 0
        };
    }

    getStaleDataMessage(featureLabel = '기능') {
        const freshness = this.getDataFreshness();
        if (!freshness.isStale) return '';
        return `${featureLabel}을 계속 진행할 수 있지만 최신 데이터가 ${freshness.behindBy}회차 뒤처져 있을 수 있습니다.`;
    }

    warnIfDataStale(featureLabel = '기능') {
        const message = this.getStaleDataMessage(featureLabel);
        if (message) {
            UIManager.toast(message, 'warning', 4200);
        }
        return this.getDataFreshness();
    }

    getNotificationPermissionState() {
        if (typeof Notification === 'undefined') {
            return { code: 'unsupported', label: '지원 안 함' };
        }
        if (Notification.permission === 'granted') {
            return { code: 'granted', label: '허용됨' };
        }
        if (Notification.permission === 'denied') {
            return { code: 'denied', label: '차단됨' };
        }
        return { code: 'prompt', label: '권한 필요' };
    }

    async requestNotificationPermission() {
        if (typeof Notification === 'undefined') {
            return this.getNotificationPermissionState();
        }
        let permission = Notification.permission;
        if (permission === 'default') {
            try {
                permission = await Notification.requestPermission();
            } catch (e) {
                permission = Notification.permission || 'default';
            }
        }
        if (permission === 'granted') return { code: 'granted', label: '허용됨' };
        if (permission === 'denied') return { code: 'denied', label: '차단됨' };
        return { code: 'prompt', label: '권한 필요' };
    }

    sendSystemNotification(title, body) {
        const permission = this.getNotificationPermissionState();
        if (permission.code !== 'granted') return false;
        try {
            new Notification(title, { body });
            return true;
        } catch (e) {
            console.warn('시스템 알림 전송 실패', e);
            return false;
        }
    }

    sendTestSystemNotification() {
        return this.sendSystemNotification('로또 프로 테스트 알림', '시스템 알림 권한과 연결 상태가 정상입니다.');
    }

    getStorageSummary() {
        if (typeof localStorage === 'undefined') {
            return {
                bytes: 0,
                status: 'normal',
                counts: {
                    favorites: this.state.favorites?.length || 0,
                    history: this.state.history?.length || 0,
                    tickets: this.state.ticketBook?.length || 0,
                    campaigns: this.state.campaigns?.length || 0,
                    presets: this.state.strategyPresets?.length || 0,
                    localUpdates: Array.isArray(this.localUpdatesCache) ? this.localUpdatesCache.length : 0
                },
                warnings: []
            };
        }
        const entries = [
            [CONFIG.KEYS.FAV, this.state.favorites?.length || 0],
            [CONFIG.KEYS.HIST, this.state.history?.length || 0],
            [CONFIG.KEYS.SETTINGS, 1],
            [CONFIG.KEYS.TICKET_BOOK, this.state.ticketBook?.length || 0],
            [CONFIG.KEYS.CAMPAIGNS, this.state.campaigns?.length || 0],
            [CONFIG.KEYS.ALERT_PREFS, 1],
            [CONFIG.KEYS.STRATEGY_PRESETS, this.state.strategyPresets?.length || 0],
            [CONFIG.KEYS.SYNC_META, 1],
            ['lotto_pro_updates_v2', this.getLocalUpdates().length]
        ];
        const bytes = entries.reduce((sum, [key]) => {
            try {
                const raw = localStorage.getItem(key) || '';
                return sum + key.length + raw.length;
            } catch (e) {
                return sum;
            }
        }, 0);

        const counts = {
            favorites: this.state.favorites?.length || 0,
            history: this.state.history?.length || 0,
            tickets: this.state.ticketBook?.length || 0,
            campaigns: this.state.campaigns?.length || 0,
            presets: this.state.strategyPresets?.length || 0,
            localUpdates: this.getLocalUpdates().length
        };

        const warnings = [];
        if (counts.history > 300) warnings.push(`히스토리 ${counts.history}개`);
        if (counts.tickets > 200) warnings.push(`티켓 ${counts.tickets}개`);
        if (counts.campaigns > 60) warnings.push(`캠페인 ${counts.campaigns}개`);
        if (counts.localUpdates > 60) warnings.push(`로컬 업데이트 ${counts.localUpdates}개`);

        let status = 'normal';
        if (bytes >= this.STORAGE_DANGER_BYTES || counts.tickets > 400 || counts.history > 450 || counts.campaigns > 120) {
            status = 'danger';
        } else if (bytes >= this.STORAGE_WARNING_BYTES || warnings.length) {
            status = 'warning';
        }

        return {
            bytes,
            status,
            counts,
            warnings
        };
    }

    getLocalUpdates() {
        if (typeof localStorage === 'undefined') {
            if (!Array.isArray(this.localUpdatesCache)) this.localUpdatesCache = [];
            return this.localUpdatesCache;
        }
        if (Array.isArray(this.localUpdatesCache)) return this.localUpdatesCache;
        const parsed = this.safeJsonParse(localStorage.getItem('lotto_pro_updates_v2') || '[]', []);
        this.localUpdatesCache = Array.isArray(parsed) ? parsed : [];
        return this.localUpdatesCache;
    }

    setLocalUpdates(items = []) {
        this.localUpdatesCache = Array.isArray(items) ? items : [];
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem('lotto_pro_updates_v2', JSON.stringify(this.localUpdatesCache));
    }

    async fetchWithTimeout(url, options = {}, timeoutMs = this.SYNC_FETCH_TIMEOUT_MS, externalSignal = null) {
        return measureAsync('sync.fetch', async () => {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller
                ? setTimeout(() => controller.abort(), timeoutMs)
                : null;
            let onExternalAbort = null;

            try {
                if (controller && externalSignal) {
                    if (externalSignal.aborted) throw this.createAbortError('Sync aborted');
                    onExternalAbort = () => controller.abort();
                    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
                }
                const nextOptions = controller ? { ...options, signal: controller.signal } : options;
                return await fetch(url, nextOptions);
            } finally {
                if (timer) clearTimeout(timer);
                if (externalSignal && onExternalAbort) {
                    externalSignal.removeEventListener('abort', onExternalAbort);
                }
            }
        }, {
            timeoutMs,
            url: String(url).slice(0, 120)
        });
    }

    readLegacyProxyUrl() {
        if (typeof localStorage === 'undefined') return '';
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
        if (legacyProxy) return { source: 'legacy settings (v1)', url: legacyProxy };

        const v2Proxy = (this.state.customProxy || '').trim();
        if (v2Proxy) return { source: 'saved settings (v2)', url: v2Proxy };

        return { source: '미설정', url: '' };
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

    normalizeStoredNumberEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const numbers = this.normalizeNumbers(raw.numbers || []);
        if (numbers.length !== 6) return null;

        const rawDate = typeof raw.date === 'string'
            ? raw.date
            : (typeof raw.created_at === 'string' ? raw.created_at : '');

        return {
            numbers,
            date: rawDate || new Date().toISOString()
        };
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
            campaignId: (typeof raw.campaignId === 'string' && raw.campaignId.trim())
                ? raw.campaignId.trim().slice(0, 120)
                : '',
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
        const normalizedWeeks = Math.max(1, Math.floor(weeks));
        const normalizedSetsPerWeek = Math.max(1, Math.floor(setsPerWeek));
        if (normalizedWeeks > CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS) return null;
        if (normalizedSetsPerWeek > CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK) return null;
        if (normalizedWeeks * normalizedSetsPerWeek > CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS) return null;

        return {
            id: raw.id || this.createId('campaign'),
            name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : 'campaign',
            startDrawNo: Math.max(1, Math.floor(startDrawNo)),
            weeks: normalizedWeeks,
            setsPerWeek: normalizedSetsPerWeek,
            strategyRequest: raw.strategyRequest && typeof raw.strategyRequest === 'object' ? raw.strategyRequest : null,
            createdAt: raw.createdAt || new Date().toISOString()
        };
    }

    buildTicketKey(ticket) {
        if (ticket && typeof ticket.__dedupeKey === 'string') {
            return ticket.__dedupeKey;
        }
        const strategySnapshot = ticket?.strategyRequest ? (this.stableStringify(ticket.strategyRequest) || '-') : '-';
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
            if (typeof localStorage === 'undefined') return;
            let needsPersist = false;
            const rawFavorites = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.FAV) || '[]', []);
            const rawHistory = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.HIST) || '[]', []);

            const normalizedFavorites = Array.isArray(rawFavorites)
                ? rawFavorites.map((x) => this.normalizeStoredNumberEntry(x)).filter(Boolean)
                : [];
            const normalizedHistory = Array.isArray(rawHistory)
                ? rawHistory.map((x) => this.normalizeStoredNumberEntry(x)).filter(Boolean)
                : [];

            if (!Array.isArray(rawFavorites) || JSON.stringify(normalizedFavorites) !== JSON.stringify(rawFavorites)) needsPersist = true;
            if (!Array.isArray(rawHistory) || JSON.stringify(normalizedHistory) !== JSON.stringify(rawHistory)) needsPersist = true;

            this.state.favorites = normalizedFavorites;
            this.state.history = normalizedHistory;

            const settings = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.SETTINGS) || '{}', {});
            this.state.theme = settings.theme === 'light' ? 'light' : 'dark';
            this.state.customProxy = typeof settings.customProxy === 'string' ? settings.customProxy : '';
            this.state.strategyPrefs = this.mergeStrategyPrefs(settings.strategyPrefs);

            const rawTickets = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.TICKET_BOOK) || '[]', []);
            const rawCampaigns = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.CAMPAIGNS) || '[]', []);
            const rawAlertPrefs = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.ALERT_PREFS) || '{}', {});
            const rawStrategyPresets = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.STRATEGY_PRESETS) || '[]', []);
            const rawSyncMeta = this.safeJsonParse(localStorage.getItem(CONFIG.KEYS.SYNC_META) || '{}', {});

            const normalizedTickets = Array.isArray(rawTickets)
                ? rawTickets.map((x) => this.normalizeTicketEntry(x)).filter(Boolean)
                : [];
            const normalizedCampaigns = Array.isArray(rawCampaigns)
                ? rawCampaigns.map((x) => this.normalizeCampaignEntry(x)).filter(Boolean)
                : [];
            const normalizedAlertPrefs = this.mergeAlertPrefs(rawAlertPrefs);
            const normalizedStrategyPresets = this.mergeStrategyPresets(rawStrategyPresets);
            const normalizedSyncMeta = this.mergeSyncMeta(rawSyncMeta);

            if (Array.isArray(rawTickets) && normalizedTickets.length !== rawTickets.length) needsPersist = true;
            if (Array.isArray(rawCampaigns) && normalizedCampaigns.length !== rawCampaigns.length) needsPersist = true;
            if (JSON.stringify(normalizedAlertPrefs) !== JSON.stringify(rawAlertPrefs || {})) needsPersist = true;
            if (Array.isArray(rawStrategyPresets) && normalizedStrategyPresets.length !== rawStrategyPresets.length) needsPersist = true;
            if (JSON.stringify(normalizedSyncMeta) !== JSON.stringify(rawSyncMeta || {})) needsPersist = true;

            this.state.ticketBook = normalizedTickets;
            this.state.campaigns = normalizedCampaigns;
            this.state.alertPrefs = normalizedAlertPrefs;
            this.state.strategyPresets = normalizedStrategyPresets;
            this.state.syncMeta = normalizedSyncMeta;
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
                localStorage.setItem(CONFIG.KEYS.FAV, JSON.stringify(this.state.favorites));
                localStorage.setItem(CONFIG.KEYS.HIST, JSON.stringify(this.state.history));
                this.persistSettings();
                this.persistExtendedData();
                this.persistSyncMeta();
            }

            Object.keys(this._dirtyKeys).forEach((key) => {
                this._dirtyKeys[key] = false;
            });
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
                if (typeof localStorage === 'undefined') return;
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
                if (this._dirtyKeys.syncMeta) {
                    this.persistSyncMeta();
                    this._dirtyKeys.syncMeta = false;
                }
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
            if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
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
        this.save(true);
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
            this.save(true);
            if (!options.silent) UIManager.toast(`${inserted}개 티켓 추가 완료`, 'success');
        }
        return inserted;
    }

    removeTicket(id) {
        const before = this.state.ticketBook.length;
        this.state.ticketBook = this.state.ticketBook.filter((x) => x.id !== id);
        const removed = before - this.state.ticketBook.length;
        if (removed > 0) {
            this.markDirty('ticketBook');
            this.save(true);
        }
        return removed > 0;
    }

    updateTicketMemo(id, memo) {
        const target = this.state.ticketBook.find((x) => x.id === id);
        if (!target) return false;
        target.memo = typeof memo === 'string' ? memo.slice(0, 200) : '';
        this.markDirty('ticketBook');
        this.save(true);
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
            this.save(true);
        }
        return removed;
    }

    addCampaign(entry) {
        const normalized = this.normalizeCampaignEntry(entry);
        if (!normalized) return null;
        this.state.campaigns.unshift(normalized);
        this.markDirty('campaigns');
        this.save(true);
        return normalized;
    }

    countTicketsByCampaignId(campaignId) {
        const targetId = String(campaignId || '').trim();
        if (!targetId) return 0;
        return (this.state.ticketBook || []).filter((ticket) => ticket?.campaignId === targetId).length;
    }

    countTicketsByCampaignIds(campaignIds = []) {
        const ids = new Set((campaignIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        if (!ids.size) return 0;
        return (this.state.ticketBook || []).filter((ticket) => ids.has(String(ticket?.campaignId || '').trim())).length;
    }

    removeCampaign(id, { cascadeTickets = true } = {}) {
        const targetId = String(id || '').trim();
        const campaign = (this.state.campaigns || []).find((item) => item?.id === targetId) || null;
        if (!campaign) {
            return {
                removedCampaign: false,
                removedTickets: 0,
                campaign: null
            };
        }

        const beforeCampaigns = this.state.campaigns.length;
        const beforeTickets = this.state.ticketBook.length;
        this.state.campaigns = this.state.campaigns.filter((item) => item?.id !== targetId);

        let removedTickets = 0;
        if (cascadeTickets) {
            this.state.ticketBook = this.state.ticketBook.filter((ticket) => ticket?.campaignId !== targetId);
            removedTickets = beforeTickets - this.state.ticketBook.length;
        }

        const removedCampaign = beforeCampaigns !== this.state.campaigns.length;
        if (removedCampaign || removedTickets > 0) {
            this.markDirty('campaigns');
            if (removedTickets > 0) this.markDirty('ticketBook');
            this.save(true);
        }

        return {
            removedCampaign,
            removedTickets,
            campaign
        };
    }

    clearCampaigns({ cascadeTickets = true } = {}) {
        const campaignIds = (this.state.campaigns || []).map((item) => item?.id).filter(Boolean);
        const removedCampaigns = campaignIds.length;
        if (!removedCampaigns) {
            return { removedCampaigns: 0, removedTickets: 0 };
        }

        const beforeTickets = this.state.ticketBook.length;
        this.state.campaigns = [];

        let removedTickets = 0;
        if (cascadeTickets) {
            const idSet = new Set(campaignIds.map((item) => String(item)));
            this.state.ticketBook = this.state.ticketBook.filter((ticket) => !idSet.has(String(ticket?.campaignId || '')));
            removedTickets = beforeTickets - this.state.ticketBook.length;
        }

        this.markDirty('campaigns');
        if (removedTickets > 0) this.markDirty('ticketBook');
        this.save(true);
        return { removedCampaigns, removedTickets };
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

        if (requestSystemNotification && prefs.enableSystemNotification) {
            this.sendSystemNotification('로또 프로 티켓 정산', message);
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
            this.save(true);
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
            const normalizedStatic = (Array.isArray(staticData) ? staticData : [])
                .map((row) => this.normalizeDrawItem(row))
                .filter(Boolean)
                .sort((a, b) => b.draw_no - a.draw_no);
            this.state.staticLatestDrawNo = normalizedStatic[0]?.draw_no || 0;

            const localUpdates = this.getLocalUpdates();

            const mergedMap = new Map();
            normalizedStatic.forEach((d) => mergedMap.set(Number(d.draw_no), d));
            localUpdates.forEach(d => mergedMap.set(Number(d.draw_no), d));

            this.state.winningStats = Array.from(mergedMap.values())
                .map((row) => this.normalizeDrawItem(row))
                .filter(Boolean)
                .sort((a, b) => b.draw_no - a.draw_no);
            this.buildAnalyticsCache();

            this.setSyncMeta({
                mode: this.getSyncMode(),
                currentSource: localUpdates.length ? '정적 JSON + 로컬 업데이트' : '정적 JSON'
            });

            await this.settlePendingTickets({ silent: !notifyTicketSettle });

            const freshness = this.getDataFreshness();
            if (freshness.latestDrawNo > 0 && freshness.isStale) {
                updateStatus(`${freshness.behindBy}회차 지연`, 'var(--warning)');
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
            const payload = await res.json();
            const list = Array.isArray(payload?.data) ? payload.data : [];
            const normalized = list.map(item => this.normalizeDrawItem(item)).filter(Boolean);
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

        const normalizedNumbers = (numbers || [])
            .map(Number)
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
            .sort((a, b) => a - b);
        const bonus = Number(raw.bonus ?? raw.bnsWnNo ?? 0);

        const normalized = {
            draw_no: drawNo,
            date,
            numbers: normalizedNumbers,
            bonus,
            prize_amount: Number(raw.prize_amount ?? raw.rnk1WnAmt ?? 0),
            winners_count: Number(raw.winners_count ?? raw.rnk1WnNope ?? 0),
            total_sales: Number(raw.total_sales ?? raw.rlvtEpsdSumNtslAmt ?? 0)
        };
        if (normalized.numbers.length !== 6) return null;
        if (new Set(normalized.numbers).size !== 6) return null;
        if (!Number.isInteger(normalized.bonus) || normalized.bonus < 1 || normalized.bonus > 45) return null;
        if (normalized.numbers.includes(normalized.bonus)) return null;
        return normalized;
    }

    async fetchOneDraw(drawNo, proxyConfig, _log = () => {}, signal = null) {
        const targetUrl = `https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${drawNo}`;
        const internalUrls = [];
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
        }

        const urls = [...internalUrls];
        for (const fetchUrl of urls) {
            if (signal?.aborted) throw this.createAbortError('Sync aborted');
            try {
                const res = await this.fetchWithTimeout(fetchUrl, {}, this.SYNC_FETCH_TIMEOUT_MS, signal);
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
                if (this.isAbortError(e)) throw e;
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

    async fetchRangeChunkedFromProxy(fromNo, toNo, proxyConfig, log, signal = null) {
        if (!proxyConfig?.url || fromNo > toNo) {
            return { items: [], missing: new Set(), failedDraws: new Set() };
        }
        const chunks = this.buildRangeChunks(fromNo, toNo, this.RANGE_CHUNK_SIZE);
        const chunkResults = await this.runWithConcurrency(chunks, this.RANGE_CHUNK_CONCURRENCY, async ([start, end]) => {
            if (signal?.aborted) throw this.createAbortError('Sync aborted');
            return this.fetchRangeFromProxy(start, end, proxyConfig, log, signal);
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

    async fetchMissingDraws(drawNos, proxyConfig, log, signal = null) {
        const sorted = [...new Set((drawNos || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
        if (!sorted.length) return [];

        const results = await this.runWithConcurrency(sorted, this.FALLBACK_FETCH_CONCURRENCY, async (drawNo) => {
            if (signal?.aborted) throw this.createAbortError('Sync aborted');
            log(`- ${drawNo}회차 데이터 요청 중... (fallback)`);
            let item = await this.fetchOneDraw(drawNo, proxyConfig, log, signal);
            if (!item) {
                if (signal?.aborted) throw this.createAbortError('Sync aborted');
                await new Promise((resolve) => setTimeout(resolve, 180));
                item = await this.fetchOneDraw(drawNo, proxyConfig, log, signal);
            }
            if (item) {
                log(`완료: ${drawNo}회차 (${item.date})`);
                return item;
            }
            log(`실패: ${drawNo}회차 데이터 확인 실패 (응답 없음 또는 아직 추첨 전)`);
            return null;
        });

        return results.filter(Boolean);
    }

    async fetchLatestFromAPI(options = {}) {
        if (typeof options === 'boolean') options = { silent: options };
        const profile = this.createSyncProfile(options);

        if (this.syncInFlightPromise) {
            if (profile.toast) UIManager.toast('이미 동기화가 진행 중입니다.', 'info');
            return this.syncInFlightPromise;
        }

        const cancelable = profile.trigger === 'manual';
        this.syncAbortController = cancelable ? new AbortController() : null;
        this.syncCancelable = cancelable;
        this.setSyncControlsState({ running: true, cancelable });

        const task = this._fetchLatestFromAPIInternal(options, this.syncAbortController?.signal || null)
            .catch((e) => {
                if (this.isAbortError(e)) {
                    if (profile.toast) UIManager.toast('동기화를 취소했습니다.', 'info');
                    return false;
                }
                throw e;
            })
            .finally(() => {
                this.syncAbortController = null;
                this.syncCancelable = false;
                this.setSyncControlsState({ running: false, cancelable: false });
                this.syncInFlightPromise = null;
            });

        this.syncInFlightPromise = task;
        return task;
    }

    async _fetchLatestFromAPIInternal(options = {}, abortSignal = null) {
        const profile = this.createSyncProfile(options);
        const silent = profile.silent;
        const logEl = $('#syncLog');
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

        try {
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
            const syncMode = this.getSyncMode(proxyConfig);
            const syncSource = this.getSyncSourceLabel(proxyConfig);
            this.setSyncMeta({
                mode: syncMode,
                currentSource: syncSource
            });

            const latestKnown = this.state.winningStats[0]?.draw_no || 1000;
            const estNo = estimateLatestDrawKST();

            if (latestKnown >= estNo) {
                log('Already up to date.', 'SYNC_UP_TO_DATE');
                if (profile.trigger !== 'idle') {
                    this.markSyncSuccess({
                        drawNo: latestKnown,
                        source: syncSource,
                        mode: syncMode
                    });
                }
                if (profile.toast) UIManager.toast('이미 최신 데이터입니다.', 'info');
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                return true;
            }

            log(`Sync target range: ${latestKnown + 1} ~ ${estNo}`, 'SYNC_RANGE_START');
            log(`Proxy source: ${proxyConfig.source}`, 'SYNC_PROXY_SOURCE');

            if (!proxyConfig?.url) {
                const skipMessage = '프록시 URL이 없어 실시간 최신 회차 동기화를 건너뜁니다.';
                log(skipMessage, 'SYNC_PROXY_NOT_CONFIGURED');
                this.markSyncFailure(skipMessage, {
                    source: syncSource,
                    mode: syncMode
                });
                if (profile.toast) {
                    UIManager.toast('프록시 URL을 설정하면 최신 회차 동기화를 사용할 수 있습니다.', 'info', 3600);
                }
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                return false;
            }

            const newItems = [];
            const fetched = new Set();

            const chunkResult = await this.fetchRangeChunkedFromProxy(
                latestKnown + 1,
                estNo,
                proxyConfig,
                log,
                abortSignal
            );
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

            let fallbackTargetList = [...fallbackTargets]
                .map(Number)
                .filter(Number.isFinite)
                .sort((a, b) => b - a);
            if (fallbackTargetList.length > CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS) {
                log(
                    `Fallback 대상이 ${fallbackTargetList.length}개라 최근 ${CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS}개만 요청합니다.`,
                    'SYNC_FALLBACK_LIMIT'
                );
                fallbackTargetList = fallbackTargetList.slice(0, CONFIG.LIMITS.MAX_SYNC_FALLBACK_DRAWS);
            }

            const fallbackItems = await this.fetchMissingDraws(fallbackTargetList, proxyConfig, log, abortSignal);
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
                this.markSyncSuccess({
                    drawNo: this.state.winningStats[0]?.draw_no || latestKnown,
                    source: syncSource,
                    mode: syncMode
                });
                this.app?.updateLatestWin?.();
                await this.app?.refreshCurrentRoute();
                if (profile.toast) UIManager.toast(`${updatedCount}개 회차 업데이트 완료`, 'success');
            } else {
                log('No new draw data found.', 'SYNC_NO_UPDATE');
                await this.settlePendingTickets({
                    silent: profile.settleSilent,
                    requestSystemNotification: profile.requestSystemNotification
                });
                this.markSyncSuccess({
                    drawNo: latestKnown,
                    source: syncSource,
                    mode: syncMode
                });
            }
            return true;
        } catch (e) {
            if (this.isAbortError(e)) {
                log('Sync cancelled by user.', 'SYNC_ABORT');
                throw e;
            }
            log(`Sync error: ${e.message}`, 'SYNC_ERROR', { message: e.message });
            this.markSyncFailure(e.message, {
                source: this.getSyncSourceLabel(),
                mode: this.getSyncMode()
            });
            if (profile.toast) UIManager.toast('동기화 중 오류가 발생했습니다.', 'error');
            return false;
        } finally {
            if (logFlushTimer) {
                clearTimeout(logFlushTimer);
                logFlushTimer = null;
            }
            flushLog();
        }
    }

    addToFavorites(nums) {
        const key = nums.join(',');
        if (this.state.favorites.some(f => f.numbers.join(',') === key)) {
            UIManager.toast('이미 즐겨찾기에 있습니다.', 'warning');
            return false;
        }
        this.state.favorites.unshift({ numbers: nums, date: new Date().toISOString() });
        this.markDirty('fav');
        this.save(true);
        UIManager.toast('즐겨찾기 추가 완료', 'success');
        return true;
    }

    clearFavorites() {
        this.state.favorites = [];
        this.markDirty('fav');
        this.save(true);
    }

    clearHistory() {
        this.state.history = [];
        this.markDirty('hist');
        this.save(true);
    }
}

