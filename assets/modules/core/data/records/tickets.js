import { recordTicketMergeMethods } from './tickets/merge.js';
import { recordTicketSettleMethods } from './tickets/settle.js';
import { recordTicketCrudMethods } from './tickets/crud.js';
import { recordTicketCleanupMethods } from './tickets/cleanup.js';

export const recordTicketMethods = {
    ...recordTicketMergeMethods,
    ...recordTicketSettleMethods,
    ...recordTicketCrudMethods,
    ...recordTicketCleanupMethods
};