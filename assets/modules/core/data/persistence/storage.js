import { CONFIG } from '../../../utils/config.js';
import { UIManager } from '../../UIManager.js';

export const dataPersistenceStorageMethods = {
    _safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                console.error(`[persistence] localStorage 저장 공간 초과 (${key})`, e);
                UIManager.toast('저장 공간이 가득 찼습니다. 데이터를 정리해 주세요.', 'error');
            } else {
                console.error(`[persistence] localStorage 저장 실패 (${key})`, e);
            }
        }
    },

    persistSettings() {
        if (typeof localStorage === 'undefined') return;
        this._safeSetItem(CONFIG.KEYS.SETTINGS, JSON.stringify(this.getSettingsPayload()));
    },

    persistExtendedData() {
        if (typeof localStorage === 'undefined') return;
        this._safeSetItem(CONFIG.KEYS.TICKET_BOOK, JSON.stringify(this.state.ticketBook));
        this._safeSetItem(CONFIG.KEYS.CAMPAIGNS, JSON.stringify(this.state.campaigns));
        this._safeSetItem(CONFIG.KEYS.ALERT_PREFS, JSON.stringify(this.state.alertPrefs));
        this._safeSetItem(CONFIG.KEYS.STRATEGY_PRESETS, JSON.stringify(this.state.strategyPresets || []));
    },

    persistSyncMeta() {
        if (typeof localStorage === 'undefined') return;
        this._safeSetItem(CONFIG.KEYS.SYNC_META, JSON.stringify(this.state.syncMeta || this.getDefaultSyncMeta()));
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
                    localUpdates: Array.isArray(this.localUpdatesCache) ? this.localUpdatesCache.length : 0
                },
                warnings: []
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
            [CONFIG.KEYS.LOCAL_UPDATES, this.getLocalUpdates().length]
        ];
        const bytes = entries.reduce((sum, [key]) => {
            try {
                const raw = localStorage.getItem(key) || '';
                return sum + key.length + raw.length;
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
