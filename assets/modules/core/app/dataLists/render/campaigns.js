import { $ } from '../../../../utils/utils.js';
import { renderEmpty } from './helpers.js';

export function renderCampaignsList(ctx) {
    const campaigns = (ctx.data.state.campaigns || []).filter((item) =>
        ctx.matchesSearch(ctx.getDataListState('campaign').query, [item.name, item.startDrawNo])
    );
    const campaignPage = ctx.paginateItems('campaign', campaigns);
    if (!campaignPage.totalItems) {
        renderEmpty(
            '#campaignList',
            'ph-calendar-blank',
            ctx.getDataListState('campaign').query ? '검색 결과가 없습니다.' : '등록된 캠페인이 없습니다.'
        );
    } else {
        $('#campaignList').innerHTML = campaignPage.items
            .map(
                (item) => `
                <div class="result-item" data-id="${ctx.escapeHtml(item.id)}">
                    <div class="result-main">
                        <strong class="result-title">${ctx.escapeHtml(item.name)}</strong>
                        <span class="result-meta">${item.startDrawNo}회차 시작 · ${item.weeks}주 · 주당 ${item.setsPerWeek}세트</span>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn" data-action="delete" title="삭제" aria-label="캠페인 삭제"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
            `
            )
            .join('');
    }
    ctx.renderPagination('#campaignPagination', 'campaign', campaignPage);
}