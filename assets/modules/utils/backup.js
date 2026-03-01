const BACKUP_VERSION = 3;

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

    const id = (typeof src.id === 'string' && src.id.trim())
        ? src.id.trim()
        : `preset_${scope}_${name}_${index}`;

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
    if (![1, 2, 3].includes(version)) return null;

    const settings = toObject(source.settings, {});
    return {
        version,
        favorites: toArray(source.favorites),
        history: toArray(source.history),
        ticketBook: version >= 2 ? toArray(source.ticketBook) : [],
        campaigns: version >= 2 ? toArray(source.campaigns) : [],
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
