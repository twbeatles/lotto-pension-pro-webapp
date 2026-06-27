import { countStoredItems, safeClone } from '../importHelpers.js';
import { capImportHistory } from './historyCap.js';

export function buildMergeImportPreview(ctx, incoming, importOptions) {
    const current = ctx.data.state;
    const incomingTicketTotal = ctx.data.getTotalTicketCount(incoming.tickets);
    const appliedSettings = ctx.describeAppliedSettings(importOptions);
    const before = {
        favorites: current.favorites?.length || 0,
        history: current.history?.length || 0,
        ticketTotal: ctx.data.getTotalTicketCount(),
        campaigns: current.campaigns?.length || 0,
        pension720Tickets: current.pension720Tickets?.length || 0,
        pension720Campaigns: current.pension720Campaigns?.length || 0,
        localUpdates: ctx.data.getLocalUpdates().length,
        presets: current.strategyPresets?.length || 0
    };
    const incomingTotal = countStoredItems({
        favorites: incoming.favorites,
        history: incoming.history,
        ticketTotal: incomingTicketTotal,
        campaigns: incoming.campaigns,
        pension720Tickets: incoming.pension720Tickets,
        pension720Campaigns: incoming.pension720Campaigns,
        localUpdates: incoming.localUpdates,
        presets: incoming.strategyPresets
    });

    const beforeCampaignIds = new Set(
        (current.campaigns || []).map((item) => String(item?.id || '').trim()).filter(Boolean)
    );
    const incomingCampaignIds = new Set(
        incoming.campaigns.map((item) => String(item?.id || '').trim()).filter(Boolean)
    );
    const beforePension720CampaignIds = new Set(
        (current.pension720Campaigns || []).map((item) => String(item?.id || '').trim()).filter(Boolean)
    );
    const incomingPension720CampaignIds = new Set(
        incoming.pension720Campaigns.map((item) => String(item?.id || '').trim()).filter(Boolean)
    );
    const nextFavorites = ctx.mergeByNumbers(safeClone(current.favorites || []), safeClone(incoming.favorites));
    const nextHistory = ctx.mergeHistoryEntries(safeClone(current.history || []), safeClone(incoming.history));
    const nextTickets = ctx.mergeTickets(safeClone(current.ticketBook || []), safeClone(incoming.tickets));
    const rawCampaigns = ctx.mergeCampaigns(safeClone(current.campaigns || []), safeClone(incoming.campaigns));
    const campaignCleanup = ctx.pruneCampaignsWithoutTickets(rawCampaigns, nextTickets, incomingCampaignIds);
    const nextPension720Tickets = ctx.mergePension720Tickets(
        safeClone(current.pension720Tickets || []),
        safeClone(incoming.pension720Tickets)
    );
    const rawPension720Campaigns = ctx.mergePension720Campaigns(
        safeClone(current.pension720Campaigns || []),
        safeClone(incoming.pension720Campaigns)
    );
    const pension720CampaignCleanup = ctx.prunePension720CampaignsWithoutTickets(
        rawPension720Campaigns,
        nextPension720Tickets,
        incomingPension720CampaignIds
    );
    const mergedLocalUpdates = ctx.mergeLocalUpdates(
        safeClone(ctx.data.getLocalUpdates({ warningMode: 'manual' })),
        safeClone(incoming.localUpdates)
    );
    const localUpdateResult = ctx.normalizeLocalUpdates(mergedLocalUpdates);
    const nextPresets = ctx.mergeStrategyPresets(
        safeClone(current.strategyPresets || []),
        safeClone(incoming.strategyPresets)
    );
    const historyCap = capImportHistory(nextHistory);
    const newCampaigns = campaignCleanup.campaigns.filter((item) => {
        const campaignId = String(item?.id || '').trim();
        return campaignId && !beforeCampaignIds.has(campaignId);
    }).length;
    const newPension720Campaigns = pension720CampaignCleanup.campaigns.filter((item) => {
        const campaignId = String(item?.id || '').trim();
        return campaignId && !beforePension720CampaignIds.has(campaignId);
    }).length;
    const added =
        nextFavorites.length -
        before.favorites +
        (nextHistory.length - before.history) +
        (ctx.data.getTotalTicketCount(nextTickets) - before.ticketTotal) +
        newCampaigns +
        (nextPension720Tickets.length - before.pension720Tickets) +
        newPension720Campaigns +
        (localUpdateResult.items.length - before.localUpdates) +
        (nextPresets.length - before.presets);
    const cleaned = campaignCleanup.removed.length + pension720CampaignCleanup.removed.length;
    const skipped = cleaned;
    const duplicate = Math.max(incomingTotal - added - skipped, 0);

    return {
        mode: 'merge',
        incoming,
        importOptions,
        preview: {
            added,
            duplicate,
            skipped,
            cleaned,
            futureDropped: incoming.futureDropped,
            appliedSettings,
            projectedTicketTotal: ctx.data.getTotalTicketCount(nextTickets),
            projectedHistoryCount: historyCap.items.length,
            historyTrimmed: historyCap.trimmed,
            droppedInvalidProxy: Boolean(importOptions.applyProxy && incoming.droppedInvalidProxy)
        },
        next: {
            favorites: nextFavorites,
            history: historyCap.items,
            tickets: nextTickets,
            campaigns: campaignCleanup.campaigns,
            pension720Tickets: nextPension720Tickets,
            pension720Campaigns: pension720CampaignCleanup.campaigns,
            localUpdates: localUpdateResult.items,
            strategyPresets: nextPresets,
            alertPrefs: importOptions.applyAlerts
                ? ctx.data.mergeAlertPrefs({
                      ...(current.alertPrefs || {}),
                      ...incoming.alertPrefs
                  })
                : current.alertPrefs,
            theme: importOptions.applyTheme ? incoming.theme : current.theme,
            proxy: importOptions.applyProxy ? incoming.proxy : current.customProxy,
            strategyPrefs:
                importOptions.applyStrategyPrefs && incoming.strategyPrefs
                    ? ctx.data.mergeStrategyPrefs({
                          ...(current.strategyPrefs || {}),
                          ...(incoming.strategyPrefs || {})
                      })
                    : current.strategyPrefs
        }
    };
}