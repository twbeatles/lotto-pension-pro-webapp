import { UI_STRINGS } from '../../../utils/strings.js';

export const checkListVisibilityMethods = {
    getVisibleItems() {
        const items = this.getList();
        return items.reduce((acc, item, index) => {
            const key = this.buildItemKey(item, index);
            const sourceLabel = UI_STRINGS.check.sourceLabels[this.source] || this.source;
            const ticketStatus = this.source === 'tickets' ? this.getTicketStatusCode(item) : 'all';
            const ticketStatusLabel = this.source === 'tickets' ? this.getTicketStatusLabel(item) : '';
            const quantity = this.getItemQuantity(item);

            if (
                this.source === 'tickets' &&
                this.ticketStatusFilter !== 'all' &&
                ticketStatus !== this.ticketStatusFilter
            ) {
                return acc;
            }

            const metaText =
                this.source === 'tickets'
                    ? `${item.targetDrawNo}회차 ${ticketStatusLabel}${quantity > 1 ? ` x${quantity}` : ''}`
                    : this.source === 'scanned'
                      ? item.targetDrawNo
                          ? `${item.targetDrawNo}회차 큐알 스캔`
                          : '큐알 스캔 결과'
                      : `${sourceLabel} ${this.formatDate(item.date)}`;

            if (!this.matchesQuery(item, metaText)) return acc;

            acc.push({
                key,
                item,
                index,
                sourceLabel,
                metaText,
                ticketStatus,
                ticketStatusLabel,
                quantity
            });
            return acc;
        }, []);
    }
};