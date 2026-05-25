import { CONFIG } from '../../../utils/config.js';
import { UIManager } from '../../UIManager.js';

const STORAGE_SYNC_CHANNEL = 'lotto-data-sync';
const APP_OWNED_STORAGE_KEYS = new Set([
    CONFIG.KEYS.FAV,
    CONFIG.KEYS.HIST,
    CONFIG.KEYS.SETTINGS,
    CONFIG.KEYS.TICKET_BOOK,
    CONFIG.KEYS.CAMPAIGNS,
    CONFIG.KEYS.ALERT_PREFS,
    CONFIG.KEYS.STRATEGY_PRESETS,
    CONFIG.KEYS.SYNC_META,
    CONFIG.KEYS.LOCAL_UPDATES,
    CONFIG.KEYS.PENSION720_STATS_CACHE,
    CONFIG.KEYS.PENSION720_TICKETS,
    CONFIG.KEYS.PENSION720_CAMPAIGNS
]);

function createTabInstanceId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `tab_${crypto.randomUUID()}`;
    }
    return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getUtf8ByteLength(value = '') {
    const text = String(value || '');
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(text).length;
    }
    return unescape(encodeURIComponent(text)).length;
}

export const dataPersistenceStorageMethods = {
    getTabInstanceId() {
        if (!this._tabInstanceId) {
            this._tabInstanceId = createTabInstanceId();
        }
        return this._tabInstanceId;
    },

    isAppOwnedStorageKey(key = '') {
        return APP_OWNED_STORAGE_KEYS.has(String(key || '').trim());
    },

    runWithBroadcastSuppressed(task) {
        const previous = this._suppressCrossTabBroadcast === true;
        this._suppressCrossTabBroadcast = true;
        try {
            return typeof task === 'function' ? task() : undefined;
        } finally {
            this._suppressCrossTabBroadcast = previous;
        }
    },

    initCrossTabSync() {
        if (this._crossTabSyncBound || typeof window === 'undefined') return;

        this.getTabInstanceId();

        try {
            if (typeof BroadcastChannel !== 'undefined') {
                this._crossTabChannel = new BroadcastChannel(STORAGE_SYNC_CHANNEL);
                this._crossTabChannel.addEventListener('message', (event) => {
                    const payload = event?.data || {};
                    if (payload.type !== 'APP_STATE_SYNC') return;
                    if (payload.senderId === this.getTabInstanceId()) return;
                    const keys = Array.isArray(payload.keys)
                        ? payload.keys.filter((key) => this.isAppOwnedStorageKey(key))
                        : [];
                    if (!keys.length) return;
                    this.app?.handleRemotePersistenceSync?.({
                        keys,
                        source: 'broadcast'
                    });
                });
            }
        } catch (_e) {
            this._crossTabChannel = null;
        }

        this._crossTabStorageHandler = (event) => {
            const key = String(event?.key || '').trim();
            if (!key || !this.isAppOwnedStorageKey(key)) return;
            if (typeof localStorage !== 'undefined' && event?.storageArea && event.storageArea !== localStorage) return;
            this.app?.handleRemotePersistenceSync?.({
                keys: [key],
                source: 'storage'
            });
        };
        window.addEventListener('storage', this._crossTabStorageHandler);
        this._crossTabSyncBound = true;
    },

    notifyCrossTabStateChange({ keys = [] } = {}) {
        if (this._suppressCrossTabBroadcast) return;
        const normalizedKeys = [
            ...new Set(
                (Array.isArray(keys) ? keys : [])
                    .map((key) => String(key || '').trim())
                    .filter((key) => this.isAppOwnedStorageKey(key))
            )
        ];
        if (!normalizedKeys.length) return;

        try {
            this._crossTabChannel?.postMessage({
                type: 'APP_STATE_SYNC',
                senderId: this.getTabInstanceId(),
                keys: normalizedKeys,
                updatedAt: Date.now()
            });
        } catch (_e) {
            // BroadcastChannel delivery failure should not block persistence.
        }
    },

    _safeSetItem(key, value, options = {}) {
        try {
            const previousValue = localStorage.getItem(key);
            if (previousValue === value) {
                this._recordStorageWriteSuccess?.(key);
                return true;
            }
            localStorage.setItem(key, value);
            this._recordStorageWriteSuccess?.(key);
            if (!options?.suppressBroadcast && this.isAppOwnedStorageKey(key)) {
                this.notifyCrossTabStateChange({ keys: [key] });
            }
            return true;
        } catch (e) {
            this._recordStorageWriteFailure?.(key, e);
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                console.error(`[persistence] localStorage 저장 공간 초과 (${key})`, e);
                UIManager.toast('저장 공간이 가득 찼습니다. 데이터를 정리해 주세요.', 'error');
            } else {
                console.error(`[persistence] localStorage 저장 실패 (${key})`, e);
            }
            return false;
        }
    },

    _recordStorageWriteSuccess(key) {
        if (!this._lastStorageWriteFailures) this._lastStorageWriteFailures = new Map();
        this._lastStorageWriteFailures.delete(String(key || ''));
    },

    _recordStorageWriteFailure(key, error) {
        if (!this._lastStorageWriteFailures) this._lastStorageWriteFailures = new Map();
        const storageKey = String(key || '');
        this._lastStorageWriteFailures.set(storageKey, {
            key: storageKey,
            name: String(error?.name || 'StorageError'),
            message: String(error?.message || error || '').slice(0, 240),
            failedAt: new Date().toISOString()
        });
    },

    getStorageWriteFailures() {
        if (!this._lastStorageWriteFailures) return [];
        return [...this._lastStorageWriteFailures.values()].sort((a, b) =>
            String(b.failedAt || '').localeCompare(String(a.failedAt || ''))
        );
    },

    normalizeAiResultSet(raw) {
        const numbers = this.normalizeNumbers(raw || []);
        return numbers.length === 6 ? numbers : null;
    },

    normalizePension720Result(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const group = Math.floor(Number(raw.group || 0));
        const number = String(raw.number || '').trim();
        if (!Number.isInteger(group) || group < 1 || group > 5 || !/^\d{6}$/.test(number)) return null;
        return {
            group,
            number,
            score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
            reasons: Array.isArray(raw.reasons) ? raw.reasons.map((item) => String(item).slice(0, 80)).slice(0, 8) : [],
            expansionGroups: Array.isArray(raw.expansionGroups)
                ? raw.expansionGroups
                      .map((item) => Math.floor(Number(item)))
                      .filter((item) => item >= 1 && item <= 5)
                      .slice(0, 4)
                : []
        };
    },

    getTemporaryResultsPayload() {
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            generated: this.getGeneratedEntries?.() || [],
            aiResults: (Array.isArray(this.state.aiResults) ? this.state.aiResults : [])
                .map((item) => this.normalizeAiResultSet(item))
                .filter(Boolean)
                .slice(0, 20),
            pension720Results: (Array.isArray(this.state.pension720Results) ? this.state.pension720Results : [])
                .map((item) => this.normalizePension720Result(item))
                .filter(Boolean)
                .slice(0, 20)
        };
    },

    loadTemporaryResultsFromSession() {
        if (typeof sessionStorage === 'undefined') return false;
        try {
            const raw = sessionStorage.getItem(CONFIG.KEYS.SESSION_RESULTS_STATE);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            if (Number(parsed?.version || 0) !== 1) return false;
            this.state.generated = (Array.isArray(parsed.generated) ? parsed.generated : [])
                .map((entry) => this.normalizeGeneratedEntry(entry))
                .filter(Boolean)
                .slice(0, 20);
            this.state.aiResults = (Array.isArray(parsed.aiResults) ? parsed.aiResults : [])
                .map((item) => this.normalizeAiResultSet(item))
                .filter(Boolean)
                .slice(0, 20);
            this.state.pension720Results = (Array.isArray(parsed.pension720Results) ? parsed.pension720Results : [])
                .map((item) => this.normalizePension720Result(item))
                .filter(Boolean)
                .slice(0, 20);
            return true;
        } catch (_e) {
            return false;
        }
    },

    persistTemporaryResultsToSession() {
        if (typeof sessionStorage === 'undefined') return false;
        try {
            const payload = this.getTemporaryResultsPayload();
            sessionStorage.setItem(CONFIG.KEYS.SESSION_RESULTS_STATE, JSON.stringify(payload));
            return true;
        } catch (_e) {
            return false;
        }
    },

    persistSettings() {
        if (typeof localStorage === 'undefined') return true;
        return this._safeSetItem(CONFIG.KEYS.SETTINGS, JSON.stringify(this.getSettingsPayload()));
    },

    persistExtendedData() {
        if (typeof localStorage === 'undefined') return true;
        const results = [
            this._safeSetItem(CONFIG.KEYS.TICKET_BOOK, JSON.stringify(this.state.ticketBook)),
            this._safeSetItem(CONFIG.KEYS.CAMPAIGNS, JSON.stringify(this.state.campaigns)),
            this._safeSetItem(CONFIG.KEYS.ALERT_PREFS, JSON.stringify(this.state.alertPrefs)),
            this._safeSetItem(CONFIG.KEYS.STRATEGY_PRESETS, JSON.stringify(this.state.strategyPresets || [])),
            this._safeSetItem(CONFIG.KEYS.PENSION720_TICKETS, JSON.stringify(this.state.pension720Tickets || [])),
            this._safeSetItem(CONFIG.KEYS.PENSION720_CAMPAIGNS, JSON.stringify(this.state.pension720Campaigns || []))
        ];
        return results.every(Boolean);
    },

    persistSyncMeta() {
        if (typeof localStorage === 'undefined') return true;
        return this._safeSetItem(
            CONFIG.KEYS.SYNC_META,
            JSON.stringify(this.state.syncMeta || this.getDefaultSyncMeta())
        );
    },

    getSettingsPayload() {
        return {
            theme: this.state.theme,
            customProxy: this.state.customProxy,
            strategyPrefs: this.state.strategyPrefs
        };
    },

    getStorageSummary() {
        if (typeof localStorage === 'undefined') {
            return {
                bytes: 0,
                status: 'normal',
                counts: {
                    favorites: this.state.favorites?.length || 0,
                    history: this.state.history?.length || 0,
                    tickets: this.getTotalTicketCount(),
                    campaigns: this.state.campaigns?.length || 0,
                    presets: this.state.strategyPresets?.length || 0,
                    pension720Tickets: this.state.pension720Tickets?.length || 0,
                    pension720Campaigns: this.state.pension720Campaigns?.length || 0,
                    localUpdates: Array.isArray(this.localUpdatesCache) ? this.localUpdatesCache.length : 0
                },
                warnings: [],
                storageFailures: this.getStorageWriteFailures?.() || []
            };
        }
        const entries = [
            [CONFIG.KEYS.FAV, this.state.favorites?.length || 0],
            [CONFIG.KEYS.HIST, this.state.history?.length || 0],
            [CONFIG.KEYS.SETTINGS, 1],
            [CONFIG.KEYS.TICKET_BOOK, this.getTotalTicketCount()],
            [CONFIG.KEYS.CAMPAIGNS, this.state.campaigns?.length || 0],
            [CONFIG.KEYS.ALERT_PREFS, 1],
            [CONFIG.KEYS.STRATEGY_PRESETS, this.state.strategyPresets?.length || 0],
            [CONFIG.KEYS.SYNC_META, 1],
            [CONFIG.KEYS.LOCAL_UPDATES, this.getLocalUpdates().length],
            [CONFIG.KEYS.PENSION720_TICKETS, this.state.pension720Tickets?.length || 0],
            [CONFIG.KEYS.PENSION720_CAMPAIGNS, this.state.pension720Campaigns?.length || 0]
        ];
        const bytes = entries.reduce((sum, [key]) => {
            try {
                const raw = localStorage.getItem(key) || '';
                return sum + getUtf8ByteLength(key) + getUtf8ByteLength(raw);
            } catch (_e) {
                return sum;
            }
        }, 0);

        const counts = {
            favorites: this.state.favorites?.length || 0,
            history: this.state.history?.length || 0,
            tickets: this.getTotalTicketCount(),
            campaigns: this.state.campaigns?.length || 0,
            presets: this.state.strategyPresets?.length || 0,
            pension720Tickets: this.state.pension720Tickets?.length || 0,
            pension720Campaigns: this.state.pension720Campaigns?.length || 0,
            localUpdates: this.getLocalUpdates().length
        };

        const warnings = [];
        const storageFailures = this.getStorageWriteFailures?.() || [];
        if (counts.history > 300) warnings.push(`히스토리 ${counts.history}개`);
        if (counts.tickets > 200) warnings.push(`티켓 ${counts.tickets}개`);
        if (counts.pension720Tickets > 200) warnings.push(`연금복권 저장 ${counts.pension720Tickets}개`);
        if (counts.pension720Campaigns > 60) warnings.push(`연금복권 캠페인 ${counts.pension720Campaigns}개`);
        if (counts.campaigns > 60) warnings.push(`캠페인 ${counts.campaigns}개`);
        if (counts.localUpdates > 60) warnings.push(`로컬 업데이트 ${counts.localUpdates}개`);

        if (storageFailures.length) warnings.push(`storage write failed ${storageFailures.length}`);

        let status = 'normal';
        if (
            bytes >= this.STORAGE_DANGER_BYTES ||
            storageFailures.length ||
            counts.tickets > 400 ||
            counts.history > 450 ||
            counts.campaigns > 120
        ) {
            status = 'danger';
        } else if (bytes >= this.STORAGE_WARNING_BYTES || warnings.length) {
            status = 'warning';
        }

        return {
            bytes,
            status,
            counts,
            warnings,
            storageFailures
        };
    },

    safeJsonParse(raw, fallback, label = '') {
        try {
            return JSON.parse(raw);
        } catch (e) {
            if (label) console.warn(`[persistence] 손상된 데이터 감지 (${label}), 기본값으로 복구합니다.`, e);
            return fallback;
        }
    },

    _checkStorageQuotaWarning() {
        if (this._quotaWarnShown) return;
        try {
            const summary = this.getStorageSummary();
            if (summary.bytes >= this.STORAGE_DANGER_BYTES) {
                this._quotaWarnShown = true;
                UIManager.toast('저장 공간이 위험 수준입니다. 백업 후 오래된 데이터를 정리해 주세요.', 'error');
            } else if (summary.bytes >= this.STORAGE_WARNING_BYTES && !this._quotaWarnShownWeak) {
                this._quotaWarnShownWeak = true;
                UIManager.toast('저장 공간 사용량이 증가하고 있습니다. 설정에서 확인해 주세요.', 'warning');
            }
        } catch (_e) {
            // 경고 실패는 조용히 무시
        }
    }
};
