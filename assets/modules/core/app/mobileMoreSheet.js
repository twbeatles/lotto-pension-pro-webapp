import { UIManager } from '../UIManager.js';

export const appMobileMoreSheetMethods = {
    bindMobileMoreSheet() {
        const modal = document.getElementById('mobileMoreModal');
        const moreBtn = document.getElementById('mobileMoreBtn');
        if (!modal || !moreBtn) return;

        if (moreBtn.dataset.boundMobileMore !== 'true') {
            moreBtn.addEventListener('click', () => this.openMobileMoreSheet());
            moreBtn.dataset.boundMobileMore = 'true';
        }

        if (modal.dataset.boundMobileMore !== 'true') {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    this.closeMobileMoreSheet();
                }
            });

            document.getElementById('mobileMoreCloseBtn')?.addEventListener('click', () => {
                this.closeMobileMoreSheet();
            });

            modal.addEventListener('click', async (event) => {
                const button = event.target.closest('[data-more-action]');
                if (!button) return;
                const action = button.dataset.moreAction;
                if (action === 'bt') {
                    this.closeMobileMoreSheet({ restoreFocus: false });
                    await this.route('bt');
                    return;
                }
                if (action === 'settings') {
                    this.closeMobileMoreSheet({ restoreFocus: false });
                    this.openSettingsModal();
                }
            });

            modal.dataset.boundMobileMore = 'true';
        }
    },

    openMobileMoreSheet() {
        const modal = document.getElementById('mobileMoreModal');
        if (!modal) return;
        UIManager.openModal(modal, {
            initialFocus: document.getElementById('mobileMoreCloseBtn')
        });
    },

    closeMobileMoreSheet({ restoreFocus = true } = {}) {
        UIManager.closeModal(document.getElementById('mobileMoreModal'), {
            restoreFocus,
            reason: 'close'
        });
    },

    syncMobileMoreButtonState(target = this.currentRoute) {
        const moreBtn = document.getElementById('mobileMoreBtn');
        if (!moreBtn) return;
        moreBtn.classList.toggle('active', target === 'bt');
    }
};
