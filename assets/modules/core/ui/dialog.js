import { $ } from '../../utils/utils.js';
import { UI_STRINGS } from '../../utils/strings.js';

export const uiDialogMethods = {
    _bindDialogControls() {
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
    },

    _configureDialog({
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
    },

    _getDialogInputValue() {
        return String($('#dialogInput')?.value || '');
    },

    async confirm(options = {}) {
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
    },

    async prompt(options = {}) {
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
};
