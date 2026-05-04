import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../UIManager.js';

export const appModuleLoaderRequestBridgeMethods = {
    async requestNumbers(nums, meta = null) {
        if (!Array.isArray(nums) || nums.length !== 6) return;
        await this.route('gen');
        this.data.setGeneratedEntries(
            [
                {
                    numbers: nums,
                    strategyRequest: meta?.strategyRequest || null,
                    createdAt: meta?.createdAt || new Date().toISOString(),
                    source: meta?.source || 'generator'
                }
            ],
            {
                source: meta?.source || 'generator'
            }
        );
        const list = $('#genResultList');
        if (list) {
            list.innerHTML = '';
            this.generator?.renderResultItem(nums, 0, list);
        }
        UIManager.toast('번호 추천 결과로 생성 결과를 교체했습니다.', 'success');
    }
};
