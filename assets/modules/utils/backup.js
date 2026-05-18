const BACKUP_VERSION = 5;
const MAX_PENSION720_CAMPAIGN_WEEKS = 52;
const MAX_PENSION720_CAMPAIGN_SETS_PER_DRAW = 20;
const MAX_PENSION720_CAMPAIGN_TOTAL_TICKETS = 500;

function toObject(value, fallback = {}) {
    return value && typeof value === 'object' ? value : fallback;
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeDrawUpdate(raw) {
    const src = toObject(raw, null);
    if (!src) return null;
    const drawNo = Number(src.draw_no);
    const bonus = Number(src.bonus);
    const numbers = toArray(src.numbers)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
        .sort((a, b) => a - b);

    if (!Number.isInteger(drawNo) || drawNo < 1) return null;
    if (numbers.length !== 6) return null;
    if (new Set(numbers).size !== 6) return null;
    if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) return null;
    if (numbers.includes(bonus)) return null;

    return {
        draw_no: drawNo,
        date: typeof src.date === 'string' ? src.date : '',
        numbers,
        bonus,
        prize_amount: Number(src.prize_amount || 0),
        winners_count: Number(src.winners_count || 0),
        total_sales: Number(src.total_sales || 0)
    };
}

function dedupeDrawUpdates(items = []) {
    const map = new Map();
    items.forEach((item) => {
        const normalized = normalizeDrawUpdate(item);
        if (!normalized) return;
        map.set(normalized.draw_no, normalized);
    });
    return Array.from(map.values()).sort((a, b) => a.draw_no - b.draw_no);
}

function normalizePreset(raw, index = 0) {
    const src = toObject(raw, null);
    if (!src) return null;

    const scope = typeof src.scope === 'string' ? src.scope.trim() : '';
    const name = typeof src.name === 'string' ? src.name.trim() : '';
    if (!scope || !name) return null;

    const request = toObject(src.request || src.strategyRequest, null);
    if (!request) return null;

    const id = typeof src.id === 'string' && src.id.trim() ? src.id.trim() : `preset_${scope}_${name}_${index}`;

    return {
        id,
        scope,
        name,
        description: typeof src.description === 'string' ? src.description.slice(0, 200) : '',
        request,
        createdAt: typeof src.createdAt === 'string' ? src.createdAt : new Date().toISOString(),
        updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : new Date().toISOString()
    };
}

function dedupePresets(items = []) {
    const byId = new Map();
    const byScopeAndName = new Set();
    items.forEach((item, index) => {
        const normalized = normalizePreset(item, index);
        if (!normalized) return;
        const key = `${normalized.scope}|${normalized.name}`;
        if (byId.has(normalized.id) || byScopeAndName.has(key)) return;
        byId.set(normalized.id, normalized);
        byScopeAndName.add(key);
    });
    return Array.from(byId.values());
}

function normalizePension720Ticket(raw, index = 0) {
    const src = toObject(raw, null);
    if (!src) return null;
    const group = Number(src.group);
    const number = String(src.number ?? '').trim();
    const targetDrawNo = Number(src.targetDrawNo);
    if (!Number.isInteger(group) || group < 1 || group > 5) return null;
    if (!/^\d{6}$/.test(number)) return null;

    return {
        id: typeof src.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(src.id) ? src.id : `p720_import_${index}`,
        group,
        number,
        digits: number.split('').map(Number),
        source: ['recommendation', 'campaign', 'import'].includes(src.source) ? src.source : 'import',
        targetDrawNo: Number.isFinite(targetDrawNo) && targetDrawNo >= 1 ? Math.floor(targetDrawNo) : null,
        campaignId:
            typeof src.campaignId === 'string' && src.campaignId.trim() ? src.campaignId.trim().slice(0, 120) : '',
        strategyRequest: toObject(src.strategyRequest, null),
        score: Number.isFinite(Number(src.score)) ? Number(src.score) : 0,
        memo: typeof src.memo === 'string' ? src.memo.slice(0, 200) : '',
        createdAt: typeof src.createdAt === 'string' ? src.createdAt : new Date().toISOString()
    };
}

function dedupePension720Tickets(items = []) {
    const map = new Map();
    items.forEach((item, index) => {
        const normalized = normalizePension720Ticket(item, index);
        if (!normalized) return;
        const key = [normalized.group, normalized.number, normalized.targetDrawNo || '-', normalized.campaignId || '-'].join(
            '|'
        );
        if (!map.has(key)) map.set(key, normalized);
    });
    return Array.from(map.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function normalizePension720Campaign(raw, index = 0) {
    const src = toObject(raw, null);
    if (!src) return null;
    const startDrawNo = Number(src.startDrawNo);
    const weeks = Number(src.weeks);
    const setsPerDraw = Number(src.setsPerDraw ?? src.setsPerWeek);
    if (!Number.isFinite(startDrawNo) || !Number.isFinite(weeks) || !Number.isFinite(setsPerDraw)) return null;
    const normalizedWeeks = Math.max(1, Math.floor(weeks));
    const normalizedSetsPerDraw = Math.max(1, Math.floor(setsPerDraw));
    if (normalizedWeeks > MAX_PENSION720_CAMPAIGN_WEEKS) return null;
    if (normalizedSetsPerDraw > MAX_PENSION720_CAMPAIGN_SETS_PER_DRAW) return null;
    if (normalizedWeeks * normalizedSetsPerDraw > MAX_PENSION720_CAMPAIGN_TOTAL_TICKETS) return null;

    return {
        id:
            typeof src.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(src.id)
                ? src.id
                : `p720_campaign_import_${index}`,
        name: typeof src.name === 'string' ? src.name.trim().slice(0, 80) : 'pension720 campaign',
        startDrawNo: Math.max(1, Math.floor(startDrawNo)),
        weeks: normalizedWeeks,
        setsPerDraw: normalizedSetsPerDraw,
        strategyRequest: toObject(src.strategyRequest, null),
        createdAt: typeof src.createdAt === 'string' ? src.createdAt : new Date().toISOString()
    };
}

function dedupePension720Campaigns(items = []) {
    const map = new Map();
    items.forEach((item, index) => {
        const normalized = normalizePension720Campaign(item, index);
        if (!normalized || map.has(normalized.id)) return;
        map.set(normalized.id, normalized);
    });
    return Array.from(map.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function buildBackupPayload(state = {}, extras = {}) {
    const safeState = toObject(state, {});
    const settings = {
        theme: safeState.theme === 'light' ? 'light' : 'dark',
        customProxy: typeof safeState.customProxy === 'string' ? safeState.customProxy : '',
        strategyPrefs: toObject(safeState.strategyPrefs, {})
    };

    return {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        favorites: toArray(safeState.favorites),
        history: toArray(safeState.history),
        ticketBook: toArray(safeState.ticketBook),
        campaigns: toArray(safeState.campaigns),
        pension720Tickets: dedupePension720Tickets(toArray(safeState.pension720Tickets)),
        pension720Campaigns: dedupePension720Campaigns(toArray(safeState.pension720Campaigns)),
        alertPrefs: toObject(safeState.alertPrefs, {}),
        settings,
        localUpdates: dedupeDrawUpdates(toArray(extras.localUpdates)),
        strategyPresets: dedupePresets(toArray(extras.strategyPresets ?? safeState.strategyPresets))
    };
}

export function normalizeBackupPayload(raw) {
    const source = toObject(raw, null);
    if (!source) return null;

    const version = Number(source.version || 1);
    if (![1, 2, 3, 4, 5].includes(version)) return null;

    const settings = toObject(source.settings, {});
    return {
        version,
        favorites: toArray(source.favorites),
        history: toArray(source.history),
        ticketBook: version >= 2 ? toArray(source.ticketBook) : [],
        campaigns: version >= 2 ? toArray(source.campaigns) : [],
        pension720Tickets: version >= 4 ? dedupePension720Tickets(toArray(source.pension720Tickets)) : [],
        pension720Campaigns: version >= 5 ? dedupePension720Campaigns(toArray(source.pension720Campaigns)) : [],
        alertPrefs: version >= 2 ? toObject(source.alertPrefs, {}) : {},
        settings: {
            theme: settings.theme,
            customProxy: settings.customProxy,
            strategyPrefs: settings.strategyPrefs
        },
        localUpdates: version >= 3 ? dedupeDrawUpdates(toArray(source.localUpdates)) : [],
        strategyPresets: version >= 3 ? dedupePresets(toArray(source.strategyPresets)) : []
    };
}
