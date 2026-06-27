import { dataAnalyticsFreshnessMethods } from './analytics/freshness.js';
import { dataAnalyticsNotificationMethods } from './analytics/notifications.js';
import { dataAnalyticsTicketSettlementMethods } from './analytics/ticketSettlement.js';
import { dataAnalyticsCacheMethods } from './analytics/cache.js';

export const dataAnalyticsMethods = {
    ...dataAnalyticsFreshnessMethods,
    ...dataAnalyticsNotificationMethods,
    ...dataAnalyticsTicketSettlementMethods,
    ...dataAnalyticsCacheMethods
};