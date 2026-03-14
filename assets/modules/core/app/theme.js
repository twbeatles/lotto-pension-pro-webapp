import { $, $$ } from '../../utils/utils.js';
export const appThemeMethods = {
    bindThemeToggle() {
        const toggle = () => this.toggleTheme();
        $('#themeToggle')?.addEventListener('click', toggle);
        $('#mobileThemeToggle')?.addEventListener('click', toggle);
    },

    toggleTheme() {
        this.setTheme(this.data.state.theme === 'light' ? 'dark' : 'light');
    },

    setTheme(theme) {
        const nextTheme = theme === 'light' ? 'light' : 'dark';
        const changed = this.data.state.theme !== nextTheme;
        this.data.state.theme = nextTheme;
        if (changed) {
            this.data.markDirty?.('settings');
        }
        this.applyTheme();
        if (changed) {
            this.data.save();
        }
    },

    applyTheme() {
        document.body.setAttribute('data-theme', this.data.state.theme);
        // Update icons if needed
        const icon = this.data.state.theme === 'light' ? 'ph-moon' : 'ph-sun';
        const btns = $$('#themeToggle i, #mobileThemeToggle i');
        btns.forEach(i => i.className = `ph ${icon}`);
        this.renderSettingsPanel?.();
    }
};
