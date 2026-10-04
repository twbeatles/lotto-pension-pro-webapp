import { $ } from '../../../../utils/utils.js';
import { UIManager } from '../../../UIManager.js';
import { renderEmpty } from './helpers.js';

export function renderFavoritesList(ctx) {
    const favorites = (ctx.data.state.favorites || [])
        .map((item, rawIndex) => ({ item, rawIndex }))
        .filter(({ item }) =>
            ctx.matchesSearch(ctx.getDataListState('fav').query, [
                (item.numbers || []).join(', '),
                item.date,
                ctx.formatDate(item.date)
            ])
        );
    const favoritePage = ctx.paginateItems('fav', favorites);
    if (!favoritePage.totalItems) {
        renderEmpty(
            '#favList',
            'ph-folder-open',
            ctx.getDataListState('fav').query ? '검색 결과가 없습니다.' : '저장된 즐겨찾기가 없습니다.'
        );
    } else {
        $('#favList').innerHTML = favoritePage.items
            .map(
                ({ item, rawIndex }) => `
                <div class="result-item" data-raw-index="${rawIndex}">
                    <div class="result-main">
                        <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                        <span class="result-meta">${ctx.formatDate(item.date)}</span>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn" type="button" data-action="ticket" title="다음 회차 구매 번호로 저장" aria-label="다음 회차 구매 번호로 저장"><i class="ph ph-ticket"></i></button>
                        <button class="icon-btn" type="button" data-action="copy" title="복사" aria-label="번호 복사"><i class="ph ph-copy"></i></button>
                        <button class="icon-btn" type="button" data-action="qr" title="QR 코드" aria-label="QR 코드 보기"><i class="ph ph-qr-code"></i></button>
                        <button class="icon-btn danger" type="button" data-action="delete" title="삭제" aria-label="삭제"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
            `
            )
            .join('');
    }
    ctx.renderPagination('#favPagination', 'fav', favoritePage);
}