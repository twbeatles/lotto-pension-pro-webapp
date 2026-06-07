export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => document.querySelectorAll(selector);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
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

export const LOTTO645_DRAW_SCHEDULE_KST = {
    baseDrawNo: 1,
    baseDateUtc: Date.UTC(2002, 11, 7, 0, 0, 0), // 2002-12-07 Saturday KST, interpreted as UTC for local math.
    intervalDays: 7,
    cutoffHour: 20,
    cutoffMinute: 35,
    publishGraceMinutes: 30
};

export const PENSION720_DRAW_SCHEDULE_KST = {
    baseDrawNo: 1,
    baseDateUtc: Date.UTC(2020, 4, 7, 0, 0, 0), // 2020-05-07 Thursday KST, interpreted as UTC for local math.
    intervalDays: 7,
    cutoffHour: 19,
    cutoffMinute: 5,
    publishGraceMinutes: 30
};

export const estimateLatestScheduledDrawKST = (schedule, nowKstUtc = _nowKSTAsUtcDate()) => {
    const baseDrawNo = Math.max(1, Math.floor(Number(schedule?.baseDrawNo || 1)));
    const baseDateUtc = Number(schedule?.baseDateUtc || 0);
    const intervalDays = Math.max(1, Math.floor(Number(schedule?.intervalDays || 7)));
    const cutoffHour = Math.max(0, Math.min(23, Math.floor(Number(schedule?.cutoffHour || 0))));
    const cutoffMinute = Math.max(0, Math.min(59, Math.floor(Number(schedule?.cutoffMinute || 0))));
    const publishGraceMinutes = Math.max(0, Math.floor(Number(schedule?.publishGraceMinutes || 0)));

    const daysDiff = Math.floor((nowKstUtc.getTime() - baseDateUtc) / 86400000);
    let estimated = Math.floor(daysDiff / intervalDays) + baseDrawNo;
    estimated = Math.max(baseDrawNo, estimated);
    const cutoffUtc = new Date(
        baseDateUtc +
            (estimated - baseDrawNo) * intervalDays * 86400000 +
            cutoffHour * 3600000 +
            cutoffMinute * 60000 +
            publishGraceMinutes * 60000
    );
    if (nowKstUtc.getTime() < cutoffUtc.getTime()) estimated -= 1;

    return Math.max(baseDrawNo, estimated);
};

export const estimateLatestDrawKST = (nowKstUtc = _nowKSTAsUtcDate()) =>
    estimateLatestScheduledDrawKST(LOTTO645_DRAW_SCHEDULE_KST, nowKstUtc);

export const estimateLatestPension720DrawKST = (nowKstUtc = _nowKSTAsUtcDate()) =>
    estimateLatestScheduledDrawKST(PENSION720_DRAW_SCHEDULE_KST, nowKstUtc);
