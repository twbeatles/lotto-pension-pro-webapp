import { normalizePension720Draw, normalizeSixDigits } from './normalize.js';

function countTrailingMatches(left = '', right = '') {
    const a = String(left || '');
    const b = String(right || '');
    let count = 0;
    for (let i = 1; i <= 6; i++) {
        if (a.at(-i) !== b.at(-i)) break;
        count += 1;
    }
    return count;
}

function buildPension720CheckResult(ticket, draw) {
    const normalizedTicket = ticket && typeof ticket === 'object' ? ticket : null;
    const normalizedDraw = normalizePension720Draw(draw);
    if (!normalizedTicket || !normalizedDraw) return null;

    const group = Number(normalizedTicket.group);
    const number = normalizeSixDigits(normalizedTicket.number);
    if (!Number.isInteger(group) || group < 1 || group > 5 || !number) return null;

    const base = {
        drawNo: normalizedDraw.draw_no,
        date: normalizedDraw.date,
        group,
        number: number.number,
        rank: 0,
        label: '낙첨',
        prizeLabel: '-',
        trailingMatches: 0,
        matchType: 'none'
    };

    if (group === normalizedDraw.group && number.number === normalizedDraw.number) {
        return {
            ...base,
            rank: 1,
            label: '1등',
            prizeLabel: '월 700만 원 x 20년',
            trailingMatches: 7,
            matchType: 'primary'
        };
    }

    if (number.number === normalizedDraw.bonus_number) {
        return {
            ...base,
            rank: 'bonus',
            label: '보너스',
            prizeLabel: '월 100만 원 x 10년',
            trailingMatches: 6,
            matchType: 'bonus'
        };
    }

    const trailingMatches = countTrailingMatches(number.number, normalizedDraw.number);
    if (trailingMatches >= 6) {
        return {
            ...base,
            rank: 2,
            label: '2등',
            prizeLabel: '월 100만 원 x 10년',
            trailingMatches,
            matchType: 'primary'
        };
    }
    if (trailingMatches === 5) {
        return {
            ...base,
            rank: 3,
            label: '3등',
            prizeLabel: '100만 원',
            trailingMatches,
            matchType: 'primary'
        };
    }
    if (trailingMatches === 4) {
        return {
            ...base,
            rank: 4,
            label: '4등',
            prizeLabel: '10만 원',
            trailingMatches,
            matchType: 'primary'
        };
    }
    if (trailingMatches === 3) {
        return {
            ...base,
            rank: 5,
            label: '5등',
            prizeLabel: '5만 원',
            trailingMatches,
            matchType: 'primary'
        };
    }
    if (trailingMatches === 2) {
        return {
            ...base,
            rank: 6,
            label: '6등',
            prizeLabel: '5천 원',
            trailingMatches,
            matchType: 'primary'
        };
    }
    if (trailingMatches === 1) {
        return {
            ...base,
            rank: 7,
            label: '7등',
            prizeLabel: '1천 원',
            trailingMatches,
            matchType: 'primary'
        };
    }
    return {
        ...base,
        trailingMatches
    };
}

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

export { buildPension720CheckResult, countTrailingMatches };
