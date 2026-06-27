export const recordNormalizeTicketMethods = {
    normalizeTicketEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const numbers = this.normalizeNumbers(raw.numbers || []);
        if (numbers.length !== 6) return null;

        const targetDrawNo = Number(raw.targetDrawNo);
        if (!Number.isFinite(targetDrawNo) || targetDrawNo < 1) return null;

        const source = ['generator', 'ai', 'import'].includes(raw.source) ? raw.source : 'import';
        const checkedDraw = Number(raw?.checked?.drawNo);
        const checkedRank = Number(raw?.checked?.rank);

        const ticket = {
            id: this.normalizeRecordId(raw.id, 'ticket'),
            numbers,
            targetDrawNo: Math.floor(targetDrawNo),
            source,
            quantity: this.normalizeTicketQuantity(raw.quantity),
            campaignId:
                typeof raw.campaignId === 'string' && raw.campaignId.trim() ? raw.campaignId.trim().slice(0, 120) : '',
            strategyRequest: this.normalizeStrategyRequestSnapshot(raw.strategyRequest),
            memo: typeof raw.memo === 'string' ? raw.memo.slice(0, 200) : '',
            createdAt: raw.createdAt || new Date().toISOString(),
            checked:
                Number.isFinite(checkedDraw) && Number.isFinite(checkedRank) && checkedRank >= 0 && checkedRank <= 5
                    ? {
                          drawNo: Math.floor(checkedDraw),
                          rank: Math.floor(checkedRank),
                          checkedAt: raw.checked.checkedAt || new Date().toISOString()
                      }
                    : null
        };

        this.buildTicketKey(ticket);
        return ticket;
    },

    buildTicketKey(ticket) {
        if (ticket && typeof ticket.__dedupeKey === 'string') {
            return ticket.__dedupeKey;
        }
        const strategySnapshot = ticket?.strategyRequest ? this.stableStringify(ticket.strategyRequest) || '-' : '-';
        const key = [
            ticket?.targetDrawNo,
            ticket?.source || '-',
            ticket?.campaignId || '-',
            (ticket?.numbers || []).join(','),
            strategySnapshot
        ].join('|');
        if (ticket && typeof ticket === 'object') {
            try {
                Object.defineProperty(ticket, '__dedupeKey', {
                    value: key,
                    writable: true,
                    configurable: true,
                    enumerable: false
                });
            } catch (_e) {
                ticket.__dedupeKey = key;
            }
        }
        return key;
    }
};