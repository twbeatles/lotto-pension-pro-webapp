import { registerPwaLifecycle } from './bootstrap/pwa.js';
import { LottoApp } from './core/LottoApp.js';

registerPwaLifecycle();

document.addEventListener('DOMContentLoaded', () => {
    window.app = new LottoApp();
    window.app.init();
});
