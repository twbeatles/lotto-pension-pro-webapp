import { dataPension720CampaignMethods } from './pension720/campaigns.js';
import { dataPension720CheckMethods } from './pension720/check.js';
import { dataPension720HealthMethods } from './pension720/health.js';
import { dataPension720StatsMethods } from './pension720/stats.js';
import { dataPension720TicketMethods } from './pension720/tickets.js';

export const dataPension720Methods = {
    ...dataPension720HealthMethods,
    ...dataPension720StatsMethods,
    ...dataPension720CheckMethods,
    ...dataPension720TicketMethods,
    ...dataPension720CampaignMethods
};
