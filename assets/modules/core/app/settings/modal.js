import { $, $$ } from '../../../utils/utils.js';
import { UIManager } from '../../UIManager.js';

export const appSettingsModalMethods = {
    bindSettingsModal() {
        const open = () => this.openSettingsModal();
        const close = () => this.closeSettingsModal();

        $('#openSettingsBtn')?.addEventListener('click', open);
        $('#mobileOpenSettingsBtn')?.addEventListener('click', open);
        $('#closeSettingsBtn')?.addEventListener('click', close);
        $('#settingsModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) close();
        });

        $$('[data-theme-choice]').forEach((button) => {
            button.addEventListener('click', () => {
                this.setTheme(button.dataset.themeChoice);
            });
        });
    },

    isSettingsModalOpen() {
        return UIManager.isModalOpen('#settingsModal');
    },

    openSettingsModal() {
        this.renderSettingsPanel();
        const modal = $('#settingsModal');
        if (!modal) return;
        UIManager.openModal(modal, {
            initialFocus: $('#closeSettingsBtn')
        });
    },

    closeSettingsModal() {
        UIManager.closeModal($('#settingsModal'), { reason: 'close' });
    }
};