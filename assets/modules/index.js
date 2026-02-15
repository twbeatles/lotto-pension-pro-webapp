import { LottoApp } from './core/LottoApp.js';

document.addEventListener('DOMContentLoaded', () => {
    window.app = new LottoApp();
    window.app.init();
});
