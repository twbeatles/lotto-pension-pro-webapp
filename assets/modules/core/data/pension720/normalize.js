function normalizePension720Date(rawValue = '') {
    const raw = String(rawValue ?? '').trim();
    const normalized = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return normalized;
}

function normalizeSixDigits(rawValue = '') {
    const text = String(rawValue ?? '').trim();
    if (!/^\d{6}$/.test(text)) return null;
    return {
        number: text,
        digits: text.split('').map(Number)
    };
}

function normalizePension720Draw(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const drawNo = Number(raw.draw_no ?? raw.psltEpsd);
    const group = Number(raw.group ?? raw.wnBndNo);
    const primary = normalizeSixDigits(raw.number ?? raw.wnRnkVl);
    const bonus = normalizeSixDigits(raw.bonus_number ?? raw.bnsRnkVl);
    const date = normalizePension720Date(raw.date ?? raw.psltRflYmd);

    if (!Number.isInteger(drawNo) || drawNo < 1) return null;
    if (!Number.isInteger(group) || group < 1 || group > 5) return null;
    if (!primary || !bonus || !date) return null;

    return {
        draw_no: drawNo,
        date,
        group,
        digits: primary.digits,
        number: primary.number,
        bonus_digits: bonus.digits,
        bonus_number: bonus.number
    };
}

export { normalizePension720Date, normalizePension720Draw, normalizeSixDigits };
