export const dataIoImportPayloadMethods = {
    normalizeImportPayload(normalized) {
        const incomingLocalUpdateResult = this.normalizeLocalUpdates(normalized.localUpdates);
        return {
            favorites: this.normalizeItems(normalized.favorites),
            history: this.normalizeItems(normalized.history),
            theme: normalized.settings?.theme === 'light' ? 'light' : 'dark',
            proxy: typeof normalized.settings?.customProxy === 'string' ? normalized.settings.customProxy : '',
            strategyPrefs: normalized.settings?.strategyPrefs || null,
            tickets: this.normalizeTicketItems(normalized.ticketBook),
            campaigns: this.normalizeCampaignItems(normalized.campaigns),
            pension720Tickets: this.normalizePension720TicketItems(normalized.pension720Tickets),
            pension720Campaigns: this.normalizePension720CampaignItems(normalized.pension720Campaigns),
            alertPrefs: this.data.mergeAlertPrefs(normalized.alertPrefs || {}),
            localUpdates: incomingLocalUpdateResult.items,
            futureDropped: incomingLocalUpdateResult.droppedFuture,
            strategyPresets: this.normalizeStrategyPresets(normalized.strategyPresets)
        };
    }
};
