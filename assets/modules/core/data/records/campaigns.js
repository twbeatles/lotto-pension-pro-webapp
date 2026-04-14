export const recordCampaignMethods = {
    pruneOrphanCampaigns({ targetIds = null, save = true } = {}) {
        const normalizedTargetIds = targetIds instanceof Set
            ? new Set([...targetIds].map((item) => String(item || '').trim()).filter(Boolean))
            : new Set((targetIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        const limitToTargets = normalizedTargetIds.size > 0;
        const linkedCampaignIds = new Set(
            (this.state.ticketBook || [])
                .map((ticket) => String(ticket?.campaignId || '').trim())
                .filter(Boolean)
        );

        const kept = [];
        const removed = [];

        (this.state.campaigns || []).forEach((campaign) => {
            const campaignId = String(campaign?.id || '').trim();
            const shouldValidate = !limitToTargets || normalizedTargetIds.has(campaignId);
            if (shouldValidate && (!campaignId || !linkedCampaignIds.has(campaignId))) {
                removed.push(campaign);
                return;
            }
            kept.push(campaign);
        });

        if (removed.length) {
            this.state.campaigns = kept;
            this.markDirty('campaigns');
            if (save) this.save(true);
        }

        return {
            campaigns: removed.length ? kept : (this.state.campaigns || []),
            removed
        };
    },

    addCampaign(entry) {
        const normalized = this.normalizeCampaignEntry(entry);
        if (!normalized) return null;
        this.state.campaigns.unshift(normalized);
        this.markDirty('campaigns');
        this.save(true);
        return normalized;
    },

    countTicketsByCampaignId(campaignId) {
        const targetId = String(campaignId || '').trim();
        if (!targetId) return 0;
        return (this.state.ticketBook || []).reduce((sum, ticket) => {
            return sum + (ticket?.campaignId === targetId ? this.getTicketQuantity(ticket) : 0);
        }, 0);
    },

    countTicketsByCampaignIds(campaignIds = []) {
        const ids = new Set((campaignIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        if (!ids.size) return 0;
        return (this.state.ticketBook || []).reduce((sum, ticket) => {
            return sum + (ids.has(String(ticket?.campaignId || '').trim()) ? this.getTicketQuantity(ticket) : 0);
        }, 0);
    },

    removeCampaign(id, { cascadeTickets = true } = {}) {
        const targetId = String(id || '').trim();
        const campaign = (this.state.campaigns || []).find((item) => item?.id === targetId) || null;
        if (!campaign) {
            return {
                removedCampaign: false,
                removedTickets: 0,
                campaign: null
            };
        }

        const beforeCampaigns = this.state.campaigns.length;
        const beforeTickets = this.getTotalTicketCount();
        this.state.campaigns = this.state.campaigns.filter((item) => item?.id !== targetId);

        let removedTickets = 0;
        if (cascadeTickets) {
            this.state.ticketBook = this.state.ticketBook.filter((ticket) => ticket?.campaignId !== targetId);
            removedTickets = beforeTickets - this.getTotalTicketCount();
        }

        const removedCampaign = beforeCampaigns !== this.state.campaigns.length;
        if (removedCampaign || removedTickets > 0) {
            this.markDirty('campaigns');
            if (removedTickets > 0) this.markDirty('ticketBook');
            this.save(true);
        }

        return {
            removedCampaign,
            removedTickets,
            campaign
        };
    },

    clearCampaigns({ cascadeTickets = true } = {}) {
        const campaignIds = (this.state.campaigns || []).map((item) => item?.id).filter(Boolean);
        const removedCampaigns = campaignIds.length;
        if (!removedCampaigns) {
            return { removedCampaigns: 0, removedTickets: 0 };
        }

        const beforeTickets = this.getTotalTicketCount();
        this.state.campaigns = [];

        let removedTickets = 0;
        if (cascadeTickets) {
            const idSet = new Set(campaignIds.map((item) => String(item)));
            this.state.ticketBook = this.state.ticketBook.filter((ticket) => !idSet.has(String(ticket?.campaignId || '')));
            removedTickets = beforeTickets - this.getTotalTicketCount();
        }

        this.markDirty('campaigns');
        if (removedTickets > 0) this.markDirty('ticketBook');
        this.save(true);
        return { removedCampaigns, removedTickets };
    }
};
