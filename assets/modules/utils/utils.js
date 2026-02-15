export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => document.querySelectorAll(selector);
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- Draw schedule (KST cutoff) ----
export const _tzParts = (timeZone) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = dtf.formatToParts(new Date());
    const get = (type) => Number(parts.find(p => p.type === type)?.value || 0);
    return {
        y: get('year'),
        m: get('month'),
        d: get('day'),
        hh: get('hour'),
        mm: get('minute'),
        ss: get('second')
    };
};

export const _nowKSTAsUtcDate = () => {
    const p = _tzParts('Asia/Seoul');
    return new Date(Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss));
};

export const estimateLatestDrawKST = (nowKstUtc = _nowKSTAsUtcDate()) => {
    const BASE_DRAW_NO = 1;
    const BASE_DATE_UTC = Date.UTC(2002, 11, 7, 0, 0, 0); // 2002-12-07 (KST interpreted as UTC for math)
    const INTERVAL_DAYS = 7;
    const CUTOFF_HOUR = 21; // Saturday 21:00 KST

    const daysDiff = Math.floor((nowKstUtc.getTime() - BASE_DATE_UTC) / 86400000);
    let estimated = Math.floor(daysDiff / INTERVAL_DAYS) + BASE_DRAW_NO;
    estimated = Math.max(BASE_DRAW_NO, estimated);

    const cutoffUtc = new Date(BASE_DATE_UTC + (estimated - BASE_DRAW_NO) * INTERVAL_DAYS * 86400000 + CUTOFF_HOUR * 3600000);
    if (nowKstUtc.getTime() < cutoffUtc.getTime()) estimated -= 1;

    return Math.max(BASE_DRAW_NO, estimated);
};
