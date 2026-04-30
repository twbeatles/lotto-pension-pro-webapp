import { CONFIG } from '../../../utils/config.js';

export const recordNormalizeMethods = {
    cloneSerializableValue(value, depth = 0, seen = new WeakSet()) {
        if (value === null || typeof value !== 'object') {
            return value;
        }
        if (depth >= CONFIG.LIMITS.MAX_SERIALIZABLE_DEPTH || seen.has(value)) {
            return null;
        }
        seen.add(value);

        if (Array.isArray(value)) {
            return value
                .slice(0, CONFIG.LIMITS.MAX_SERIALIZABLE_ARRAY_ITEMS)
                .map((item) => this.cloneSerializableValue(item, depth + 1, seen));
        }

        const cloned = {};
        Object.keys(value)
            .slice(0, CONFIG.LIMITS.MAX_SERIALIZABLE_KEYS)
            .forEach((key) => {
                const next = value[key];
                if (next === undefined || typeof next === 'function' || typeof next === 'symbol') return;
                cloned[key] = this.cloneSerializableValue(next, depth + 1, seen);
            });
        return cloned;
    },

    getUtf8ByteLength(value = '') {
        const text = String(value || '');
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(text).length;
        }
        return unescape(encodeURIComponent(text)).length;
    },

    normalizeStrategyRequestSnapshot(value) {
        if (!value || typeof value !== 'object') return null;
        const cloned = this.cloneSerializableValue(value);
        if (!cloned || typeof cloned !== 'object') return null;
        const serialized = this.stableStringify(cloned) || '';
        if (this.getUtf8ByteLength(serialized) > CONFIG.LIMITS.MAX_STRATEGY_REQUEST_BYTES) return null;
        return cloned;
    },

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
    },

    createId(prefix = 'id') {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return `${prefix}_${crypto.randomUUID()}`;
        }
        return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    },

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

    normalizeCampaignEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const startDrawNo = Number(raw.startDrawNo);
        const weeks = Number(raw.weeks);
        const setsPerWeek = Number(raw.setsPerWeek);
        if (!Number.isFinite(startDrawNo) || !Number.isFinite(weeks) || !Number.isFinite(setsPerWeek)) return null;
        const normalizedWeeks = Math.max(1, Math.floor(weeks));
        const normalizedSetsPerWeek = Math.max(1, Math.floor(setsPerWeek));
        if (normalizedWeeks > CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS) return null;
        if (normalizedSetsPerWeek > CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK) return null;
        if (normalizedWeeks * normalizedSetsPerWeek > CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS) return null;

        return {
            id: raw.id || this.createId('campaign'),
            name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : 'campaign',
            startDrawNo: Math.max(1, Math.floor(startDrawNo)),
            weeks: normalizedWeeks,
            setsPerWeek: normalizedSetsPerWeek,
            strategyRequest: this.normalizeStrategyRequestSnapshot(raw.strategyRequest),
            createdAt: raw.createdAt || new Date().toISOString()
        };
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
