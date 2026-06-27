export const recordTicketCleanupMethods = {
    cleanupStoredRecords({ keepHistory = 200, removeSettledLosses = true } = {}) {
        const normalizedKeepHistory = Math.max(0, Math.floor(Number(keepHistory) || 0));
        const historyBefore = Array.isArray(this.state.history) ? this.state.history.length : 0;
        const ticketRowsBefore = Array.isArray(this.state.ticketBook) ? this.state.ticketBook.length : 0;
        const ticketCountBefore = this.getTotalTicketCount();

        let historyTrimmed = 0;
        if (normalizedKeepHistory > 0 && historyBefore > normalizedKeepHistory) {
            this.state.history = this.state.history.slice(0, normalizedKeepHistory);
            historyTrimmed = historyBefore - this.state.history.length;
            this.markDirty('hist');
        }

        let removedTicketRows = 0;
        let removedTickets = 0;
        if (removeSettledLosses) {
            const keptTickets = [];
            (this.state.ticketBook || []).forEach((ticket) => {
                const isSettledLoss = Boolean(ticket?.checked) && Number(ticket.checked?.rank || 0) === 0;
                if (!isSettledLoss) {
                    keptTickets.push(ticket);
                    return;
                }
                removedTicketRows++;
                removedTickets += this.getTicketQuantity(ticket);
            });
            if (removedTicketRows > 0) {
                this.state.ticketBook = keptTickets;
                this.markDirty('ticketBook');
            }
        }

        const campaignCleanup = removedTicketRows > 0 ? this.pruneOrphanCampaigns({ save: false }) : { removed: [] };
        const removedCampaigns = campaignCleanup.removed.length;

        if (historyTrimmed > 0 || removedTicketRows > 0 || removedCampaigns > 0) {
            this.save(true);
        }

        return {
            historyTrimmed,
            removedTicketRows,
            removedTickets,
            removedCampaigns,
            before: {
                history: historyBefore,
                ticketRows: ticketRowsBefore,
                tickets: ticketCountBefore
            },
            after: {
                history: this.state.history?.length || 0,
                ticketRows: this.state.ticketBook?.length || 0,
                tickets: this.getTotalTicketCount()
            }
        };
    }
};