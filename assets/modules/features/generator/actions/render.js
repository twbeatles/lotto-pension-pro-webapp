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
        const gameLabel = String.fromCharCode(65 + (Number(index) % 26));
        const sum = nums.reduce((acc, n) => acc + Number(n || 0), 0);
        const oddCount = nums.filter((n) => Number(n) % 2 === 1).length;
        el.innerHTML = `
            <span class="result-rank" aria-label="${gameLabel} 게임">${gameLabel}</span>
            <div class="result-content">
                <div class="result-balls ball-container">${UIManager.renderBalls(nums)}</div>
                <div class="result-meta-inline">합계 ${sum} · 홀짝 ${oddCount}:${nums.length - oddCount}</div>
            </div>
            <div class="result-actions">
                <button class="icon-btn" type="button" data-action="fav" aria-label="즐겨찾기에 추가" title="즐겨찾기"><i class="ph ph-star"></i></button>
                <button class="icon-btn" type="button" data-action="ticket" aria-label="구매 번호로 저장" title="구매 번호로 저장"><i class="ph ph-ticket"></i></button>
                <button class="icon-btn" type="button" data-action="copy" aria-label="번호 복사" title="복사"><i class="ph ph-copy"></i></button>
                <button class="icon-btn" type="button" data-action="qr" aria-label="QR 코드 보기" title="QR 코드"><i class="ph ph-qr-code"></i></button>
                <button class="icon-btn" type="button" data-action="share" aria-label="이미지로 저장" title="이미지로 저장"><i class="ph ph-download-simple"></i></button>
            </div>
        `;

        // CSS animation delay avoids one timer per row during bulk rendering.
        el.classList.add('enter-animate');
        el.style.setProperty('--enter-delay', `${Math.min(index, 20) * 60}ms`);

        container.appendChild(el);
    }
};