import { CONFIG } from '../../utils/config.js';
import { estimateLatestDrawKST } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';
export const dataRecordMethods = {
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

        const rawDate = typeof raw.date === 'string'
            ? raw.date
            : (typeof raw.created_at === 'string' ? raw.created_at : '');

        return {
            numbers,
            date: rawDate || new Date().toISOString()
        };
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
            id: raw.id || this.createId('ticket'),
            numbers,
            targetDrawNo: Math.floor(targetDrawNo),
            source,
            campaignId: (typeof raw.campaignId === 'string' && raw.campaignId.trim())
                ? raw.campaignId.trim().slice(0, 120)
                : '',
            strategyRequest: raw.strategyRequest && typeof raw.strategyRequest === 'object' ? raw.strategyRequest : null,
            memo: typeof raw.memo === 'string' ? raw.memo.slice(0, 200) : '',
            createdAt: raw.createdAt || new Date().toISOString(),
            checked: Number.isFinite(checkedDraw) && Number.isFinite(checkedRank) && checkedRank >= 0 && checkedRank <= 5
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
            strategyRequest: raw.strategyRequest && typeof raw.strategyRequest === 'object' ? raw.strategyRequest : null,
            createdAt: raw.createdAt || new Date().toISOString()
        };
    },

    buildTicketKey(ticket) {
        if (ticket && typeof ticket.__dedupeKey === 'string') {
            return ticket.__dedupeKey;
        }
        const strategySnapshot = ticket?.strategyRequest ? (this.stableStringify(ticket.strategyRequest) || '-') : '-';
        const key = [ticket?.targetDrawNo, ticket?.source || '-', (ticket?.numbers || []).join(','), strategySnapshot].join('|');
        if (ticket && typeof ticket === 'object') {
            try {
                Object.defineProperty(ticket, '__dedupeKey', {
                    value: key,
                    writable: true,
                    configurable: true,
                    enumerable: false
                });
            } catch (e) {
                ticket.__dedupeKey = key;
            }
        }
        return key;
    },

    addTicket(numbers, options = {}) {
        const normalized = this.normalizeNumbers(numbers);
        if (normalized.length !== 6) return null;

        const latestDrawNo = Number(this.state.winningStats?.[0]?.draw_no || estimateLatestDrawKST() || 1);
        const targetDrawNo = Math.max(1, Math.floor(Number(options.targetDrawNo || latestDrawNo + 1)));

        const ticket = this.normalizeTicketEntry({
            id: this.createId('ticket'),
            numbers: normalized,
            targetDrawNo,
            source: options.source || 'import',
            strategyRequest: options.strategyRequest || null,
            memo: options.memo || '',
            createdAt: new Date().toISOString(),
            checked: null
        });
        if (!ticket) return null;

        const key = this.buildTicketKey(ticket);
        const exists = this.state.ticketBook.some((x) => this.buildTicketKey(x) === key);
        if (exists) return null;

        this.state.ticketBook.unshift(ticket);
        this.markDirty('ticketBook');
        this.save(true);
        return ticket;
    },

    addTicketsBulk(items = [], options = {}) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return 0;

        const existingKeys = new Set(this.state.ticketBook.map((x) => this.buildTicketKey(x)));
        let inserted = 0;

        for (const raw of list) {
            const ticket = this.normalizeTicketEntry(raw);
            if (!ticket) continue;
            const key = this.buildTicketKey(ticket);
            if (existingKeys.has(key)) continue;
            existingKeys.add(key);
            this.state.ticketBook.unshift(ticket);
            inserted++;
        }

        if (inserted > 0) {
            this.markDirty('ticketBook');
            this.save(true);
            if (!options.silent) UIManager.toast(`${inserted}개 티켓 추가 완료`, 'success');
        }
        return inserted;
    },

    removeTicket(id) {
        const before = this.state.ticketBook.length;
        this.state.ticketBook = this.state.ticketBook.filter((x) => x.id !== id);
        const removed = before - this.state.ticketBook.length;
        if (removed > 0) {
            this.markDirty('ticketBook');
            this.save(true);
        }
        return removed > 0;
    },

    updateTicketMemo(id, memo) {
        const target = this.state.ticketBook.find((x) => x.id === id);
        if (!target) return false;
        target.memo = typeof memo === 'string' ? memo.slice(0, 200) : '';
        this.markDirty('ticketBook');
        this.save(true);
        return true;
    },

    clearTicketBook(filter = 'all') {
        const isPending = (t) => !t.checked;
        const isWin = (t) => t.checked && t.checked.rank > 0;
        const isLose = (t) => t.checked && t.checked.rank === 0;

        const before = this.state.ticketBook.length;
        if (filter === 'pending') this.state.ticketBook = this.state.ticketBook.filter((t) => !isPending(t));
        else if (filter === 'win') this.state.ticketBook = this.state.ticketBook.filter((t) => !isWin(t));
        else if (filter === 'lose') this.state.ticketBook = this.state.ticketBook.filter((t) => !isLose(t));
        else this.state.ticketBook = [];

        const removed = before - this.state.ticketBook.length;
        if (removed > 0) {
            this.markDirty('ticketBook');
            this.save(true);
        }
        return removed;
    },

    addCampaign(entry) {
        const normalized = this.normalizeCampaignEntry(entry);
        if (!normalized) return null;
        this.state.campaigns.unshift(normalized);
        this.markDirty('campaigns');
        this.save(true);
        return normalized;
    },

    countTicketsByCampaignId(campaignId) {
        const targetId = String(campaignId || '').trim();
        if (!targetId) return 0;
        return (this.state.ticketBook || []).filter((ticket) => ticket?.campaignId === targetId).length;
    },

    countTicketsByCampaignIds(campaignIds = []) {
        const ids = new Set((campaignIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        if (!ids.size) return 0;
        return (this.state.ticketBook || []).filter((ticket) => ids.has(String(ticket?.campaignId || '').trim())).length;
    },

    removeCampaign(id, { cascadeTickets = true } = {}) {
        const targetId = String(id || '').trim();
        const campaign = (this.state.campaigns || []).find((item) => item?.id === targetId) || null;
        if (!campaign) {
            return {
                removedCampaign: false,
                removedTickets: 0,
                campaign: null
            };
        }

        const beforeCampaigns = this.state.campaigns.length;
        const beforeTickets = this.state.ticketBook.length;
        this.state.campaigns = this.state.campaigns.filter((item) => item?.id !== targetId);

        let removedTickets = 0;
        if (cascadeTickets) {
            this.state.ticketBook = this.state.ticketBook.filter((ticket) => ticket?.campaignId !== targetId);
            removedTickets = beforeTickets - this.state.ticketBook.length;
        }

        const removedCampaign = beforeCampaigns !== this.state.campaigns.length;
        if (removedCampaign || removedTickets > 0) {
            this.markDirty('campaigns');
            if (removedTickets > 0) this.markDirty('ticketBook');
            this.save(true);
        }

        return {
            removedCampaign,
            removedTickets,
            campaign
        };
    },

    clearCampaigns({ cascadeTickets = true } = {}) {
        const campaignIds = (this.state.campaigns || []).map((item) => item?.id).filter(Boolean);
        const removedCampaigns = campaignIds.length;
        if (!removedCampaigns) {
            return { removedCampaigns: 0, removedTickets: 0 };
        }

        const beforeTickets = this.state.ticketBook.length;
        this.state.campaigns = [];

        let removedTickets = 0;
        if (cascadeTickets) {
            const idSet = new Set(campaignIds.map((item) => String(item)));
            this.state.ticketBook = this.state.ticketBook.filter((ticket) => !idSet.has(String(ticket?.campaignId || '')));
            removedTickets = beforeTickets - this.state.ticketBook.length;
        }

        this.markDirty('campaigns');
        if (removedTickets > 0) this.markDirty('ticketBook');
        this.save(true);
        return { removedCampaigns, removedTickets };
    },

    addToFavorites(nums) {
        const key = nums.join(',');
        if (this.state.favorites.some(f => f.numbers.join(',') === key)) {
            UIManager.toast('이미 즐겨찾기에 있습니다.', 'warning');
            return false;
        }
        this.state.favorites.unshift({ numbers: nums, date: new Date().toISOString() });
        this.markDirty('fav');
        this.save(true);
        UIManager.toast('즐겨찾기 추가 완료', 'success');
        return true;
    },

    clearFavorites() {
        this.state.favorites = [];
        this.markDirty('fav');
        this.save(true);
    },

    clearHistory() {
        this.state.history = [];
        this.markDirty('hist');
        this.save(true);
    }
};
