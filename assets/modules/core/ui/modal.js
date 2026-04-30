import { $ } from '../../utils/utils.js';

export const uiModalMethods = {
    _ensureModalBindings() {
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
    },

    _getTopModalState() {
        return this._modalStack.at(-1) || null;
    },

    _resolveModalContainer(modal) {
        if (!modal || typeof modal.querySelector !== 'function') return modal;
        return modal.querySelector('[role="dialog"], .modal-content') || modal;
    },

    _getFocusableElements(container) {
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
    },

    _focusModalState(state, explicitTarget = null) {
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
    },

    _trapFocus(state, event) {
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
    },

    openModal(modal, options = {}) {
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
    },

    closeModal(modal, { restoreFocus = true, reason = 'close' } = {}) {
        if (!modal) return false;

        const index = [...this._modalStack].reverse().findIndex((item) => item.modal === modal);
        const realIndex = index < 0 ? -1 : this._modalStack.length - 1 - index;
        const state = realIndex >= 0 ? this._modalStack.splice(realIndex, 1)[0] : null;

        modal.classList.remove('active');
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');

        state?.onClose?.(reason);

        if (
            restoreFocus &&
            state?.previousFocus &&
            typeof state.previousFocus.focus === 'function' &&
            document.contains(state.previousFocus)
        ) {
            state.previousFocus.focus();
        } else if (this._modalStack.length) {
            this._focusModalState(this._getTopModalState());
        }
        return Boolean(state);
    },

    isModalOpen(modalOrSelector) {
        const modal = typeof modalOrSelector === 'string' ? $(modalOrSelector) : modalOrSelector;
        return Boolean(modal?.classList?.contains('active'));
    }
};
