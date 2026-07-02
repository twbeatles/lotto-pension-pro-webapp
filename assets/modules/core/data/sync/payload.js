import {
    describePayloadShape,
    extractSingleDrawFromPayload,
    normalizeDrawDate,
    normalizeDrawItem,
    parseSyncPayload
} from './lottoPayloadCore.js';

export const dataSyncPayloadMethods = {
    normalizeDrawDate(rawValue = '') {
        return normalizeDrawDate(rawValue);
    },

    normalizeDrawItem(raw) {
        return normalizeDrawItem(raw);
    },

    parseSyncPayload(rawText = '') {
        return parseSyncPayload(rawText);
    },

    describePayloadShape(payload) {
        return describePayloadShape(payload);
    },

    extractSingleDrawFromPayload(payload) {
        return extractSingleDrawFromPayload(payload);
    }
};