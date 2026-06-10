import { CONFIG } from '../../../utils/config.js';
import { normalizeSixDigits } from './normalize.js';

export const dataPension720TicketMethods = {
    normalizePension720Ticket(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const group = Number(raw.group);
        const number = normalizeSixDigits(raw.number);
        const targetDrawNo = Number(raw.targetDrawNo);
        if (!Number.isInteger(group) || group < 1 || group > 5 || !number) return null;
        return {
            id: this.normalizeRecordId(raw.id, 'p720'),
            group,
            number: number.number,
            digits: number.digits,
            source: ['recommendation', 'campaign', 'import'].includes(raw.source) ? raw.source : 'import',
            targetDrawNo: Number.isFinite(targetDrawNo) && targetDrawNo >= 1 ? Math.floor(targetDrawNo) : null,
            campaignId:
                typeof raw.campaignId === 'string' && raw.campaignId.trim() ? raw.campaignId.trim().slice(0, 120) : '',
            strategyRequest: this.normalizeStrategyRequestSnapshot(raw.strategyRequest),
            score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
            memo: typeof raw.memo === 'string' ? raw.memo.slice(0, 200) : '',
            createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
        };
    },

    buildPension720TicketKey(ticket) {
        return [
            Number(ticket?.group || 0),
            String(ticket?.number || '').trim(),
            ticket?.targetDrawNo || '-',
            ticket?.campaignId || '-'
        ].join('|');
    },

    mergePension720Tickets(existing = [], incoming = []) {
        const map = new Map();
        [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach((item) => {
            const normalized = this.normalizePension720Ticket(item);
            if (!normalized) return;
            const key = this.buildPension720TicketKey(normalized);
            if (!map.has(key)) map.set(key, normalized);
        });
        return Array.from(map.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    addPension720Ticket(raw, options = {}) {
        const ticket = this.normalizePension720Ticket({
            ...(raw || {}),
            source: raw?.source || 'recommendation'
        });
        if (!ticket) return { inserted: false, duplicate: false, ticket: null };
        const next = this.mergePension720Tickets(this.state.pension720Tickets || [], [ticket]);
        const before = this.state.pension720Tickets?.length || 0;
        if (next.length === before) {
            return {
                inserted: false,
                duplicate: true,
                ticket:
                    next.find(
                        (item) => this.buildPension720TicketKey(item) === this.buildPension720TicketKey(ticket)
                    ) || null
            };
        }
        this.state.pension720Tickets = next.slice(0, CONFIG.LIMITS.MAX_PENSION720_TICKETS);
        this.markDirty('pension720Tickets');
        this.save(options.immediate !== false);
        return { inserted: true, duplicate: false, ticket };
    },

    addPension720TicketsBulk(items = [], options = {}) {
        const beforeItems = this.mergePension720Tickets([], this.state.pension720Tickets || []);
        const beforeKeys = new Set(beforeItems.map((item) => this.buildPension720TicketKey(item)));
        const normalizedIncoming = (Array.isArray(items) ? items : [])
            .map((item) => this.normalizePension720Ticket(item))
            .filter(Boolean);
        const incomingUniqueKeys = new Set(normalizedIncoming.map((item) => this.buildPension720TicketKey(item)));
        const merged = this.mergePension720Tickets(beforeItems, items);
        const next = merged.slice(0, CONFIG.LIMITS.MAX_PENSION720_TICKETS);
        const afterKeys = new Set(next.map((item) => this.buildPension720TicketKey(item)));
        this.state.pension720Tickets = next;
        const inserted = Math.max(0, [...afterKeys].filter((key) => !beforeKeys.has(key)).length);
        const duplicate = Math.max(
            0,
            normalizedIncoming.length -
                incomingUniqueKeys.size +
                [...incomingUniqueKeys].filter((key) => beforeKeys.has(key)).length
        );
        const truncated = Math.max(0, merged.length - next.length);
        if (inserted > 0) {
            this.markDirty('pension720Tickets');
            this.save(options.immediate !== false);
        }
        return {
            inserted,
            duplicate,
            truncated
        };
    },

    removePension720Ticket(id) {
        const targetId = String(id || '').trim();
        const before = this.state.pension720Tickets?.length || 0;
        this.state.pension720Tickets = (this.state.pension720Tickets || []).filter((item) => item.id !== targetId);
        const removed = before - this.state.pension720Tickets.length;
        if (removed > 0) {
            this.markDirty('pension720Tickets');
            this.prunePension720CampaignsWithoutTickets({ save: false });
            this.save(true);
        }
        return removed;
    },

    clearPension720Tickets() {
        const removed = this.state.pension720Tickets?.length || 0;
        if (!removed) return 0;
        this.state.pension720Tickets = [];
        this.state.pension720Campaigns = [];
        this.markDirty('pension720Tickets');
        this.markDirty('pension720Campaigns');
        this.save(true);
        return removed;
    }
};
