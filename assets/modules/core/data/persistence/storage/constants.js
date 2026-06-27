import { CONFIG } from '../../../../utils/config.js';

export const STORAGE_SYNC_CHANNEL = 'lotto-data-sync';
export const APP_OWNED_STORAGE_KEYS = new Set([
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

export function createTabInstanceId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `tab_${crypto.randomUUID()}`;
    }
    return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getUtf8ByteLength(value = '') {
    const text = String(value || '');
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(text).length;
    }
    return unescape(encodeURIComponent(text)).length;
}