import { CONFIG } from '../../utils/config.js';
import { estimateLatestDrawKST } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';

export const dataRecordMethods = {
    normalizeTicketQuantity(value) {
        const quantity = Math.max(1, Math.floor(Number(value) || 1));
        return Number.isFinite(quantity) ? quantity : 1;
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

        const rawDate = typeof raw.date === 'string'
            ? raw.date
            : (typeof raw.created_at === 'string' ? raw.created_at : '');

        return {
            numbers,
            date: rawDate || new Date().toISOString()
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
            id: raw.id || this.createId('ticket'),
            numbers,
            targetDrawNo: Math.floor(targetDrawNo),
            source,
            quantity: this.normalizeTicketQuantity(raw.quantity),
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
    },

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
    },

    getWinningDrawByNo(drawNo) {
        const targetDrawNo = Math.max(1, Math.floor(Number(drawNo) || 0));
        if (!targetDrawNo) return null;
        return (this.state.winningStats || []).find((draw) => Number(draw?.draw_no) === targetDrawNo) || null;
    },

    settleTicketEntryIfPossible(ticket, draw = null) {
        if (!ticket || ticket.checked) return false;

        const targetDrawNo = Math.max(1, Math.floor(Number(ticket.targetDrawNo || 0)));
        const latestDrawNo = Math.max(0, Math.floor(Number(this.state.winningStats?.[0]?.draw_no || 0)));
        if (!targetDrawNo || !latestDrawNo || targetDrawNo > latestDrawNo) return false;

        const resolvedDraw = draw || this.getWinningDrawByNo(targetDrawNo);
        if (!resolvedDraw || !Array.isArray(resolvedDraw.numbers)) return false;

        ticket.checked = {
            drawNo: Math.floor(Number(resolvedDraw.draw_no || targetDrawNo)),
            rank: this.rankTicket(ticket.numbers, resolvedDraw.numbers, resolvedDraw.bonus),
            checkedAt: new Date().toISOString()
        };
        return true;
    },

    settleTicketsIfPossible(tickets = []) {
        const list = Array.isArray(tickets) ? tickets : [];
        if (!list.length) return 0;

        let settled = 0;
        list.forEach((ticket) => {
            if (this.settleTicketEntryIfPossible(ticket)) {
                settled += this.getTicketQuantity(ticket);
            }
        });
        return settled;
    },

    pruneOrphanCampaigns({ targetIds = null, save = true } = {}) {
        const normalizedTargetIds = targetIds instanceof Set
            ? new Set([...targetIds].map((item) => String(item || '').trim()).filter(Boolean))
            : new Set((targetIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        const limitToTargets = normalizedTargetIds.size > 0;
        const linkedCampaignIds = new Set(
            (this.state.ticketBook || [])
                .map((ticket) => String(ticket?.campaignId || '').trim())
                .filter(Boolean)
        );

        const kept = [];
        const removed = [];

        (this.state.campaigns || []).forEach((campaign) => {
            const campaignId = String(campaign?.id || '').trim();
            const shouldValidate = !limitToTargets || normalizedTargetIds.has(campaignId);
            if (shouldValidate && (!campaignId || !linkedCampaignIds.has(campaignId))) {
                removed.push(campaign);
                return;
            }
            kept.push(campaign);
        });

        if (removed.length) {
            this.state.campaigns = kept;
            this.markDirty('campaigns');
            if (save) this.save(true);
        }

        return {
            campaigns: removed.length ? kept : (this.state.campaigns || []),
            removed
        };
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
            campaignId: options.campaignId || '',
            strategyRequest: options.strategyRequest || null,
            memo: options.memo || '',
            createdAt: new Date().toISOString(),
            checked: null,
            quantity: 1
        });
        if (!ticket) return null;

        const key = this.buildTicketKey(ticket);
        const existing = this.state.ticketBook.find((item) => this.buildTicketKey(item) === key);
        if (existing) {
            existing.quantity = this.normalizeTicketQuantity(this.getTicketQuantity(existing) + 1);
            this.settleTicketsIfPossible([existing]);
            this.markDirty('ticketBook');
            this.save(true);
            return {
                ticket: existing,
                inserted: false,
                incremented: true,
                quantityAdded: 1,
                quantity: this.getTicketQuantity(existing)
            };
        }

        this.state.ticketBook.unshift(ticket);
        this.settleTicketsIfPossible([ticket]);
        this.markDirty('ticketBook');
        this.save(true);
        return {
            ticket,
            inserted: true,
            incremented: false,
            quantityAdded: 1,
            quantity: this.getTicketQuantity(ticket)
        };
    },

    addTicketsBulk(items = [], options = {}) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
            return {
                insertedRows: 0,
                incrementedRows: 0,
                addedQuantity: 0,
                affectedRows: 0
            };
        }

        const keyToTicket = new Map(this.state.ticketBook.map((ticket) => [this.buildTicketKey(ticket), ticket]));
        let insertedRows = 0;
        let addedQuantity = 0;
        const insertedTickets = [];
        const touchedTickets = [];
        const incrementedKeys = new Set();

        for (const raw of list) {
            const ticket = this.normalizeTicketEntry(raw);
            if (!ticket) continue;

            const key = this.buildTicketKey(ticket);
            const quantity = this.getTicketQuantity(ticket);
            addedQuantity += quantity;

            if (keyToTicket.has(key)) {
                const current = keyToTicket.get(key);
                current.quantity = this.normalizeTicketQuantity(this.getTicketQuantity(current) + quantity);
                incrementedKeys.add(key);
                touchedTickets.push(current);
                continue;
            }

            keyToTicket.set(key, ticket);
            this.state.ticketBook.unshift(ticket);
            insertedTickets.push(ticket);
            touchedTickets.push(ticket);
            insertedRows++;
        }

        const incrementedRows = incrementedKeys.size;
        if (insertedRows > 0 || incrementedRows > 0) {
            this.settleTicketsIfPossible(touchedTickets);
            this.markDirty('ticketBook');
            this.save(true);
            if (!options.silent) {
                UIManager.toast(
                    `티켓 ${addedQuantity}개 반영 완료 (${insertedRows}개 항목 추가${incrementedRows > 0 ? `, ${incrementedRows}개 항목 수량 증가` : ''})`,
                    'success'
                );
            }
        }

        return {
            insertedRows,
            incrementedRows,
            addedQuantity,
            affectedRows: insertedRows + incrementedRows
        };
    },

    removeTicket(id) {
        const target = this.state.ticketBook.find((item) => item.id === id);
        const removedTickets = target ? this.getTicketQuantity(target) : 0;
        const before = this.state.ticketBook.length;
        this.state.ticketBook = this.state.ticketBook.filter((x) => x.id !== id);
        const removed = before - this.state.ticketBook.length;
        let prunedCampaigns = 0;
        if (removed > 0) {
            this.markDirty('ticketBook');
            const cleanup = this.pruneOrphanCampaigns({ save: false });
            prunedCampaigns = cleanup.removed.length;
            this.save(true);
        }
        return {
            removed: removed > 0,
            removedTickets: removed > 0 ? removedTickets : 0,
            prunedCampaigns
        };
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

        const beforeRows = this.state.ticketBook.length;
        const beforeTickets = this.getTotalTicketCount();
        if (filter === 'pending') this.state.ticketBook = this.state.ticketBook.filter((t) => !isPending(t));
        else if (filter === 'win') this.state.ticketBook = this.state.ticketBook.filter((t) => !isWin(t));
        else if (filter === 'lose') this.state.ticketBook = this.state.ticketBook.filter((t) => !isLose(t));
        else this.state.ticketBook = [];

        const removedRows = beforeRows - this.state.ticketBook.length;
        const removedTickets = beforeTickets - this.getTotalTicketCount();
        let prunedCampaigns = 0;
        if (removedTickets > 0) {
            this.markDirty('ticketBook');
            const cleanup = this.pruneOrphanCampaigns({ save: false });
            prunedCampaigns = cleanup.removed.length;
            this.save(true);
        }
        return {
            removedTickets,
            removedRows,
            prunedCampaigns
        };
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
        return (this.state.ticketBook || []).reduce((sum, ticket) => {
            return sum + (ticket?.campaignId === targetId ? this.getTicketQuantity(ticket) : 0);
        }, 0);
    },

    countTicketsByCampaignIds(campaignIds = []) {
        const ids = new Set((campaignIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        if (!ids.size) return 0;
        return (this.state.ticketBook || []).reduce((sum, ticket) => {
            return sum + (ids.has(String(ticket?.campaignId || '').trim()) ? this.getTicketQuantity(ticket) : 0);
        }, 0);
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
        const beforeTickets = this.getTotalTicketCount();
        this.state.campaigns = this.state.campaigns.filter((item) => item?.id !== targetId);

        let removedTickets = 0;
        if (cascadeTickets) {
            this.state.ticketBook = this.state.ticketBook.filter((ticket) => ticket?.campaignId !== targetId);
            removedTickets = beforeTickets - this.getTotalTicketCount();
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

        const beforeTickets = this.getTotalTicketCount();
        this.state.campaigns = [];

        let removedTickets = 0;
        if (cascadeTickets) {
            const idSet = new Set(campaignIds.map((item) => String(item)));
            this.state.ticketBook = this.state.ticketBook.filter((ticket) => !idSet.has(String(ticket?.campaignId || '')));
            removedTickets = beforeTickets - this.getTotalTicketCount();
        }

        this.markDirty('campaigns');
        if (removedTickets > 0) this.markDirty('ticketBook');
        this.save(true);
        return { removedCampaigns, removedTickets };
    },

    addToFavorites(nums) {
        const key = nums.join(',');
        if (this.state.favorites.some((f) => f.numbers.join(',') === key)) {
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
