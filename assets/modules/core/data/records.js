import { recordNormalizeMethods } from './records/normalize.js';
import { recordGeneratedMethods } from './records/generated.js';
import { recordTicketMethods } from './records/tickets.js';
import { recordCampaignMethods } from './records/campaigns.js';
import { recordSavedListMethods } from './records/savedLists.js';

export const dataRecordMethods = {
    ...recordNormalizeMethods,
    ...recordGeneratedMethods,
    ...recordTicketMethods,
    ...recordCampaignMethods,
    ...recordSavedListMethods
};
