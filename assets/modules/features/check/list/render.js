import { $, $$ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { UI_STRINGS } from '../../../utils/strings.js';
import { escapeHtml } from '../../../utils/dom.js';

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
                        ${quantityText > 1 ? `<span class="badge status-badge ticket-quantity-badge">x${quantityText}</span>` : ''}
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