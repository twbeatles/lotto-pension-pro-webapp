import { UIManager } from '../../UIManager.js';

export const recordSavedListMethods = {
    addToFavorites(nums) {
        const key = nums.join(',');
        if (this.state.favorites.some((f) => f.numbers.join(',') === key)) {
            UIManager.toast('이미 즐겨찾기에 있습니다.', 'warning');
            return false;
        }
        this.state.favorites.unshift({ numbers: nums, date: new Date().toISOString() });
        this.markDirty('fav');
        this.save(true);
        UIManager.toast('즐겨찾기 추가 완료', 'success');
        return true;
    },

    clearFavorites() {
        this.state.favorites = [];
        this.markDirty('fav');
        this.save(true);
    },

    clearHistory() {
        this.state.history = [];
        this.markDirty('hist');
        this.save(true);
    }
};
