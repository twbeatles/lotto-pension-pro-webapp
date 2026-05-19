import { CONFIG } from '../../utils/config.js';

const PENSION720_OFFICIAL_LIST_URL = 'https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do';

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

function extractOfficialList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data?.result)) return payload.data.result;
    if (Array.isArray(payload?.result)) return payload.result;
    return [];
}

export const dataPension720Methods = {
    getDefaultPension720DataHealth() {
        return {
            availability: 'none',
            source: 'none',
            latestDrawNo: 0,
            message: '',
            updatedAt: ''
        };
    },

    mergePension720DataHealth(raw) {
        const defaults = this.getDefaultPension720DataHealth();
        const input = raw && typeof raw === 'object' ? raw : {};
        return {
            availability: ['full', 'none'].includes(input.availability) ? input.availability : defaults.availability,
            source: ['static', 'official', 'official_cache', 'none'].includes(input.source)
                ? input.source
                : defaults.source,
            latestDrawNo: Math.max(0, Math.floor(Number(input.latestDrawNo || 0))),
            message: typeof input.message === 'string' ? input.message.slice(0, 240) : defaults.message,
            updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : defaults.updatedAt
        };
    },

    setPension720DataHealth(next = {}) {
        this.pension720DataHealth = this.mergePension720DataHealth({
            ...(this.pension720DataHealth || this.getDefaultPension720DataHealth()),
            ...(next || {})
        });
        return this.pension720DataHealth;
    },

    getPension720DataHealthSourceLabel(source = this.pension720DataHealth?.source) {
        if (source === 'official') return 'official';
        if (source === 'official_cache') return 'official cache';
        if (source === 'static') return 'static';
        return 'none';
    },

    normalizePension720DrawItem(raw) {
        return normalizePension720Draw(raw);
    },

    normalizePension720Stats(items = []) {
        const map = new Map();
        (Array.isArray(items) ? items : []).forEach((item) => {
            const normalized = this.normalizePension720DrawItem(item);
            if (!normalized) return;
            map.set(normalized.draw_no, normalized);
        });
        return Array.from(map.values()).sort((a, b) => b.draw_no - a.draw_no);
    },

    readPension720StatsCache() {
        if (typeof localStorage === 'undefined') return [];
        try {
            const raw = this.safeJsonParse(
                localStorage.getItem(CONFIG.KEYS.PENSION720_STATS_CACHE) || '{}',
                {},
                CONFIG.KEYS.PENSION720_STATS_CACHE
            );
            if (Number(raw?.version || 0) !== 1) return [];
            return this.normalizePension720Stats(raw.items || []);
        } catch (_e) {
            return [];
        }
    },

    writePension720StatsCache(items = []) {
        if (typeof localStorage === 'undefined') return false;
        const normalized = this.normalizePension720Stats(items);
        if (!normalized.length) return false;
        return this._safeSetItem(
            CONFIG.KEYS.PENSION720_STATS_CACHE,
            JSON.stringify({
                version: 1,
                updatedAt: new Date().toISOString(),
                items: normalized
            })
        );
    },

    async fetchPension720Stats(options = {}) {
        const useRemote = options.remote !== false;
        const preserveExisting = options.preserveExistingOnFailure !== false;
        const previous = Array.isArray(this.state.pension720Stats) ? this.state.pension720Stats : [];
        let bestItems = [];
        let source = 'none';
        let errorMessage = '';

        try {
            const res = await this.fetchWithTimeout('data/pension720_stats.json', { cache: 'default' }, 5000);
            if (!res.ok) throw new Error(`static HTTP ${res.status}`);
            bestItems = this.normalizePension720Stats(await res.json());
            if (bestItems.length) source = 'static';
        } catch (error) {
            errorMessage = String(error?.message || '');
            console.warn('연금복권 정적 데이터 조회 실패', error);
        }

        const cachedItems = this.readPension720StatsCache();
        if (cachedItems.length && (!bestItems.length || cachedItems[0].draw_no >= bestItems[0].draw_no)) {
            bestItems = cachedItems;
            source = 'official_cache';
        }

        if (useRemote) {
            try {
                const res = await this.fetchWithTimeout(
                    PENSION720_OFFICIAL_LIST_URL,
                    {
                        cache: 'no-cache',
                        headers: {
                            Accept: 'application/json'
                        }
                    },
                    7000
                );
                if (!res.ok) throw new Error(`official HTTP ${res.status}`);
                const remoteItems = this.normalizePension720Stats(extractOfficialList(await res.json()));
                if (remoteItems.length && (!bestItems.length || remoteItems[0].draw_no >= bestItems[0].draw_no)) {
                    bestItems = remoteItems;
                    source = 'official';
                }
                if (remoteItems.length && (!cachedItems.length || remoteItems[0].draw_no >= cachedItems[0].draw_no)) {
                    this.writePension720StatsCache(remoteItems);
                }
            } catch (error) {
                errorMessage = String(error?.message || errorMessage || '');
                console.warn('연금복권 공식 데이터 조회 실패', error);
            }
        }

        if (!bestItems.length && preserveExisting && previous.length) {
            bestItems = previous;
            source = this.pension720DataHealth?.source || 'static';
            errorMessage = errorMessage || '새로고침 실패로 이전 데이터를 유지합니다.';
        }

        this.state.pension720Stats = bestItems;
        this.setPension720DataHealth({
            availability: bestItems.length ? 'full' : 'none',
            source: bestItems.length ? source : 'none',
            latestDrawNo: bestItems[0]?.draw_no || 0,
            message: bestItems.length
                ? source === 'official'
                    ? '동행복권 공식 연금복권 데이터를 사용 중입니다.'
                    : '기본 포함 연금복권 데이터를 사용 중입니다.'
                : errorMessage || '연금복권 데이터를 구성하지 못했습니다.',
            updatedAt: new Date().toISOString()
        });

        return bestItems.length > 0;
    },

    normalizePension720Ticket(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const group = Number(raw.group);
        const number = normalizeSixDigits(raw.number);
        const targetDrawNo = Number(raw.targetDrawNo);
        if (!Number.isInteger(group) || group < 1 || group > 5 || !number) return null;
        return {
            id: this.normalizeRecordId(raw.id, 'p720'),
            group,
            number: number.number,
            digits: number.digits,
            source: ['recommendation', 'campaign', 'import'].includes(raw.source) ? raw.source : 'import',
            targetDrawNo: Number.isFinite(targetDrawNo) && targetDrawNo >= 1 ? Math.floor(targetDrawNo) : null,
            campaignId:
                typeof raw.campaignId === 'string' && raw.campaignId.trim() ? raw.campaignId.trim().slice(0, 120) : '',
            strategyRequest: this.normalizeStrategyRequestSnapshot(raw.strategyRequest),
            score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
            memo: typeof raw.memo === 'string' ? raw.memo.slice(0, 200) : '',
            createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
        };
    },

    buildPension720TicketKey(ticket) {
        return [
            Number(ticket?.group || 0),
            String(ticket?.number || '').trim(),
            ticket?.targetDrawNo || '-',
            ticket?.campaignId || '-'
        ].join('|');
    },

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
    },

    mergePension720Tickets(existing = [], incoming = []) {
        const map = new Map();
        [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])].forEach((item) => {
            const normalized = this.normalizePension720Ticket(item);
            if (!normalized) return;
            const key = this.buildPension720TicketKey(normalized);
            if (!map.has(key)) map.set(key, normalized);
        });
        return Array.from(map.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    addPension720Ticket(raw, options = {}) {
        const ticket = this.normalizePension720Ticket({
            ...(raw || {}),
            source: raw?.source || 'recommendation'
        });
        if (!ticket) return { inserted: false, duplicate: false, ticket: null };
        const next = this.mergePension720Tickets(this.state.pension720Tickets || [], [ticket]);
        const before = this.state.pension720Tickets?.length || 0;
        if (next.length === before) {
            return {
                inserted: false,
                duplicate: true,
                ticket:
                    next.find(
                        (item) => this.buildPension720TicketKey(item) === this.buildPension720TicketKey(ticket)
                    ) || null
            };
        }
        this.state.pension720Tickets = next.slice(0, CONFIG.LIMITS.MAX_PENSION720_TICKETS);
        this.markDirty('pension720Tickets');
        this.save(options.immediate !== false);
        return { inserted: true, duplicate: false, ticket };
    },

    addPension720TicketsBulk(items = [], options = {}) {
        const beforeItems = this.mergePension720Tickets([], this.state.pension720Tickets || []);
        const beforeKeys = new Set(beforeItems.map((item) => this.buildPension720TicketKey(item)));
        const normalizedIncoming = (Array.isArray(items) ? items : [])
            .map((item) => this.normalizePension720Ticket(item))
            .filter(Boolean);
        const incomingUniqueKeys = new Set(normalizedIncoming.map((item) => this.buildPension720TicketKey(item)));
        const merged = this.mergePension720Tickets(beforeItems, items);
        const next = merged.slice(0, CONFIG.LIMITS.MAX_PENSION720_TICKETS);
        const afterKeys = new Set(next.map((item) => this.buildPension720TicketKey(item)));
        this.state.pension720Tickets = next;
        const inserted = Math.max(0, [...afterKeys].filter((key) => !beforeKeys.has(key)).length);
        const duplicate = Math.max(
            0,
            normalizedIncoming.length -
                incomingUniqueKeys.size +
                [...incomingUniqueKeys].filter((key) => beforeKeys.has(key)).length
        );
        const truncated = Math.max(0, merged.length - next.length);
        if (inserted > 0) {
            this.markDirty('pension720Tickets');
            this.save(options.immediate !== false);
        }
        return {
            inserted,
            duplicate,
            truncated
        };
    },

    removePension720Ticket(id) {
        const targetId = String(id || '').trim();
        const before = this.state.pension720Tickets?.length || 0;
        this.state.pension720Tickets = (this.state.pension720Tickets || []).filter((item) => item.id !== targetId);
        const removed = before - this.state.pension720Tickets.length;
        if (removed > 0) {
            this.markDirty('pension720Tickets');
            this.prunePension720CampaignsWithoutTickets({ save: false });
            this.save(true);
        }
        return removed;
    },

    clearPension720Tickets() {
        const removed = this.state.pension720Tickets?.length || 0;
        if (!removed) return 0;
        this.state.pension720Tickets = [];
        this.state.pension720Campaigns = [];
        this.markDirty('pension720Tickets');
        this.markDirty('pension720Campaigns');
        this.save(true);
        return removed;
    },

    normalizePension720CampaignEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const startDrawNo = Number(raw.startDrawNo);
        const weeks = Number(raw.weeks);
        const setsPerDraw = Number(raw.setsPerDraw ?? raw.setsPerWeek);
        if (!Number.isFinite(startDrawNo) || !Number.isFinite(weeks) || !Number.isFinite(setsPerDraw)) return null;
        const normalizedWeeks = Math.max(1, Math.floor(weeks));
        const normalizedSetsPerDraw = Math.max(1, Math.floor(setsPerDraw));
        if (normalizedWeeks > CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS) return null;
        if (normalizedSetsPerDraw > CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK) return null;
        if (normalizedWeeks * normalizedSetsPerDraw > CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS) return null;

        return {
            id: this.normalizeRecordId(raw.id, 'p720_campaign'),
            name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : 'pension720 campaign',
            startDrawNo: Math.max(1, Math.floor(startDrawNo)),
            weeks: normalizedWeeks,
            setsPerDraw: normalizedSetsPerDraw,
            strategyRequest: this.normalizeStrategyRequestSnapshot(raw.strategyRequest),
            createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
        };
    },

    mergePension720Campaigns(existing = [], incoming = []) {
        const map = new Map();
        [...(Array.isArray(incoming) ? incoming : []), ...(Array.isArray(existing) ? existing : [])].forEach((item) => {
            const normalized = this.normalizePension720CampaignEntry(item);
            if (!normalized || map.has(normalized.id)) return;
            map.set(normalized.id, normalized);
        });
        return Array.from(map.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    prunePension720CampaignsWithoutTickets({ targetIds = null, save = true } = {}) {
        const normalizedTargetIds =
            targetIds instanceof Set
                ? new Set([...targetIds].map((item) => String(item || '').trim()).filter(Boolean))
                : new Set((targetIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        const limitToTargets = normalizedTargetIds.size > 0;
        const linkedCampaignIds = new Set(
            (this.state.pension720Tickets || [])
                .map((ticket) => String(ticket?.campaignId || '').trim())
                .filter(Boolean)
        );
        const kept = [];
        const removed = [];

        (this.state.pension720Campaigns || []).forEach((campaign) => {
            const campaignId = String(campaign?.id || '').trim();
            const shouldValidate = !limitToTargets || normalizedTargetIds.has(campaignId);
            if (shouldValidate && (!campaignId || !linkedCampaignIds.has(campaignId))) {
                removed.push(campaign);
                return;
            }
            kept.push(campaign);
        });

        if (removed.length) {
            this.state.pension720Campaigns = kept;
            this.markDirty('pension720Campaigns');
            if (save) this.save(true);
        }

        return {
            campaigns: removed.length ? kept : this.state.pension720Campaigns || [],
            removed
        };
    },

    addPension720Campaign(entry) {
        const normalized = this.normalizePension720CampaignEntry(entry);
        if (!normalized) return null;
        this.state.pension720Campaigns = this.mergePension720Campaigns(this.state.pension720Campaigns || [], [
            normalized
        ]);
        this.markDirty('pension720Campaigns');
        this.save(true);
        return normalized;
    },

    countPension720TicketsByCampaignId(campaignId) {
        const targetId = String(campaignId || '').trim();
        if (!targetId) return 0;
        return (this.state.pension720Tickets || []).filter((ticket) => ticket?.campaignId === targetId).length;
    },

    removePension720Campaign(id, { cascadeTickets = true } = {}) {
        const targetId = String(id || '').trim();
        const campaign = (this.state.pension720Campaigns || []).find((item) => item?.id === targetId) || null;
        if (!campaign) {
            return {
                removedCampaign: false,
                removedTickets: 0,
                campaign: null
            };
        }

        const beforeCampaigns = this.state.pension720Campaigns.length;
        const beforeTickets = this.state.pension720Tickets?.length || 0;
        this.state.pension720Campaigns = this.state.pension720Campaigns.filter((item) => item?.id !== targetId);

        let removedTickets = 0;
        if (cascadeTickets) {
            this.state.pension720Tickets = (this.state.pension720Tickets || []).filter(
                (ticket) => ticket?.campaignId !== targetId
            );
            removedTickets = beforeTickets - this.state.pension720Tickets.length;
        }

        const removedCampaign = beforeCampaigns !== this.state.pension720Campaigns.length;
        if (removedCampaign || removedTickets > 0) {
            this.markDirty('pension720Campaigns');
            if (removedTickets > 0) this.markDirty('pension720Tickets');
            this.save(true);
        }

        return {
            removedCampaign,
            removedTickets,
            campaign
        };
    }
};
