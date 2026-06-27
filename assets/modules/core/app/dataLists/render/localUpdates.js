import { $ } from '../../../../utils/utils.js';

export function renderLocalUpdatesSummary(ctx) {
    const localUpdates = ctx.data.getLocalUpdates();
    const localUpdatesSummary = $('#localUpdatesSummary');
    if (localUpdatesSummary) {
        localUpdatesSummary.textContent = localUpdates.length
            ? `로컬 최신 회차 보정 데이터 ${localUpdates.length}개가 저장되어 있습니다.`
            : '저장된 로컬 최신 회차 보정 데이터가 없습니다.';
    }
    const localUpdatesMeta = $('#localUpdatesMeta');
    if (localUpdatesMeta) {
        const latestLocalDraw = localUpdates.length
            ? Math.max(...localUpdates.map((item) => Number(item?.draw_no || 0)))
            : 0;
        localUpdatesMeta.textContent =
            latestLocalDraw > 0 ? `가장 최근 로컬 반영 회차: ${latestLocalDraw}회` : '정적 JSON만 사용 중입니다.';
    }
    const clearLocalUpdatesBtn = $('#clearLocalUpdatesBtn');
    if (clearLocalUpdatesBtn) clearLocalUpdatesBtn.disabled = !localUpdates.length;
}