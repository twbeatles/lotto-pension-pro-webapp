import { UIManager } from '../../UIManager.js';

export const recordSavedListMethods = {
    addToFavorites(nums) {
        const key = nums.join(',');
        if (this.state.favorites.some((f) => f.numbers.join(',') === key)) {
            UIManager.toast('이미 즐겨찾기에 있는 번호예요.', 'warning');
            return false;
        }
        this.state.favorites.unshift({ numbers: nums, date: new Date().toISOString() });
        this.markDirty('fav');
        this.save(true);
        UIManager.toast('즐겨찾기에 추가했어요.', 'success');
        return true;
    },

    clearFavorites() {
        this.state.favorites = [];
        this.markDirty('fav');
        this.save(true);
    },

    removeFavoriteAt(index) {
        const idx = Number(index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= this.state.favorites.length) return false;
        this.state.favorites.splice(idx, 1);
        this.markDirty('fav');
        this.save(true);
        return true;
    },

    removeHistoryAt(index) {
        const idx = Number(index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= this.state.history.length) return false;
        this.state.history.splice(idx, 1);
        this.markDirty('hist');
        this.save(true);
        return true;
    },

    clearHistory() {
        this.state.history = [];
        this.markDirty('hist');
        this.save(true);
    }
};
