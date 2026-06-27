import { $ } from '../../../utils/utils.js';

export const checkListSelectionMethods = {
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

        const currentIndex = Math.max(
            0,
            items.findIndex((entry) => entry.key === this.selectedItemKey)
        );
        const nextIndex =
            direction === 'start'
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

    getSelectedEntry() {
        return this.getVisibleItems().find((entry) => entry.key === this.selectedItemKey) || null;
    }
};