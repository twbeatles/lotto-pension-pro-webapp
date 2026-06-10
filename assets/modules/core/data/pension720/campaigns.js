import { CONFIG } from '../../../utils/config.js';

export const dataPension720CampaignMethods = {
    normalizePension720CampaignEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const startDrawNo = Number(raw.startDrawNo);
        const weeks = Number(raw.weeks);
        const setsPerDraw = Number(raw.setsPerDraw ?? raw.setsPerWeek);
        if (!Number.isFinite(startDrawNo) || !Number.isFinite(weeks) || !Number.isFinite(setsPerDraw)) return null;
        const normalizedWeeks = Math.max(1, Math.floor(weeks));
        const normalizedSetsPerDraw = Math.max(1, Math.floor(setsPerDraw));
        if (normalizedWeeks > CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS) return null;
        if (normalizedSetsPerDraw > CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK) return null;
        if (normalizedWeeks * normalizedSetsPerDraw > CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS) return null;

        return {
            id: this.normalizeRecordId(raw.id, 'p720_campaign'),
            name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : 'pension720 campaign',
            startDrawNo: Math.max(1, Math.floor(startDrawNo)),
            weeks: normalizedWeeks,
            setsPerDraw: normalizedSetsPerDraw,
            strategyRequest: this.normalizeStrategyRequestSnapshot(raw.strategyRequest),
            createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
        };
    },

    mergePension720Campaigns(existing = [], incoming = []) {
        const map = new Map();
        [...(Array.isArray(incoming) ? incoming : []), ...(Array.isArray(existing) ? existing : [])].forEach((item) => {
            const normalized = this.normalizePension720CampaignEntry(item);
            if (!normalized || map.has(normalized.id)) return;
            map.set(normalized.id, normalized);
        });
        return Array.from(map.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    prunePension720CampaignsWithoutTickets({ targetIds = null, save = true } = {}) {
        const normalizedTargetIds =
            targetIds instanceof Set
                ? new Set([...targetIds].map((item) => String(item || '').trim()).filter(Boolean))
                : new Set((targetIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        const limitToTargets = normalizedTargetIds.size > 0;
        const linkedCampaignIds = new Set(
            (this.state.pension720Tickets || [])
                .map((ticket) => String(ticket?.campaignId || '').trim())
                .filter(Boolean)
        );
        const kept = [];
        const removed = [];

        (this.state.pension720Campaigns || []).forEach((campaign) => {
            const campaignId = String(campaign?.id || '').trim();
            const shouldValidate = !limitToTargets || normalizedTargetIds.has(campaignId);
            if (shouldValidate && (!campaignId || !linkedCampaignIds.has(campaignId))) {
                removed.push(campaign);
                return;
            }
            kept.push(campaign);
        });

        if (removed.length) {
            this.state.pension720Campaigns = kept;
            this.markDirty('pension720Campaigns');
            if (save) this.save(true);
        }

        return {
            campaigns: removed.length ? kept : this.state.pension720Campaigns || [],
            removed
        };
    },

    addPension720Campaign(entry) {
        const normalized = this.normalizePension720CampaignEntry(entry);
        if (!normalized) return null;
        this.state.pension720Campaigns = this.mergePension720Campaigns(this.state.pension720Campaigns || [], [
            normalized
        ]);
        this.markDirty('pension720Campaigns');
        this.save(true);
        return normalized;
    },

    countPension720TicketsByCampaignId(campaignId) {
        const targetId = String(campaignId || '').trim();
        if (!targetId) return 0;
        return (this.state.pension720Tickets || []).filter((ticket) => ticket?.campaignId === targetId).length;
    },

    removePension720Campaign(id, { cascadeTickets = true } = {}) {
        const targetId = String(id || '').trim();
        const campaign = (this.state.pension720Campaigns || []).find((item) => item?.id === targetId) || null;
        if (!campaign) {
            return {
                removedCampaign: false,
                removedTickets: 0,
                campaign: null
            };
        }

        const beforeCampaigns = this.state.pension720Campaigns.length;
        const beforeTickets = this.state.pension720Tickets?.length || 0;
        this.state.pension720Campaigns = this.state.pension720Campaigns.filter((item) => item?.id !== targetId);

        let removedTickets = 0;
        if (cascadeTickets) {
            this.state.pension720Tickets = (this.state.pension720Tickets || []).filter(
                (ticket) => ticket?.campaignId !== targetId
            );
            removedTickets = beforeTickets - this.state.pension720Tickets.length;
        }

        const removedCampaign = beforeCampaigns !== this.state.pension720Campaigns.length;
        if (removedCampaign || removedTickets > 0) {
            this.markDirty('pension720Campaigns');
            if (removedTickets > 0) this.markDirty('pension720Tickets');
            this.save(true);
        }

        return {
            removedCampaign,
            removedTickets,
            campaign
        };
    }
};
