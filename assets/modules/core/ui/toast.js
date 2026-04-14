import { $ } from '../../utils/utils.js';

export const uiToastMethods = {
    toast(msg, type = 'info', duration = 3000) {
        const container = $('#toast-container');
        if (!container) return;

        const liveEl = document.getElementById('toast-live-region');
        if (liveEl) liveEl.textContent = msg;

        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        el.setAttribute('role', 'status');

        el.style.opacity = '0';
        el.style.transform = 'translateY(30px) scale(0.95)';
        el.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';

        container.appendChild(el);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0) scale(1)';
            });
        });

        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(15px) scale(0.98)';
            setTimeout(() => {
                el.remove();
                if (liveEl && liveEl.textContent === msg) liveEl.textContent = '';
            }, 400);
        }, duration);
    }
};
