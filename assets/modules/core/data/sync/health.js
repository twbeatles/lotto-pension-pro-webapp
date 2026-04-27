import { CONFIG } from '../../../utils/config.js';

export const dataSyncHealthMethods = {
    assessWinningStatsStructure(items = []) {
        const drawNumbers = new Set();
        let latestDrawNo = 0;
        let duplicateCount = 0;

        (Array.isArray(items) ? items : []).forEach((item) => {
            const drawNo = Number(item?.draw_no || 0);
            if (!Number.isInteger(drawNo) || drawNo < 1) return;
            if (drawNumbers.has(drawNo)) duplicateCount++;
            drawNumbers.add(drawNo);
            latestDrawNo = Math.max(latestDrawNo, drawNo);
        });

        const expectedMissing = [];
        const unexpectedMissing = [];
        const allowedMissing = new Set(
            (CONFIG.LIMITS.MISSING_DRAWS || [])
                .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
                .filter(Boolean)
        );

        for (let drawNo = 1; drawNo <= latestDrawNo; drawNo++) {
            if (drawNumbers.has(drawNo)) continue;
            if (allowedMissing.has(drawNo)) expectedMissing.push(drawNo);
            else unexpectedMissing.push(drawNo);
        }

        return {
            latestDrawNo,
            totalDraws: drawNumbers.size,
            duplicateCount,
            expectedMissing,
            unexpectedMissing,
            isStructurallyComplete: latestDrawNo > 0 && duplicateCount === 0 && unexpectedMissing.length === 0
        };
    },

    summarizeMissingDraws(drawNos = []) {
        const list = [
            ...new Set(
                (Array.isArray(drawNos) ? drawNos : []).map((value) => Math.floor(Number(value) || 0)).filter(Boolean)
            )
        ];
        if (!list.length) return '';
        const preview = list.slice(0, 5).join(', ');
        return list.length > 5 ? `${preview} 외 ${list.length - 5}개` : preview;
    },

    getWinningStatsDataHealth({ staticItems = [], localUpdates = [], mergedItems = [], staticError = null } = {}) {
        const normalizedStatic = Array.isArray(staticItems) ? staticItems : [];
        const normalizedLocalUpdates = Array.isArray(localUpdates) ? localUpdates : [];
        const normalizedMerged = Array.isArray(mergedItems) ? mergedItems : [];
        const latestDrawNo = Math.max(0, Math.floor(Number(normalizedMerged[0]?.draw_no || 0)));
        const staticAvailable = normalizedStatic.length > 0;
        const localAvailable = normalizedLocalUpdates.length > 0;
        const staticStructure = this.assessWinningStatsStructure(normalizedStatic);
        const mergedStructure = this.assessWinningStatsStructure(normalizedMerged);
        const activeStructure = localAvailable ? mergedStructure : staticStructure;

        if (staticAvailable && activeStructure.isStructurallyComplete) {
            return this.mergeDataHealth({
                availability: 'full',
                source: localAvailable ? 'static_local' : 'static',
                latestDrawNo,
                message: localAvailable
                    ? '정적 JSON 전체 데이터에 로컬 최신 회차 보정이 함께 반영되어 있습니다.'
                    : '정적 JSON 전체 데이터를 사용 중입니다.'
            });
        }

        if (latestDrawNo > 0) {
            const source = staticAvailable
                ? localAvailable
                    ? 'static_local'
                    : 'static'
                : localAvailable
                  ? 'local_only'
                  : 'none';
            const missingSummary = this.summarizeMissingDraws(activeStructure.unexpectedMissing);
            const dataLabel =
                localAvailable && staticAvailable ? '정적 JSON과 로컬 최신 회차 보정 데이터' : '정적 JSON 전체 데이터';
            return this.mergeDataHealth({
                availability: 'partial',
                source,
                latestDrawNo,
                message: staticAvailable
                    ? `${dataLabel}가 완전하지 않아 일부 데이터만 사용 중입니다.${missingSummary ? ` (누락 회차: ${missingSummary})` : ''}`
                    : localAvailable
                      ? '정적 JSON을 불러오지 못해 로컬 최신 회차 일부 데이터만 사용 중입니다.'
                      : '전체 데이터셋이 없어 최근 일부 회차만 사용할 수 있습니다.'
            });
        }

        return this.mergeDataHealth({
            availability: 'none',
            source: 'none',
            latestDrawNo: 0,
            message: staticError
                ? '정적 JSON과 로컬 보정 데이터를 모두 사용할 수 없습니다.'
                : '사용 가능한 당첨 데이터가 없습니다.'
        });
    },

    createSyncProfile(options = {}) {
        const trigger = String(options?.trigger || '');
        if (['idle', 'auto', 'online', 'resume', 'proxy-change'].includes(trigger)) {
            return {
                trigger,
                silent: true,
                settleSilent: true,
                toast: false,
                requestSystemNotification: false
            };
        }
        return {
            trigger: trigger === 'refresh' ? 'refresh' : 'manual',
            silent: false,
            settleSilent: false,
            toast: true,
            requestSystemNotification: true
        };
    },

    logSync(code, message, meta = null) {
        if (meta && typeof meta === 'object') {
            console.log(`[${code}] ${message}`, meta);
            return;
        }
        console.log(`[${code}] ${message}`);
    }
};
