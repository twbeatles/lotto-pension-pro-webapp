import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../UIManager.js';
import { endMark, startMark } from '../../../utils/perf.js';

export const appDataListRenderMethods = {
    renderDataLists() {
        startMark('data.render');
        const setInputValue = (selector, value) => {
            const el = $(selector);
            if (el && el.value !== value) el.value = value;
        };
        const renderEmpty = (selector, icon, text) => {
            const el = $(selector);
            if (!el) return;
            el.innerHTML = `
                <div class="empty-state">
                    <i class="ph ${icon}"></i>
                    <p>${text}</p>
                </div>
            `;
        };

        setInputValue('#favSearch', this.getDataListState('fav').query);
        setInputValue('#historySearch', this.getDataListState('history').query);
        setInputValue('#ticketSearch', this.getDataListState('ticket').query);
        setInputValue('#campaignSearch', this.getDataListState('campaign').query);

        const favorites = (this.data.state.favorites || [])
            .map((item, rawIndex) => ({ item, rawIndex }))
            .filter(({ item }) => this.matchesSearch(this.getDataListState('fav').query, [
                (item.numbers || []).join(', '),
                item.date,
                this.formatDate(item.date)
            ]));
        const favoritePage = this.paginateItems('fav', favorites);
        if (!favoritePage.totalItems) {
            renderEmpty('#favList', 'ph-folder-open', this.getDataListState('fav').query ? '검색 결과가 없습니다.' : '저장된 즐겨찾기가 없습니다.');
        } else {
            $('#favList').innerHTML = favoritePage.items.map(({ item, rawIndex }) => `
                <div class="result-item" data-raw-index="${rawIndex}">
                    <div class="result-main">
                        <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                        <span class="result-meta">${this.formatDate(item.date)}</span>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                        <button class="icon-btn" data-action="qr" title="QR"><i class="ph ph-qr-code"></i></button>
                    </div>
                </div>
            `).join('');
        }
        this.renderPagination('#favPagination', 'fav', favoritePage);

        const history = (this.data.state.history || [])
            .map((item, rawIndex) => ({ item, rawIndex }))
            .filter(({ item }) => this.matchesSearch(this.getDataListState('history').query, [
                (item.numbers || []).join(', '),
                item.date,
                this.formatDate(item.date)
            ]));
        const historyPage = this.paginateItems('history', history);
        if (!historyPage.totalItems) {
            renderEmpty('#historyList', 'ph-clock-counter-clockwise', this.getDataListState('history').query ? '검색 결과가 없습니다.' : '생성 히스토리가 없습니다.');
        } else {
            $('#historyList').innerHTML = historyPage.items.map(({ item, rawIndex }) => `
                <div class="result-item" data-raw-index="${rawIndex}">
                    <div class="result-main">
                        <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                        <span class="result-meta">${this.formatDate(item.date)}</span>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                        <button class="icon-btn" data-action="qr" title="QR"><i class="ph ph-qr-code"></i></button>
                    </div>
                </div>
            `).join('');
        }
        this.renderPagination('#historyPagination', 'history', historyPage);

        const ticketFilter = $('#ticketFilter')?.value || 'all';
        const tickets = (this.data.state.ticketBook || [])
            .filter((item) => ticketFilter === 'all' || this.getTicketStatusMeta(item).code === ticketFilter)
            .filter((item) => this.matchesSearch(this.getDataListState('ticket').query, [
                (item.numbers || []).join(', '),
                item.targetDrawNo,
                this.getTicketStatusMeta(item).label,
                `x${this.data.getTicketQuantity(item)}`
            ]));
        const ticketPage = this.paginateItems('ticket', tickets);
        ticketPage.summaryText = `총 ${this.data.getTotalTicketCount(tickets)}개 티켓`;
        if (!ticketPage.totalItems) {
            renderEmpty('#ticketList', 'ph-ticket', this.getDataListState('ticket').query ? '검색 결과가 없습니다.' : '조건에 맞는 티켓이 없습니다.');
        } else {
            $('#ticketList').innerHTML = ticketPage.items.map((item) => {
                const status = this.getTicketStatusMeta(item);
                const quantity = this.data.getTicketQuantity(item);
                return `
                    <div class="result-item" data-id="${this.escapeHtml(item.id)}">
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
            }).join('');
        }
        this.renderPagination('#ticketPagination', 'ticket', ticketPage);

        const campaigns = (this.data.state.campaigns || [])
            .filter((item) => this.matchesSearch(this.getDataListState('campaign').query, [
                item.name,
                item.startDrawNo
            ]));
        const campaignPage = this.paginateItems('campaign', campaigns);
        if (!campaignPage.totalItems) {
            renderEmpty('#campaignList', 'ph-calendar-blank', this.getDataListState('campaign').query ? '검색 결과가 없습니다.' : '등록된 캠페인이 없습니다.');
        } else {
            $('#campaignList').innerHTML = campaignPage.items.map((item) => `
                <div class="result-item" data-id="${this.escapeHtml(item.id)}">
                    <div class="result-main">
                        <strong class="result-title">${this.escapeHtml(item.name)}</strong>
                        <span class="result-meta">${item.startDrawNo}회차 시작 · ${item.weeks}주 · 주당 ${item.setsPerWeek}세트</span>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn" data-action="delete" title="삭제" aria-label="캠페인 삭제"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }
        this.renderPagination('#campaignPagination', 'campaign', campaignPage);

        const localUpdates = this.data.getLocalUpdates();
        const localUpdatesSummary = $('#localUpdatesSummary');
        if (localUpdatesSummary) {
            localUpdatesSummary.textContent = localUpdates.length
                ? `로컬 최신 회차 보정 데이터 ${localUpdates.length}개가 저장되어 있습니다.`
                : '저장된 로컬 최신 회차 보정 데이터가 없습니다.';
        }
        const localUpdatesMeta = $('#localUpdatesMeta');
        if (localUpdatesMeta) {
            const latestLocalDraw = localUpdates.length ? Math.max(...localUpdates.map((item) => Number(item?.draw_no || 0))) : 0;
            localUpdatesMeta.textContent = latestLocalDraw > 0
                ? `가장 최근 로컬 반영 회차: ${latestLocalDraw}회`
                : '정적 JSON만 사용 중입니다.';
        }
        const clearLocalUpdatesBtn = $('#clearLocalUpdatesBtn');
        if (clearLocalUpdatesBtn) clearLocalUpdatesBtn.disabled = !localUpdates.length;

        this.renderSettingsPanel();
        endMark('data.render');
    }
};
