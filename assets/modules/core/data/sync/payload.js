export const dataSyncPayloadMethods = {
    normalizeDrawItem(raw) {
        if (!raw) return null;
        const drawNo = Number(raw.draw_no ?? raw.ltEpsd);
        if (!drawNo || !Number.isFinite(drawNo)) return null;

        const numbers = Array.isArray(raw.numbers)
            ? raw.numbers
            : [raw.tm1WnNo, raw.tm2WnNo, raw.tm3WnNo, raw.tm4WnNo, raw.tm5WnNo, raw.tm6WnNo];

        const dateRaw = String(raw.date ?? raw.ltRflYmd ?? '');
        const date = dateRaw.length === 8
            ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
            : dateRaw;

        const normalizedNumbers = (numbers || [])
            .map(Number)
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
            .sort((a, b) => a - b);
        const bonus = Number(raw.bonus ?? raw.bnsWnNo ?? 0);

        const normalized = {
            draw_no: drawNo,
            date,
            numbers: normalizedNumbers,
            bonus,
            prize_amount: Number(raw.prize_amount ?? raw.rnk1WnAmt ?? 0),
            winners_count: Number(raw.winners_count ?? raw.rnk1WnNope ?? 0),
            total_sales: Number(raw.total_sales ?? raw.rlvtEpsdSumNtslAmt ?? 0)
        };
        if (normalized.numbers.length !== 6) return null;
        if (new Set(normalized.numbers).size !== 6) return null;
        if (!Number.isInteger(normalized.bonus) || normalized.bonus < 1 || normalized.bonus > 45) return null;
        if (normalized.numbers.includes(normalized.bonus)) return null;
        return normalized;
    },

    parseSyncPayload(rawText = '') {
        let text = String(rawText || '').trim();
        if (!text) return null;

        if (text.startsWith('Title:') && text.includes('Markdown Content:')) {
            text = text.split('Markdown Content:').slice(1).join('Markdown Content:').trim();
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (_e) {
            return null;
        }

        if (typeof parsed === 'string') {
            try {
                parsed = JSON.parse(parsed);
            } catch (_e) {
                return null;
            }
        }

        if (parsed?.contents && typeof parsed.contents === 'string') {
            try {
                parsed = JSON.parse(parsed.contents);
            } catch (_e) {
                return null;
            }
        } else if (parsed?.contents) {
            parsed = parsed.contents;
        }

        return parsed && typeof parsed === 'object' ? parsed : null;
    },

    describePayloadShape(payload) {
        if (!payload || typeof payload !== 'object') {
            return {
                payloadType: typeof payload,
                keys: []
            };
        }

        const keys = Object.keys(payload).slice(0, 12);
        return {
            payloadType: Array.isArray(payload) ? 'array' : 'object',
            keys,
            hasNormalized: Array.isArray(payload?.normalized),
            normalizedCount: Array.isArray(payload?.normalized) ? payload.normalized.length : 0,
            hasDataList: Array.isArray(payload?.data?.list),
            dataListCount: Array.isArray(payload?.data?.list) ? payload.data.list.length : 0,
            hasDataArray: Array.isArray(payload?.data),
            dataCount: Array.isArray(payload?.data) ? payload.data.length : 0
        };
    },

    extractSingleDrawFromPayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (Array.isArray(payload?.normalized) && payload.normalized[0]) {
            return this.normalizeDrawItem(payload.normalized[0]);
        }
        if (Array.isArray(payload?.data?.list) && payload.data.list[0]) {
            return this.normalizeDrawItem(payload.data.list[0]);
        }
        if (Array.isArray(payload?.data) && payload.data[0]) {
            return this.normalizeDrawItem(payload.data[0]);
        }
        return this.normalizeDrawItem(payload);
    }
};
