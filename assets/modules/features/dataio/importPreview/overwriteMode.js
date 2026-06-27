import { countStoredItems, safeClone } from '../importHelpers.js';
import { capImportHistory } from './historyCap.js';

export function buildOverwriteImportPreview(ctx, incoming, importOptions) {
    const current = ctx.data.state;
    const incomingTicketTotal = ctx.data.getTotalTicketCount(incoming.tickets);
    const appliedSettings = ctx.describeAppliedSettings(importOptions);

    const campaignCleanup = ctx.pruneCampaignsWithoutTickets(safeClone(incoming.campaigns), safeClone(incoming.tickets));
    const pension720CampaignCleanup = ctx.prunePension720CampaignsWithoutTickets(
        safeClone(incoming.pension720Campaigns),
        safeClone(incoming.pension720Tickets)
    );
    const added = countStoredItems({
        favorites: incoming.favorites,
        history: incoming.history,
        ticketTotal: incomingTicketTotal,
        campaigns: campaignCleanup.campaigns,
        pension720Tickets: incoming.pension720Tickets,
        pension720Campaigns: pension720CampaignCleanup.campaigns,
        localUpdates: incoming.localUpdates,
        presets: incoming.strategyPresets
    });
    const cleaned = campaignCleanup.removed.length + pension720CampaignCleanup.removed.length;
    const historyCap = capImportHistory(incoming.history);

    return {
        mode: 'overwrite',
        incoming,
        importOptions,
        preview: {
            added,
            duplicate: 0,
            skipped: cleaned,
            cleaned,
            futureDropped: incoming.futureDropped,
            appliedSettings,
            projectedTicketTotal: incomingTicketTotal,
            projectedHistoryCount: historyCap.items.length,
            historyTrimmed: historyCap.trimmed,
            droppedInvalidProxy: Boolean(importOptions.applyProxy && incoming.droppedInvalidProxy)
        },
        next: {
            favorites: incoming.favorites,
            history: historyCap.items,
            tickets: incoming.tickets,
            campaigns: campaignCleanup.campaigns,
            pension720Tickets: incoming.pension720Tickets,
            pension720Campaigns: pension720CampaignCleanup.campaigns,
            localUpdates: incoming.localUpdates,
            strategyPresets: incoming.strategyPresets,
            alertPrefs: importOptions.applyAlerts ? incoming.alertPrefs : current.alertPrefs,
            theme: importOptions.applyTheme ? incoming.theme : current.theme,
            proxy: importOptions.applyProxy ? incoming.proxy : current.customProxy,
            strategyPrefs:
                importOptions.applyStrategyPrefs && incoming.strategyPrefs
                    ? ctx.data.mergeStrategyPrefs(incoming.strategyPrefs)
                    : current.strategyPrefs
        }
    };
}