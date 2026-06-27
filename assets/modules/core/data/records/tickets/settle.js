export const recordTicketSettleMethods = {
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
    }
};