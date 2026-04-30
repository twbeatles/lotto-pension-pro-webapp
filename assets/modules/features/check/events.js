import { $, $$ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { UI_STRINGS } from '../../utils/strings.js';

export const checkEventMethods = {
    bindEvents() {
        $$('.seg-btn[data-source]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                const src = event.currentTarget.dataset.source;
                if (['favorites', 'history', 'scanned', 'tickets'].includes(src)) {
                    this.setSource(src);
                }
            });
        });

        $$('.seg-btn[data-checkmode]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                const mode = event.currentTarget.dataset.checkmode;
                if (mode !== 'latest' && mode !== 'all') return;
                this.mode = mode;
                $$('.seg-btn[data-checkmode]').forEach((item) => item.classList.remove('active'));
                event.currentTarget.classList.add('active');
                this.resetResult();
            });
        });

        $$('.seg-btn[data-ticket-filter]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                const filter = event.currentTarget.dataset.ticketFilter || 'all';
                this.ticketStatusFilter = filter;
                this.selectedItemKey = '';
                this.renderList();
                this.resetResult();
            });
        });

        $('#checkSearch')?.addEventListener('input', (event) => {
            this.searchQuery = String(event.currentTarget.value || '')
                .trim()
                .toLowerCase();
            this.selectedItemKey = '';
            this.renderList();
            this.resetResult();
        });

        $('#checkTargetCards')?.addEventListener('click', (event) => {
            const card = event.target.closest('[data-item-key]');
            if (!card) return;
            this.selectedItemKey = card.dataset.itemKey || '';
            this.renderList();
            this.focusSelectedCard();
            this.resetResult();
        });

        $('#checkTargetCards')?.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                this.moveSelection(1);
                return;
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                this.moveSelection(-1);
                return;
            }
            if (event.key === 'Home') {
                event.preventDefault();
                this.moveSelection('start');
                return;
            }
            if (event.key === 'End') {
                event.preventDefault();
                this.moveSelection('end');
            }
        });

        $('#doCheckBtn')?.addEventListener('click', () => this.run());
        $('#openQrScannerBtn')?.addEventListener('click', () => this.app.qr.start());

        $('#checkResultArea')?.addEventListener('click', (event) => {
            const btn = event.target.closest('button[data-action]');
            if (!btn || !this.currentTicket) return;
            const action = btn.dataset.action;
            if (action === 'copy') UIManager.copyNumbers(this.currentTicket);
            if (action === 'qr') UIManager.showQR(this.currentTicket);
            if (action === 'save') {
                const resultEl = $('#checkResultArea .check-result');
                UIManager.saveAsImage(resultEl, `로또_확인_${this.currentDrawNo || '최신'}.png`);
            }
        });
    },

    setSource(src) {
        this.source = src;
        this.selectedItemKey = '';
        this.syncSourceTabs();
        this.renderList();
        this.resetResult();
    },

    setScannedNumbers(games) {
        const now = new Date().toISOString();
        this.scanned = (Array.isArray(games) ? games : [])
            .map((entry) => {
                const rawNumbers = Array.isArray(entry) ? entry : entry?.numbers;
                const numbers = [
                    ...new Set((rawNumbers || []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 45))
                ].sort((a, b) => a - b);
                if (numbers.length !== 6) return null;

                const drawNo = Array.isArray(entry) ? null : Number(entry?.targetDrawNo);
                return {
                    numbers,
                    targetDrawNo: Number.isFinite(drawNo) && drawNo > 0 ? Math.floor(drawNo) : null,
                    date: now
                };
            })
            .filter(Boolean);

        this.source = 'scanned';
        this.selectedItemKey = '';
        this.syncSourceTabs();
        this.renderList();
        this.resetResult();
        if (this.scanned.length) {
            UIManager.toast(UI_STRINGS.check.scannedAdded(this.scanned.length), 'success');
            return;
        }
        UIManager.toast(UI_STRINGS.check.scannedEmpty, 'warning');
    },

    onEnter() {
        this.syncSourceTabs();
        $$('.seg-btn[data-checkmode]').forEach((item) => {
            item.classList.toggle('active', item.dataset.checkmode === this.mode);
        });
        $('#checkSearch') && ($('#checkSearch').value = this.searchQuery);
        this.renderList();
        if (!this.currentTicket) this.resetResult();
    },

    syncSourceTabs() {
        $$('.seg-btn[data-source]').forEach((item) => {
            item.classList.toggle('active', item.dataset.source === this.source);
        });
    }
};
