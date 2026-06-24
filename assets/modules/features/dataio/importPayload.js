export const dataIoImportPayloadMethods = {
    normalizeImportProxy(rawUrl = '') {
        const input = String(rawUrl || '').trim();
        if (!input) {
            return { proxy: '', droppedInvalidProxy: false };
        }
        const validation = this.data.validateCustomProxyUrl(input);
        return {
            proxy: validation.valid ? validation.normalizedUrl : '',
            droppedInvalidProxy: !validation.valid
        };
    },

    normalizeImportPayload(normalized) {
        const incomingLocalUpdateResult = this.normalizeLocalUpdates(normalized.localUpdates);
        const proxyResult = this.normalizeImportProxy(normalized.settings?.customProxy);
        return {
            favorites: this.normalizeItems(normalized.favorites),
            history: this.normalizeItems(normalized.history),
            theme: normalized.settings?.theme === 'light' ? 'light' : 'dark',
            proxy: proxyResult.proxy,
            droppedInvalidProxy: proxyResult.droppedInvalidProxy,
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
