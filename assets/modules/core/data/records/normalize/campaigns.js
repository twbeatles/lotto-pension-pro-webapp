import { CONFIG } from '../../../../utils/config.js';

export const recordNormalizeCampaignMethods = {
    normalizeCampaignEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const startDrawNo = Number(raw.startDrawNo);
        const weeks = Number(raw.weeks);
        const setsPerWeek = Number(raw.setsPerWeek);
        if (!Number.isFinite(startDrawNo) || !Number.isFinite(weeks) || !Number.isFinite(setsPerWeek)) return null;
        const normalizedWeeks = Math.max(1, Math.floor(weeks));
        const normalizedSetsPerWeek = Math.max(1, Math.floor(setsPerWeek));
        if (normalizedWeeks > CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS) return null;
        if (normalizedSetsPerWeek > CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK) return null;
        if (normalizedWeeks * normalizedSetsPerWeek > CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS) return null;

        return {
            id: raw.id || this.createId('campaign'),
            name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : 'campaign',
            startDrawNo: Math.max(1, Math.floor(startDrawNo)),
            weeks: normalizedWeeks,
            setsPerWeek: normalizedSetsPerWeek,
            strategyRequest: this.normalizeStrategyRequestSnapshot(raw.strategyRequest),
            createdAt: raw.createdAt || new Date().toISOString()
        };
    }
};