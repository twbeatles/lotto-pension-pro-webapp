import { toArray, toObject } from './helpers.js';
import {
    dedupeDrawUpdates,
    dedupePresets,
    dedupePension720Tickets,
    dedupePension720Campaigns
} from './normalizers.js';

export function normalizeBackupPayload(raw) {
    const source = toObject(raw, null);
    if (!source) return null;

    const version = Number(source.version || 1);
    if (![1, 2, 3, 4, 5].includes(version)) return null;

    const settings = toObject(source.settings, {});
    return {
        version,
        favorites: toArray(source.favorites),
        history: toArray(source.history),
        ticketBook: version >= 2 ? toArray(source.ticketBook) : [],
        campaigns: version >= 2 ? toArray(source.campaigns) : [],
        pension720Tickets: version >= 4 ? dedupePension720Tickets(toArray(source.pension720Tickets)) : [],
        pension720Campaigns: version >= 5 ? dedupePension720Campaigns(toArray(source.pension720Campaigns)) : [],
        alertPrefs: version >= 2 ? toObject(source.alertPrefs, {}) : {},
        settings: {
            theme: settings.theme,
            customProxy: settings.customProxy,
            strategyPrefs: settings.strategyPrefs
        },
        localUpdates: version >= 3 ? dedupeDrawUpdates(toArray(source.localUpdates)) : [],
        strategyPresets: version >= 3 ? dedupePresets(toArray(source.strategyPresets)) : []
    };
}