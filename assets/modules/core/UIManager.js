import { $ } from '../utils/utils.js';
import { EXTERNAL_ASSETS, loadScriptOnce } from '../utils/loader.js';
import { UI_STRINGS } from '../utils/strings.js';

export class UIManager {
    static _ballCache = new Map();
    static _modalStack = [];
    static _modalBindingsInstalled = false;
    static _dialogState = null;

    static init() {
        if (typeof document === 'undefined') return;
        this._ensureModalBindings();
        this._bindDialogControls();
        this._bindQrModalControls();
    }

    static _ensureModalBindings() {
        if (this._modalBindingsInstalled || typeof document === 'undefined') return;

        document.addEventListener('keydown', (event) => {
            const state = this._getTopModalState();
            if (!state) return;

            if (event.key === 'Escape') {
                if (state.closeOnEscape === false) return;
                event.preventDefault();
                this.closeModal(state.modal, { reason: 'escape' });
                return;
            }

            if (event.key === 'Tab') {
                this._trapFocus(state, event);
            }
        });

        this._modalBindingsInstalled = true;
    }

    static _bindDialogControls() {
        const modal = $('#dialogModal');
        if (!modal || modal.dataset.uiBound === 'true') return;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closeModal(modal, { reason: 'backdrop' });
            }
        });

        $('#dialogCancelBtn')?.addEventListener('click', () => {
            this.closeModal(modal, { reason: 'cancel' });
        });

        $('#dialogConfirmBtn')?.addEventListener('click', () => {
            const state = this._dialogState;
            if (!state) return;

            if (state.kind === 'prompt') {
                state.resolve(this._getDialogInputValue());
            } else {
                state.resolve(true);
            }
            this.closeModal(modal, { reason: 'confirm' });
        });

        $('#dialogInput')?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            $('#dialogConfirmBtn')?.click();
        });

        modal.dataset.uiBound = 'true';
    }

    static _bindQrModalControls() {
        const modal = $('#qrModal');
        if (!modal || modal.dataset.uiBound === 'true') return;

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closeModal(modal, { reason: 'backdrop' });
            }
        });
        $('#closeQrModalBtn')?.addEventListener('click', () => {
            this.closeModal(modal, { reason: 'close' });
        });

        modal.dataset.uiBound = 'true';
    }

    static _getTopModalState() {
        return this._modalStack.at(-1) || null;
    }

    static _resolveModalContainer(modal) {
        if (!modal || typeof modal.querySelector !== 'function') return modal;
        return modal.querySelector('[role="dialog"], .modal-content') || modal;
    }

    static _getFocusableElements(container) {
        if (!container || typeof container.querySelectorAll !== 'function') return [];
        return Array.from(
            container.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        ).filter((element) => {
            if (element.hidden) return false;
            if (element.getAttribute?.('aria-hidden') === 'true') return false;
            return true;
        });
    }

    static _focusModalState(state, explicitTarget = null) {
        if (!state) return;
        const container = state.container || state.modal;
        const target = explicitTarget || state.initialFocus || this._getFocusableElements(container)[0] || container;
        if (!target) return;
        if (typeof target.focus === 'function') {
            if (target === container && !target.hasAttribute('tabindex')) {
                target.setAttribute('tabindex', '-1');
            }
            target.focus();
        }
    }

    static _trapFocus(state, event) {
        const container = state?.container || state?.modal;
        if (!container) return;

        const focusables = this._getFocusableElements(container);
        if (!focusables.length) {
            event.preventDefault();
            this._focusModalState(state, container);
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
            if (active === first || active === container) {
                event.preventDefault();
                last.focus();
            }
            return;
        }

        if (active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    static openModal(modal, options = {}) {
        if (!modal) return null;
        this._ensureModalBindings();

        const existing = this._modalStack.find((item) => item.modal === modal);
        const state = existing || {
            modal,
            container: this._resolveModalContainer(modal),
            previousFocus: document.activeElement,
            closeOnEscape: options.closeOnEscape !== false,
            initialFocus: options.initialFocus || null,
            onClose: typeof options.onClose === 'function' ? options.onClose : null
        };

        state.container = this._resolveModalContainer(modal);
        state.closeOnEscape = options.closeOnEscape !== false;
        state.initialFocus = options.initialFocus || null;
        state.onClose = typeof options.onClose === 'function' ? options.onClose : null;
        if (!existing) {
            this._modalStack.push(state);
        }

        modal.classList.add('active');
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');

        requestAnimationFrame(() => {
            this._focusModalState(state);
        });

        return state;
    }

    static closeModal(modal, { restoreFocus = true, reason = 'close' } = {}) {
        if (!modal) return false;

        const index = [...this._modalStack].reverse().findIndex((item) => item.modal === modal);
        const realIndex = index < 0 ? -1 : this._modalStack.length - 1 - index;
        const state = realIndex >= 0 ? this._modalStack.splice(realIndex, 1)[0] : null;

        modal.classList.remove('active');
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');

        state?.onClose?.(reason);

        if (restoreFocus && state?.previousFocus && typeof state.previousFocus.focus === 'function' && document.contains(state.previousFocus)) {
            state.previousFocus.focus();
        } else if (this._modalStack.length) {
            this._focusModalState(this._getTopModalState());
        }
        return Boolean(state);
    }

    static isModalOpen(modalOrSelector) {
        const modal = typeof modalOrSelector === 'string' ? $(modalOrSelector) : modalOrSelector;
        return Boolean(modal?.classList?.contains('active'));
    }

    static toast(msg, type = 'info', duration = 3000) {
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

    static _configureDialog({
        kind = 'confirm',
        title = '',
        message = '',
        confirmText = UI_STRINGS.common.confirm,
        cancelText = UI_STRINGS.common.cancel,
        placeholder = '',
        value = ''
    } = {}) {
        const modal = $('#dialogModal');
        const titleEl = $('#dialogTitle');
        const messageEl = $('#dialogMessage');
        const inputWrap = $('#dialogInputWrap');
        const inputEl = $('#dialogInput');
        const confirmBtn = $('#dialogConfirmBtn');
        const cancelBtn = $('#dialogCancelBtn');

        if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) return null;

        titleEl.textContent = title || (kind === 'prompt' ? UI_STRINGS.dialog.promptTitle : UI_STRINGS.dialog.confirmTitle);
        messageEl.textContent = message || (kind === 'prompt' ? UI_STRINGS.dialog.defaultPromptMessage : UI_STRINGS.dialog.defaultConfirmMessage);
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;

        if (inputWrap && inputEl) {
            const isPrompt = kind === 'prompt';
            inputWrap.hidden = !isPrompt;
            inputEl.value = isPrompt ? String(value || '') : '';
            inputEl.placeholder = isPrompt ? String(placeholder || '') : '';
        }

        return {
            modal,
            confirmBtn,
            inputEl
        };
    }

    static _getDialogInputValue() {
        return String($('#dialogInput')?.value || '');
    }

    static async confirm(options = {}) {
        const configured = this._configureDialog({
            kind: 'confirm',
            title: options.title,
            message: options.message,
            confirmText: options.confirmText || UI_STRINGS.common.confirm,
            cancelText: options.cancelText || UI_STRINGS.common.cancel
        });

        if (!configured) {
            if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
                return window.confirm(options.message || UI_STRINGS.dialog.defaultConfirmMessage);
            }
            return true;
        }

        return new Promise((resolve) => {
            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            this._dialogState = {
                kind: 'confirm',
                resolve: finish
            };

            this.openModal(configured.modal, {
                initialFocus: configured.confirmBtn,
                onClose: () => {
                    finish(false);
                    this._dialogState = null;
                }
            });
        });
    }

    static async prompt(options = {}) {
        const configured = this._configureDialog({
            kind: 'prompt',
            title: options.title,
            message: options.message,
            confirmText: options.confirmText || UI_STRINGS.common.save,
            cancelText: options.cancelText || UI_STRINGS.common.cancel,
            placeholder: options.placeholder,
            value: options.value
        });

        if (!configured) {
            if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
                return window.prompt(options.message || UI_STRINGS.dialog.defaultPromptMessage, options.value || '');
            }
            return null;
        }

        return new Promise((resolve) => {
            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            this._dialogState = {
                kind: 'prompt',
                resolve: finish
            };

            this.openModal(configured.modal, {
                initialFocus: configured.inputEl || configured.confirmBtn,
                onClose: () => {
                    finish(null);
                    this._dialogState = null;
                }
            });
        });
    }

    static getBallColor(n) {
        if (n <= 10) return 'yellow';
        if (n <= 20) return 'blue';
        if (n <= 30) return 'red';
        if (n <= 40) return 'gray';
        return 'green';
    }

    static renderBalls(nums, size = '') {
        const list = Array.isArray(nums) ? nums : [];
        if (!list.length) return '';

        const key = `${list.join(',')}|${size}`;
        if (this._ballCache.has(key)) return this._ballCache.get(key);

        const html = list.map((n) => (
            `<span class="ball ${this.getBallColor(n)} ${size}" role="img" aria-label="${n}번 번호" title="${n}번 번호">${n}</span>`
        )).join('');

        if (this._ballCache.size >= 1000) {
            const iter = this._ballCache.keys();
            for (let i = 0; i < 200; i++) {
                const oldest = iter.next().value;
                if (oldest === undefined) break;
                this._ballCache.delete(oldest);
            }
        }

        this._ballCache.set(key, html);
        return html;
    }

    static formatNumbers(nums) {
        const list = Array.isArray(nums) ? nums : [];
        return list.map((n) => String(n).padStart(2, '0')).join(' ');
    }

    static async copyNumbers(nums) {
        const text = this.formatNumbers(nums);
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            UIManager.toast('복사 완료', 'success');
        } catch (e) {
            console.warn('복사 실패', e);
            UIManager.toast('복사 실패', 'error');
        }
    }

    static async showQR(nums) {
        const modal = $('#qrModal');
        const container = $('#qrCanvasContainer');
        if (!modal || !container) return;
        container.innerHTML = '';

        const payload = `로또 6/45\n번호: ${this.formatNumbers(nums)}`;
        try {
            if (!window.QRCode?.toCanvas) {
                await loadScriptOnce(EXTERNAL_ASSETS.qrcode);
            }
            if (!window.QRCode?.toCanvas) throw new Error('큐알 생성 라이브러리를 불러오지 못했습니다.');
            const canvas = document.createElement('canvas');
            canvas.setAttribute('aria-label', '생성된 큐알 코드');
            container.appendChild(canvas);
            window.QRCode.toCanvas(canvas, payload, { width: 220, margin: 1 }, (err) => {
                if (err) {
                    console.warn('큐알 렌더링 실패', err);
                    UIManager.toast('큐알 생성 실패', 'error');
                    return;
                }
                this.openModal(modal, { initialFocus: $('#closeQrModalBtn') });
            });
        } catch (e) {
            console.warn('큐알 처리 오류', e);
            UIManager.toast('큐알 기능을 사용할 수 없습니다.', 'error', 3000);
        }
    }

    static async saveAsImage(element, filename = '로또_결과.png') {
        if (!element) return;
        try {
            if (!window.html2canvas) {
                await loadScriptOnce(EXTERNAL_ASSETS.html2canvas);
            }
            if (!window.html2canvas) throw new Error('이미지 저장 라이브러리를 불러오지 못했습니다.');

            const originalTransform = element.style.transform;
            element.style.transform = 'scale(1.02)';
            await new Promise((resolve) => setTimeout(resolve, 100));

            const canvas = await window.html2canvas(element, {
                backgroundColor: '#1e293b',
                scale: 2,
                logging: false,
                useCORS: true
            });

            element.style.transform = originalTransform;

            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            link.remove();

            UIManager.toast('이미지로 저장되었습니다.', 'success');
        } catch (e) {
            console.error('이미지 저장 실패', e);
            UIManager.toast('이미지 저장 실패', 'error');
        }
    }
}
