import { buildPension720CheckResult } from './match.js';

export const dataPension720CheckMethods = {
    evaluatePension720Ticket(ticket, draw = null) {
        return buildPension720CheckResult(ticket, draw || this.state.pension720Stats?.[0]);
    },

    resolvePension720TicketCheck(ticket, options = {}) {
        const stats = Array.isArray(this.state.pension720Stats) ? this.state.pension720Stats : [];
        const latest = options.latest || stats[0] || null;
        const latestDrawNo = Math.max(0, Math.floor(Number(latest?.draw_no || 0)));
        const targetDrawNo = Math.floor(Number(ticket?.targetDrawNo || 0));
        const hasTarget = Number.isInteger(targetDrawNo) && targetDrawNo >= 1;

        if (hasTarget) {
            if (!latestDrawNo || targetDrawNo > latestDrawNo) {
                return {
                    ticket,
                    status: 'pending',
                    statusLabel: '대기',
                    checkBasis: 'target',
                    drawNo: targetDrawNo,
                    draw: null,
                    result: null
                };
            }

            const draw = stats.find((item) => Number(item?.draw_no) === targetDrawNo) || null;
            if (!draw) {
                return {
                    ticket,
                    status: 'missing',
                    statusLabel: '데이터 없음',
                    checkBasis: 'target',
                    drawNo: targetDrawNo,
                    draw: null,
                    result: null
                };
            }

            return {
                ticket,
                status: 'target',
                statusLabel: '대상 회차',
                checkBasis: 'target',
                drawNo: targetDrawNo,
                draw,
                result: this.evaluatePension720Ticket(ticket, draw)
            };
        }

        return {
            ticket,
            status: 'reference',
            statusLabel: '참고 비교',
            checkBasis: 'latest_reference',
            drawNo: latestDrawNo || null,
            draw: latest,
            result: latest ? this.evaluatePension720Ticket(ticket, latest) : null
        };
    }
};