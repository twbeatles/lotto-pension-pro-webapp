import { FIXED_PRIZE_BY_RANK, resolvePayoutMode } from '../shared.js';

export const strategyEvaluationTicketMethods = {
    rankTicket(myNums, winNums, bonus) {
        let hit = 0;
        let hasBonus = false;
        myNums.forEach((n) => {
            if (winNums.includes(n)) hit++;
            if (n === bonus) hasBonus = true;
        });
        if (hit === 6) return 1;
        if (hit === 5 && hasBonus) return 2;
        if (hit === 5) return 3;
        if (hit === 4) return 4;
        if (hit === 3) return 5;
        return 0;
    },

    evaluateTicketSet(ticket, draw, options = {}) {
        if (!Array.isArray(ticket) || ticket.length !== 6) return { rank: 0, prize: 0 };
        if (!draw || !Array.isArray(draw.numbers)) return { rank: 0, prize: 0 };
        const rank = this.rankTicket(ticket, draw.numbers, draw.bonus);
        if (rank < 1 || rank > 5) return { rank: 0, prize: 0 };

        const payoutMode = resolvePayoutMode(options.payoutMode);
        if (rank === 1 && payoutMode === 'hybrid_dynamic_first') {
            const dynamicPrize = Number(draw.prize_amount || 0);
            if (Number.isFinite(dynamicPrize) && dynamicPrize > 0) {
                return { rank, prize: dynamicPrize };
            }
        }
        return { rank, prize: FIXED_PRIZE_BY_RANK[rank] || 0 };
    }
};