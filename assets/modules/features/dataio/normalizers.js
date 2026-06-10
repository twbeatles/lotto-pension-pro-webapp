export const dataIoNormalizationMethods = {
    normalizeItems(items) {
        if (!Array.isArray(items)) return [];
        return items.map((x) => this.data.normalizeStoredNumberEntry(x)).filter(Boolean);
    },

    normalizeTicketItems(items) {
        if (!Array.isArray(items)) return [];
        const normalized = items
            .map((x) => this.data.normalizeTicketEntry(x))
            .filter(Boolean)
            .map((x) => ({
                ...x,
                source: ['generator', 'ai', 'import'].includes(x.source) ? x.source : 'import'
            }));
        return this.data.mergeTicketEntries([], normalized);
    },

    normalizeCampaignItems(items) {
        if (!Array.isArray(items)) return [];
        return items.map((x) => this.data.normalizeCampaignEntry(x)).filter(Boolean);
    },

    normalizePension720TicketItems(items) {
        return this.data.mergePension720Tickets([], Array.isArray(items) ? items : []);
    },

    normalizePension720CampaignItems(items) {
        return this.data.mergePension720Campaigns([], Array.isArray(items) ? items : []);
    },

    normalizeLocalUpdates(items) {
        return this.data.sanitizeLocalUpdates(items);
    },

    normalizeStrategyPresets(items) {
        return this.data.mergeStrategyPresets(items || []);
    },

    mergeByNumbers(existing, incoming) {
        const seen = new Set(existing.map((x) => x.numbers.join(',')));
        const merged = [...existing];
        incoming.forEach((x) => {
            const key = x.numbers.join(',');
            if (seen.has(key)) return;
            seen.add(key);
            merged.unshift(x);
        });
        return merged;
    },

    mergeHistoryEntries(existing, incoming) {
        return this.data.mergeHistoryEntries(existing, incoming);
    },

    mergeTickets(existing, incoming) {
        return this.data.mergeTicketEntries(existing, incoming);
    },

    mergeLocalUpdates(existing, incoming) {
        const map = new Map();
        (existing || []).forEach((item) => {
            if (!item) return;
            map.set(Number(item.draw_no), item);
        });
        (incoming || []).forEach((item) => {
            if (!item) return;
            map.set(Number(item.draw_no), item);
        });
        return Array.from(map.values())
            .filter((x) => Number.isFinite(Number(x?.draw_no)))
            .sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
    },

    mergeCampaigns(existing, incoming) {
        return [...incoming, ...existing].filter((x, idx, arr) => arr.findIndex((y) => y.id === x.id) === idx);
    },

    mergePension720Tickets(existing, incoming) {
        return this.data.mergePension720Tickets(existing, incoming);
    },

    mergePension720Campaigns(existing, incoming) {
        return this.data.mergePension720Campaigns(existing, incoming);
    },

    pruneCampaignsWithoutTickets(campaigns = [], tickets = [], targetCampaignIds = null) {
        const targetIds =
            targetCampaignIds instanceof Set
                ? targetCampaignIds
                : new Set((targetCampaignIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        const limitToTargets = targetIds.size > 0;
        const linkedCampaignIds = new Set(
            (tickets || []).map((ticket) => String(ticket?.campaignId || '').trim()).filter(Boolean)
        );

        const kept = [];
        const removed = [];

        (campaigns || []).forEach((campaign) => {
            const campaignId = String(campaign?.id || '').trim();
            const shouldValidate = !limitToTargets || targetIds.has(campaignId);
            if (shouldValidate && (!campaignId || !linkedCampaignIds.has(campaignId))) {
                removed.push(campaign);
                return;
            }
            kept.push(campaign);
        });

        return {
            campaigns: kept,
            removed
        };
    },

    prunePension720CampaignsWithoutTickets(campaigns = [], tickets = [], targetCampaignIds = null) {
        const targetIds =
            targetCampaignIds instanceof Set
                ? targetCampaignIds
                : new Set((targetCampaignIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        const limitToTargets = targetIds.size > 0;
        const linkedCampaignIds = new Set(
            (tickets || []).map((ticket) => String(ticket?.campaignId || '').trim()).filter(Boolean)
        );

        const kept = [];
        const removed = [];

        (campaigns || []).forEach((campaign) => {
            const campaignId = String(campaign?.id || '').trim();
            const shouldValidate = !limitToTargets || targetIds.has(campaignId);
            if (shouldValidate && (!campaignId || !linkedCampaignIds.has(campaignId))) {
                removed.push(campaign);
                return;
            }
            kept.push(campaign);
        });

        return {
            campaigns: kept,
            removed
        };
    },

    mergeStrategyPresets(existing, incoming) {
        return this.data.mergeStrategyPresets([...(existing || []), ...(incoming || [])]);
    }
};
