import { CONFIG } from '../../utils/config.js';
import { UIManager } from '../UIManager.js';
export const dataPersistenceMethods = {
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
        } catch (e) {
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

    persistSettings() {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(CONFIG.KEYS.SETTINGS, JSON.stringify(this.getSettingsPayload()));
    },

    persistExtendedData() {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(CONFIG.KEYS.TICKET_BOOK, JSON.stringify(this.state.ticketBook));
        localStorage.setItem(CONFIG.KEYS.CAMPAIGNS, JSON.stringify(this.state.campaigns));
        localStorage.setItem(CONFIG.KEYS.ALERT_PREFS, JSON.stringify(this.state.alertPrefs));
        localStorage.setItem(CONFIG.KEYS.STRATEGY_PRESETS, JSON.stringify(this.state.strategyPresets || []));
    },

    persistSyncMeta() {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(CONFIG.KEYS.SYNC_META, JSON.stringify(this.state.syncMeta || this.getDefaultSyncMeta()));
    },

    getSettingsPayload() {
        return {
            theme: this.state.theme,
            customProxy: this.state.customProxy,
            strategyPrefs: this.state.strategyPrefs
        };
    },

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
        this.app?.renderSettingsPanel?.();
        return this.state.syncMeta;
    },

    markSyncSuccess({ drawNo = 0, source = '', mode = this.getSyncMode() } = {}) {
        return this.setSyncMeta({
            mode,
            currentSource: source || this.getSyncSourceLabel(),
            lastSuccessAt: new Date().toISOString(),
            lastSuccessDrawNo: Math.max(0, Math.floor(Number(drawNo || 0))),
            lastFailureAt: '',
            lastFailureMessage: ''
        });
    },

    markSyncFailure(message, { source = '', mode = this.getSyncMode() } = {}) {
        return this.setSyncMeta({
            mode,
            currentSource: source || this.getSyncSourceLabel(),
            lastFailureAt: new Date().toISOString(),
            lastFailureMessage: String(message || '').slice(0, 240)
        });
    },

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
    },

    getLocalUpdates() {
        if (typeof localStorage === 'undefined') {
            if (!Array.isArray(this.localUpdatesCache)) this.localUpdatesCache = [];
            return this.localUpdatesCache;
        }
        if (Array.isArray(this.localUpdatesCache)) return this.localUpdatesCache;
        const parsed = this.safeJsonParse(localStorage.getItem('lotto_pro_updates_v2') || '[]', []);
        this.localUpdatesCache = Array.isArray(parsed) ? parsed : [];
        return this.localUpdatesCache;
    },

    setLocalUpdates(items = []) {
        this.localUpdatesCache = Array.isArray(items) ? items : [];
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('lotto_pro_updates_v2', JSON.stringify(this.localUpdatesCache));
        }
        this.app?.renderSettingsPanel?.();
    },

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
    },

    getQueryProxyUrl() {
        try {
            const params = new URLSearchParams(window.location.search);
            const proxyUrl = (params.get('proxyUrl') || '').trim();
            if (proxyUrl) return this.buildProxyConfig('URL 쿼리(proxyUrl)', proxyUrl);
            const proxy = (params.get('proxy') || '').trim();
            if (proxy) return this.buildProxyConfig('URL 쿼리(proxy)', proxy);
        } catch (e) {
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
    },

    safeJsonParse(raw, fallback) {
        try {
            return JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    },

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
    },

    save(immediate = false) {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }

        const executeSave = () => {
            try {
                if (typeof localStorage === 'undefined') return;

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
};
