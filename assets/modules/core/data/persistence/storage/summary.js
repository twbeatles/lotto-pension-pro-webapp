import { CONFIG } from '../../../../utils/config.js';
import { getUtf8ByteLength } from './constants.js';

export const dataPersistenceStorageSummaryMethods = {
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
    }
};