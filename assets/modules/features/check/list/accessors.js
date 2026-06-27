import { UI_STRINGS } from '../../../utils/strings.js';

export const checkListAccessorMethods = {
    getList() {
        if (this.source === 'scanned') return this.scanned;
        if (this.source === 'tickets') return this.data.state.ticketBook || [];
        return this.source === 'history' ? this.data.state.history : this.data.state.favorites;
    },

    getTicketStatusLabel(item) {
        if (!item?.checked) return UI_STRINGS.check.ticketStatus.pending;
        if (Number(item.checked.rank) > 0) return `${item.checked.rank}등`;
        return UI_STRINGS.check.ticketStatus.lose;
    },

    getTicketStatusCode(item) {
        if (!item?.checked) return 'pending';
        if (Number(item.checked.rank) > 0) return 'win';
        return 'lose';
    },

    getItemQuantity(item) {
        if (this.source !== 'tickets') return 1;
        return this.data.getTicketQuantity(item);
    },

    formatDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return this.dateFormatter.format(date);
    },

    buildItemKey(item, index) {
        if (this.source === 'tickets') return String(item.id || `ticket-${index}`);
        const date = item?.date || item?.createdAt || '';
        return `${this.source}:${index}:${(item?.numbers || []).join(',')}:${date}:${item?.targetDrawNo || ''}`;
    },

    matchesQuery(item, metaText = '') {
        if (!this.searchQuery) return true;
        const haystack = [
            (item?.numbers || []).join(', '),
            item?.targetDrawNo,
            item?.date,
            this.formatDate(item?.date),
            metaText
        ]
            .join(' ')
            .toLowerCase();
        return haystack.includes(this.searchQuery);
    }
};