import { normalizeSixDigitString } from './primitives.js';

export function normalizeDraw(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const drawNo = Number(raw.draw_no);
    const group = Number(raw.group);
    const number = normalizeSixDigitString(raw.number);
    const bonusNumber = normalizeSixDigitString(raw.bonus_number);
    if (!Number.isInteger(drawNo) || drawNo < 1) return null;
    if (!Number.isInteger(group) || group < 1 || group > 5) return null;
    if (!number || !bonusNumber) return null;
    return {
        draw_no: drawNo,
        date: typeof raw.date === 'string' ? raw.date : '',
        group,
        digits: number.split('').map(Number),
        number,
        bonus_digits: bonusNumber.split('').map(Number),
        bonus_number: bonusNumber
    };
}