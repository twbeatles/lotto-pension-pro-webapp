import { CONFIG } from '../../../utils/config.js';

export function capImportHistory(history = []) {
    const items = Array.isArray(history) ? history : [];
    const capped = items.slice(0, CONFIG.LIMITS.MAX_HIST);
    return {
        items: capped,
        trimmed: Math.max(0, items.length - capped.length)
    };
}