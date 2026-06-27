import { $ } from '../../../../utils/utils.js';
import { UIManager } from '../../../UIManager.js';
import { renderEmpty } from './helpers.js';

export function renderTicketsList(ctx) {
    const ticketFilter = $('#ticketFilter')?.value || 'all';
    const tickets = (ctx.data.state.ticketBook || [])
        .filter((item) => ticketFilter === 'all' || ctx.getTicketStatusMeta(item).code === ticketFilter)
        .filter((item) =>
            ctx.matchesSearch(ctx.getDataListState('ticket').query, [
                (item.numbers || []).join(', '),
                item.targetDrawNo,
                ctx.getTicketStatusMeta(item).label,
                `x${ctx.data.getTicketQuantity(item)}`
            ])
        );
    const ticketPage = ctx.paginateItems('ticket', tickets);
    ticketPage.summaryText = `총 ${ctx.data.getTotalTicketCount(tickets)}개 티켓`;
    if (!ticketPage.totalItems) {
        renderEmpty(
            '#ticketList',
            'ph-ticket',
            ctx.getDataListState('ticket').query ? '검색 결과가 없습니다.' : '조건에 맞는 티켓이 없습니다.'
        );
    } else {
        $('#ticketList').innerHTML = ticketPage.items
            .map((item) => {
                const status = ctx.getTicketStatusMeta(item);
                const quantity = ctx.data.getTicketQuantity(item);
                return `
                    <div class="result-item" data-id="${ctx.escapeHtml(item.id)}">
                        <div class="result-main">
                            <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                            <span class="result-meta result-meta-inline">
                                <span>${item.targetDrawNo}회차 · ${status.label}</span>
                                ${quantity > 1 ? `<span class="badge status-badge ticket-quantity-badge">x${quantity}</span>` : ''}
                            </span>
                        </div>
                        <div class="result-actions">
                            <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                            <button class="icon-btn" data-action="qr" title="QR"><i class="ph ph-qr-code"></i></button>
                            <button class="icon-btn" data-action="delete" title="삭제"><i class="ph ph-trash"></i></button>
                        </div>
                    </div>
                `;
            })
            .join('');
    }
    ctx.renderPagination('#ticketPagination', 'ticket', ticketPage);
}