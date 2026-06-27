import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';

export const generatorActionRenderMethods = {
    renderStoredGeneratedEntries() {
        const listEl = $('#genResultList');
        if (!listEl) return;
        const generatedEntries = this.data.getGeneratedEntries();
        listEl.replaceChildren();
        generatedEntries.forEach((entry, index) => {
            this.renderResultItem(entry.numbers, index, listEl);
        });
        this.renderTemporaryResultNotice?.();
    },

    renderTemporaryResultNotice() {
        const notice = $('#genResultTempNotice');
        if (!notice) return;
        notice.hidden = !this.data.getGeneratedEntries().length;
    },

    renderResultItem(nums, index, container) {
        const el = document.createElement('div');
        el.className = 'result-item';
        el.dataset.idx = String(index);
        el.innerHTML = `
            <div class="result-balls ball-container">${UIManager.renderBalls(nums)}</div>
            <div class="result-actions">
                <button class="icon-btn" data-action="copy" aria-label="번호 복사" title="복사"><i class="ph ph-copy"></i></button>
                <button class="icon-btn" data-action="qr" aria-label="큐알 코드 보기" title="큐알"><i class="ph ph-qr-code"></i></button>
                <button class="icon-btn" data-action="ticket" aria-label="내 번호 보관함 추가" title="내 번호 보관함"><i class="ph ph-ticket"></i></button>
                <button class="icon-btn" data-action="share" aria-label="이미지 저장" title="이미지 저장"><i class="ph ph-download-simple"></i></button>
                <button class="icon-btn" data-action="fav" aria-label="즐겨찾기 추가" title="즐겨찾기"><i class="ph ph-star"></i></button>
            </div>
        `;

        // CSS animation delay avoids one timer per row during bulk rendering.
        el.classList.add('enter-animate');
        el.style.setProperty('--enter-delay', `${Math.min(index, 20) * 60}ms`);

        container.appendChild(el);
    }
};