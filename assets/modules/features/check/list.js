import { $, $$ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { UI_STRINGS } from '../../utils/strings.js';

export const checkListMethods = {
    getList() {
        if (this.source === 'scanned') return this.scanned;
        if (this.source === 'tickets') return this.data.state.ticketBook || [];
        return this.source === 'history' ? this.data.state.history : this.data.state.favorites;
    },

    getTicketStatusLabel(item) {
        if (!item?.checked) return UI_STRINGS.check.ticketStatus.pending;
        if (Number(item.checked.rank) > 0) return `${item.checked.rank}등`;
        return UI_STRINGS.check.ticketStatus.lose;
    },

    getTicketStatusCode(item) {
        if (!item?.checked) return 'pending';
        if (Number(item.checked.rank) > 0) return 'win';
        return 'lose';
    },

    getItemQuantity(item) {
        if (this.source !== 'tickets') return 1;
        return this.data.getTicketQuantity(item);
    },

    formatDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return this.dateFormatter.format(date);
    },

    buildItemKey(item, index) {
        if (this.source === 'tickets') return String(item.id || `ticket-${index}`);
        const date = item?.date || item?.createdAt || '';
        return `${this.source}:${index}:${(item?.numbers || []).join(',')}:${date}:${item?.targetDrawNo || ''}`;
    },

    matchesQuery(item, metaText = '') {
        if (!this.searchQuery) return true;
        const haystack = [
            (item?.numbers || []).join(', '),
            item?.targetDrawNo,
            item?.date,
            this.formatDate(item?.date),
            metaText
        ].join(' ').toLowerCase();
        return haystack.includes(this.searchQuery);
    },

    getVisibleItems() {
        const items = this.getList();
        return items.reduce((acc, item, index) => {
            const key = this.buildItemKey(item, index);
            const sourceLabel = UI_STRINGS.check.sourceLabels[this.source] || this.source;
            const ticketStatus = this.source === 'tickets' ? this.getTicketStatusCode(item) : 'all';
            const ticketStatusLabel = this.source === 'tickets' ? this.getTicketStatusLabel(item) : '';
            const quantity = this.getItemQuantity(item);

            if (this.source === 'tickets' && this.ticketStatusFilter !== 'all' && ticketStatus !== this.ticketStatusFilter) {
                return acc;
            }

            const metaText = this.source === 'tickets'
                ? `${item.targetDrawNo}회차 ${ticketStatusLabel}${quantity > 1 ? ` x${quantity}` : ''}`
                : this.source === 'scanned'
                    ? (item.targetDrawNo ? `${item.targetDrawNo}회차 큐알 스캔` : '큐알 스캔 결과')
                    : `${sourceLabel} ${this.formatDate(item.date)}`;

            if (!this.matchesQuery(item, metaText)) return acc;

            acc.push({
                key,
                item,
                index,
                sourceLabel,
                metaText,
                ticketStatus,
                ticketStatusLabel,
                quantity
            });
            return acc;
        }, []);
    },

    ensureSelection(items) {
        if (!items.length) {
            this.selectedItemKey = '';
            return;
        }
        if (items.some((entry) => entry.key === this.selectedItemKey)) return;
        this.selectedItemKey = items[0].key;
    },

    focusSelectedCard() {
        const listEl = $('#checkTargetCards');
        if (!listEl || !this.selectedItemKey) return;
        const cards = Array.from(listEl.querySelectorAll('[data-item-key]'));
        const activeCard = cards.find((card) => card.dataset.itemKey === this.selectedItemKey);
        activeCard?.focus();
    },

    moveSelection(direction) {
        const items = this.getVisibleItems();
        if (!items.length) return;
        this.ensureSelection(items);

        const currentIndex = Math.max(0, items.findIndex((entry) => entry.key === this.selectedItemKey));
        const nextIndex = direction === 'start'
            ? 0
            : direction === 'end'
                ? items.length - 1
                : Math.min(items.length - 1, Math.max(0, currentIndex + Number(direction || 0)));

        if (items[nextIndex]?.key === this.selectedItemKey) return;
        this.selectedItemKey = items[nextIndex].key;
        this.renderList();
        this.focusSelectedCard();
        this.resetResult();
    },

    renderList() {
        const listEl = $('#checkTargetCards');
        const metaEl = $('#checkSelectionMeta');
        const ticketFilterRow = $('#checkTicketStatusRow');
        if (!listEl) return;

        if (ticketFilterRow) ticketFilterRow.hidden = this.source !== 'tickets';
        $$('.seg-btn[data-ticket-filter]').forEach((item) => {
            item.classList.toggle('active', item.dataset.ticketFilter === this.ticketStatusFilter);
        });

        const visibleItems = this.getVisibleItems();
        this.ensureSelection(visibleItems);

        const sourceLabel = UI_STRINGS.check.sourceLabels[this.source] || this.source;
        if (metaEl) {
            const totalQuantity = visibleItems.reduce((sum, entry) => sum + Number(entry.quantity || 1), 0);
            metaEl.textContent = visibleItems.length
                ? this.source === 'tickets'
                    ? `${sourceLabel} ${totalQuantity}개 티켓 · ${visibleItems.length}개 조합`
                    : `${sourceLabel} ${visibleItems.length}개`
                : `${sourceLabel} 항목이 없습니다.`;
        }

        if (!visibleItems.length) {
            listEl.innerHTML = `
                <div class="empty-state check-target-empty">
                    <i class="ph ph-list-magnifying-glass"></i>
                    <h4>${sourceLabel} 항목이 없습니다.</h4>
                    <p>${this.searchQuery ? '검색 조건을 바꾸거나 다른 소스를 선택해보세요.' : '저장된 항목이 생기면 여기에서 바로 확인할 수 있습니다.'}</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = visibleItems.map(({ key, item, index, metaText, sourceLabel: label, ticketStatusLabel, quantity }) => {
            const isActive = key === this.selectedItemKey;
            const topBadge = this.source === 'tickets'
                ? `
                    <span class="check-target-card-badges">
                        <span class="badge status-badge ${ticketStatusLabel === UI_STRINGS.check.ticketStatus.pending ? 'is-warn' : ticketStatusLabel === UI_STRINGS.check.ticketStatus.lose ? 'is-bad' : 'is-good'}">${ticketStatusLabel}</span>
                        ${quantity > 1 ? `<span class="badge status-badge ticket-quantity-badge">x${quantity}</span>` : ''}
                    </span>
                `
                : `<span class="badge status-badge">${label}</span>`;
            const optionId = `check-option-${this.source}-${index}`;

            return `
                <button class="check-target-card ${isActive ? 'active' : ''}" type="button" role="option"
                    id="${optionId}" tabindex="${isActive ? '0' : '-1'}"
                    aria-selected="${String(isActive)}" data-item-key="${key}">
                    <div class="check-target-card-head">
                        ${topBadge}
                        <span class="check-target-card-meta">${metaText}</span>
                    </div>
                    <div class="ball-container sm check-target-card-balls">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                </button>
            `;
        }).join('');
    },

    getSelectedEntry() {
        return this.getVisibleItems().find((entry) => entry.key === this.selectedItemKey) || null;
    }
};
