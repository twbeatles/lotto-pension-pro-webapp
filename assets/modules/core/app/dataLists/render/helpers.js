import { $ } from '../../../../utils/utils.js';

export function setInputValue(selector, value) {
    const el = $(selector);
    if (el && el.value !== value) el.value = value;
}

export function renderEmpty(selector, icon, text) {
    const el = $(selector);
    if (!el) return;
    el.innerHTML = `
        <div class="empty-state">
            <i class="ph ${icon}"></i>
            <p>${text}</p>
        </div>
    `;
}