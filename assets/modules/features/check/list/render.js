import { $, $$ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { UI_STRINGS } from '../../../utils/strings.js';
import { escapeHtml } from '../../../utils/dom.js';

const CHECK_EMPTY_HINTS = {
    favorites: '생성 결과에서 ⭐ 버튼을 누르면 즐겨찾기에 담겨요.',
    history: '생성 결과에서 「기록에 모두 저장」을 누르면 여기에 나와요.',
    tickets: '생성·추천 결과에서 🎟️ 버튼으로 구매 번호를 저장해 보세요.',
    scanned: '오른쪽 위 「용지 QR 스캔」으로 로또 용지를 읽어 보세요.'
};

export const checkListRenderMethods = {
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
                    ? `${sourceLabel} ${visibleItems.length}개 (총 ${totalQuantity}장) · 확인할 번호를 눌러 고르세요.`
                    : `${sourceLabel} ${visibleItems.length}개 · 확인할 번호를 눌러 고르세요.`
                : '';
        }

        if (!visibleItems.length) {
            listEl.innerHTML = `
                <div class="empty-state check-target-empty">
                    <i class="ph ph-list-magnifying-glass"></i>
                    <h4>${this.searchQuery ? '검색 결과가 없어요.' : `${sourceLabel}에 저장된 번호가 없어요.`}</h4>
                    <p>${this.searchQuery ? '검색어를 바꾸거나 위에서 다른 목록을 골라 보세요.' : CHECK_EMPTY_HINTS[this.source] || '번호를 저장하면 여기에서 바로 확인할 수 있어요.'}</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = visibleItems
            .map(({ key, item, index, metaText, sourceLabel: label, ticketStatusLabel, quantity }) => {
                const isActive = key === this.selectedItemKey;
                const escapedKey = escapeHtml(key);
                const escapedMetaText = escapeHtml(metaText);
                const escapedTicketStatusLabel = escapeHtml(ticketStatusLabel);
                const escapedSourceLabel = escapeHtml(label);
                const quantityText = Math.max(1, Math.floor(Number(quantity) || 1));
                const topBadge =
                    this.source === 'tickets'
                        ? `
                    <span class="check-target-card-badges">
                        <span class="badge status-badge ${ticketStatusLabel === UI_STRINGS.check.ticketStatus.pending ? 'is-warn' : ticketStatusLabel === UI_STRINGS.check.ticketStatus.lose ? 'is-bad' : 'is-good'}">${escapedTicketStatusLabel}</span>
                        ${quantityText > 1 ? `<span class="badge status-badge ticket-quantity-badge">${quantityText}장</span>` : ''}
                    </span>
                `
                        : `<span class="badge status-badge">${escapedSourceLabel}</span>`;
                const optionId = `check-option-${this.source}-${index}`;

                return `
                <button class="check-target-card ${isActive ? 'active' : ''}" type="button" role="option"
                    id="${optionId}" tabindex="${isActive ? '0' : '-1'}"
                    aria-selected="${String(isActive)}" data-item-key="${escapedKey}">
                    <div class="check-target-card-head">
                        ${topBadge}
                        <span class="check-target-card-meta">${escapedMetaText}</span>
                    </div>
                    <div class="ball-container sm check-target-card-balls">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                </button>
            `;
            })
            .join('');
    }
};