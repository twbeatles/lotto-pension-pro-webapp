export const recordNormalizeNumberMethods = {
    normalizeTicketQuantity(value) {
        const quantity = Math.max(1, Math.floor(Number(value) || 1));
        return Number.isFinite(quantity) ? quantity : 1;
    },

    normalizeRecordId(value, prefix = 'id') {
        const raw = typeof value === 'string' ? value.trim().slice(0, 120) : '';
        if (/^[A-Za-z0-9_-]{1,120}$/.test(raw)) return raw;
        return this.createId(prefix);
    },

    getTicketQuantity(ticket) {
        return this.normalizeTicketQuantity(ticket?.quantity);
    },

    getTotalTicketCount(tickets = this.state.ticketBook || []) {
        return (Array.isArray(tickets) ? tickets : []).reduce((sum, ticket) => {
            return sum + this.getTicketQuantity(ticket);
        }, 0);
    },

    normalizeNumbers(nums) {
        if (!Array.isArray(nums)) return [];
        const clean = [...new Set(nums.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 45))];
        if (clean.length !== 6) return [];
        return clean.sort((a, b) => a - b);
    },

    normalizeStoredNumberEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const numbers = this.normalizeNumbers(raw.numbers || []);
        if (numbers.length !== 6) return null;

        const rawDate =
            typeof raw.date === 'string' ? raw.date : typeof raw.created_at === 'string' ? raw.created_at : '';
        const parsedDate = rawDate ? new Date(rawDate) : null;

        return {
            numbers,
            date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? rawDate : new Date().toISOString()
        };
    },

    mergeHistoryEntries(existing = [], incoming = []) {
        return [...(existing || []), ...(incoming || [])]
            .map((entry) => this.normalizeStoredNumberEntry(entry))
            .filter(Boolean)
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }
};