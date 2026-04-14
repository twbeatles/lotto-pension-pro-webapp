import { estimateLatestDrawKST } from '../../../utils/utils.js';
import { UIManager } from '../../UIManager.js';

export const recordTicketMethods = {
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

        let removedTickets = beforeTickets - this.getTotalTicketCount();
        if (!Number.isFinite(removedTickets)) removedTickets = 0;
        let prunedCampaigns = 0;
        if (removedTickets > 0) {
            this.markDirty('ticketBook');
            const cleanup = this.pruneOrphanCampaigns({ save: false });
            prunedCampaigns = cleanup.removed.length;
            this.save(true);
        }
        return {
            removedTickets,
            removedRows: beforeRows - this.state.ticketBook.length,
            prunedCampaigns
        };
    }
};
