import { estimateLatestDrawKST } from '../../../../utils/utils.js';

export const dataPersistenceLocalUpdateSanitizeMethods = {
    sanitizeLocalUpdates(items = []) {
        const maxAllowedDrawNo = Math.max(1, estimateLatestDrawKST() + 2);
        const map = new Map();
        let droppedInvalid = 0;
        let droppedFuture = 0;

        (Array.isArray(items) ? items : []).forEach((item) => {
            const normalized = this.normalizeDrawItem(item);
            if (!normalized) {
                droppedInvalid++;
                return;
            }
            if (Number(normalized.draw_no) > maxAllowedDrawNo) {
                droppedFuture++;
                return;
            }
            map.set(Number(normalized.draw_no), normalized);
        });

        return {
            items: Array.from(map.values()).sort((a, b) => Number(a.draw_no) - Number(b.draw_no)),
            droppedInvalid,
            droppedFuture,
            droppedTotal: droppedInvalid + droppedFuture,
            maxAllowedDrawNo
        };
    },

    buildLocalUpdateWarningMessage(result = {}) {
        const droppedFuture = Math.max(0, Number(result?.droppedFuture || 0));
        const maxAllowedDrawNo = Math.max(0, Number(result?.maxAllowedDrawNo || 0));
        if (!droppedFuture) return '';
        return `예상 최신 회차 기준보다 앞선 로컬 업데이트 ${droppedFuture}개를 제외했습니다. (허용 상한 ${maxAllowedDrawNo}회)`;
    },

    isLocalUpdateWarningMessage(message = '') {
        const text = String(message || '');
        return text.includes('로컬 업데이트') && text.includes('허용 상한');
    }
};