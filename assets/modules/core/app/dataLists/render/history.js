import { $ } from '../../../../utils/utils.js';
import { UIManager } from '../../../UIManager.js';
import { renderEmpty } from './helpers.js';

export function renderHistoryList(ctx) {
    const history = (ctx.data.state.history || [])
        .map((item, rawIndex) => ({ item, rawIndex }))
        .filter(({ item }) =>
            ctx.matchesSearch(ctx.getDataListState('history').query, [
                (item.numbers || []).join(', '),
                item.date,
                ctx.formatDate(item.date)
            ])
        );
    const historyPage = ctx.paginateItems('history', history);
    if (!historyPage.totalItems) {
        renderEmpty(
            '#historyList',
            'ph-clock-counter-clockwise',
            ctx.getDataListState('history').query ? '검색 결과가 없습니다.' : '생성 히스토리가 없습니다.'
        );
    } else {
        $('#historyList').innerHTML = historyPage.items
            .map(
                ({ item, rawIndex }) => `
                <div class="result-item" data-raw-index="${rawIndex}">
                    <div class="result-main">
                        <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                        <span class="result-meta">${ctx.formatDate(item.date)}</span>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                        <button class="icon-btn" data-action="qr" title="QR"><i class="ph ph-qr-code"></i></button>
                    </div>
                </div>
            `
            )
            .join('');
    }
    ctx.renderPagination('#historyPagination', 'history', historyPage);
}