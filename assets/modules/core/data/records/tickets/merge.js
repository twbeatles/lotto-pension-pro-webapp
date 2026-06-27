export const recordTicketMergeMethods = {
    mergeTicketEntries(existing = [], incoming = []) {
        const merged = [];
        const keyToIndex = new Map();

        const pushTicket = (raw) => {
            const ticket = this.normalizeTicketEntry(raw);
            if (!ticket) return;
            const key = this.buildTicketKey(ticket);
            if (keyToIndex.has(key)) {
                const current = merged[keyToIndex.get(key)];
                current.quantity = this.normalizeTicketQuantity(
                    this.getTicketQuantity(current) + this.getTicketQuantity(ticket)
                );
                return;
            }
            keyToIndex.set(key, merged.length);
            merged.push(ticket);
        };

        (existing || []).forEach(pushTicket);
        (incoming || []).forEach(pushTicket);
        return merged;
    }
};