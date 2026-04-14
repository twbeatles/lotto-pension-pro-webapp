import { checkEventMethods } from './check/events.js';
import { checkListMethods } from './check/list.js';
import { checkResultMethods } from './check/results.js';

export class CheckModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.source = 'favorites';
        this.mode = 'latest';
        this.ticketStatusFilter = 'all';
        this.searchQuery = '';
        this.scanned = [];
        this.selectedItemKey = '';
        this.currentTicket = null;
        this.currentDrawNo = null;
        this.dateFormatter = new Intl.DateTimeFormat('ko-KR');
        this.bindEvents();
    }
}

Object.assign(
    CheckModule.prototype,
    checkEventMethods,
    checkListMethods,
    checkResultMethods
);
