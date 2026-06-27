import { toArray, toObject } from './helpers.js';
import {
    dedupeDrawUpdates,
    dedupePresets,
    dedupePension720Tickets,
    dedupePension720Campaigns
} from './normalizers.js';

const BACKUP_VERSION = 5;

export function buildBackupPayload(state = {}, extras = {}) {
    const safeState = toObject(state, {});
    const settings = {
        theme: safeState.theme === 'light' ? 'light' : 'dark',
        customProxy: typeof safeState.customProxy === 'string' ? safeState.customProxy : '',
        strategyPrefs: toObject(safeState.strategyPrefs, {})
    };

    return {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        favorites: toArray(safeState.favorites),
        history: toArray(safeState.history),
        ticketBook: toArray(safeState.ticketBook),
        campaigns: toArray(safeState.campaigns),
        pension720Tickets: dedupePension720Tickets(toArray(safeState.pension720Tickets)),
        pension720Campaigns: dedupePension720Campaigns(toArray(safeState.pension720Campaigns)),
        alertPrefs: toObject(safeState.alertPrefs, {}),
        settings,
        localUpdates: dedupeDrawUpdates(toArray(extras.localUpdates)),
        strategyPresets: dedupePresets(toArray(extras.strategyPresets ?? safeState.strategyPresets))
    };
}