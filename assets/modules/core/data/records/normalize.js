import { recordNormalizeCloneMethods } from './normalize/clone.js';
import { recordNormalizeNumberMethods } from './normalize/numbers.js';
import { recordNormalizeTicketMethods } from './normalize/tickets.js';
import { recordNormalizeCampaignMethods } from './normalize/campaigns.js';

export const recordNormalizeMethods = {
    ...recordNormalizeCloneMethods,
    ...recordNormalizeNumberMethods,
    ...recordNormalizeTicketMethods,
    ...recordNormalizeCampaignMethods
};