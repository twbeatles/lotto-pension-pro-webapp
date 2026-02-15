import { $, $$ } from '../utils/utils.js';
import { DataManager } from './DataManager.js';
import { UIManager } from './UIManager.js';
import { GeneratorModule } from '../features/Generator.js';
import { StatsModule } from '../features/Stats.js';
import { AiModule } from '../features/Ai.js';
import { CheckModule } from '../features/Check.js';
import { DataIOModule } from '../features/DataIO.js';
import { BacktestModule } from '../features/Backtest.js';
import { QrScannerModule } from '../features/QrScanner.js';

export class LottoApp {
    constructor() {
        this.data = new DataManager();
        this.generator = null;
        this.stats = null;
        this.ai = null;
        this.check = null;
        this.dataIO = null;
        this.backtest = null;
        this.qr = null;
        this.currentRoute = 'gen';
    }

    async init() {
        // Link app to data manager if needed
        if (this.data.setApp) this.data.setApp(this);

        // Load Data
        this.data.load();
        this.applyTheme();

        // Modules
        this.generator = new GeneratorModule(this);
        this.stats = new StatsModule(this);
        this.ai = new AiModule(this);
        this.check = new CheckModule(this);
        this.dataIO = new DataIOModule(this);
        this.backtest = new BacktestModule(this);
        this.qr = new QrScannerModule(this);

        // Bind Global Events
        this.bindNav();
        this.bindThemeToggle();
        this.bindDataEvents();

        // Initial Route (fast paint)
        this.route('gen');

        // Async Load
        try {
            await this.data.fetchWinningStats();
            this.updateLatestWin();

            // Auto-Sync in background (silent)
            this.data.fetchLatestFromAPI(true);
        } catch (error) {
            console.error('Failed to fetch winning stats:', error);
            // Fallback for offline mode or error
            $('#latestWinMeta').innerHTML = `<span class="error-msg">데이터 동기화 실패 (오프라인)</span>`;
        }

        this.refreshCurrentRoute();

        console.log('LottoApp Initialized');
    }

    bindNav() {
        // Desktop & Mobile Nav
        $$('.nav-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                this.route(target);
            });
        });
    }

    bindThemeToggle() {
        const toggle = () => {
            this.data.state.theme = this.data.state.theme === 'light' ? 'dark' : 'light';
            this.applyTheme();
            this.data.save();
        };
        $('#themeToggle')?.addEventListener('click', toggle);
        $('#mobileThemeToggle')?.addEventListener('click', toggle);
    }

    bindDataEvents() {
        $('#clearFavorites')?.addEventListener('click', () => {
            if (confirm('즐겨찾기를 모두 삭제하시겠습니까?')) {
                this.data.clearFavorites();
                this.renderDataLists();
            }
        });

        $('#clearHistory')?.addEventListener('click', () => {
            if (confirm('히스토리를 모두 삭제하시겠습니까?')) {
                this.data.clearHistory();
                this.renderDataLists();
            }
        });

        $('#syncDataBtn')?.addEventListener('click', () => {
            this.data.fetchLatestFromAPI();
        });

        // Main Refresh Button
        $('#refreshDataBtn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const icon = btn.querySelector('i');
            icon.classList.add('ph-spin');
            await this.data.fetchLatestFromAPI(false); // Not silent, show toasts
            icon.classList.remove('ph-spin');
        });
    }

    applyTheme() {
        document.body.setAttribute('data-theme', this.data.state.theme);
        // Update icons if needed
        const icon = this.data.state.theme === 'light' ? 'ph-moon' : 'ph-sun';
        const btns = $$('#themeToggle i, #mobileThemeToggle i');
        btns.forEach(i => i.className = `ph ${icon}`);
    }

    route(target) {
        this.currentRoute = target;
        // Active Nav
        $$('.nav-item').forEach(el => el.classList.remove('active'));
        $$(`.nav-item[data-target="${target}"]`).forEach(el => el.classList.add('active'));

        // Active Page
        $$('.page').forEach(el => el.classList.remove('active'));
        const page = $(`#page-${target}`);
        if (page) page.classList.add('active');

        // Page specific renders
        if (target === 'stats') this.stats.render();
        if (target === 'data') this.renderDataLists();
        if (target === 'check') this.check.onEnter();
        if (target === 'bt') this.backtest.onEnter();
    }

    refreshCurrentRoute() {
        const t = this.currentRoute;
        if (t === 'gen') this.updateLatestWin();
        if (t === 'stats') this.stats.render();
        if (t === 'data') this.renderDataLists();
        if (t === 'check') this.check.onEnter();
        if (t === 'bt') this.backtest.resetUI();
    }

    updateLatestWin() {
        const latest = this.data.state.winningStats[0];
        if (!latest) return;

        $('#latestDrawNo').textContent = `${latest.draw_no}회`;
        $('#latestWinBalls').innerHTML = UIManager.renderBalls(latest.numbers) +
            `<span style="margin:0 8px; color:var(--text-muted); font-weight:bold; font-size:1.2em;">+</span>` +
            `<span class="ball ${UIManager.getBallColor(latest.bonus)}">${latest.bonus}</span>`;

        // Format Currency
        const fmtMoney = (n) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);
        const fmtCount = (n) => new Intl.NumberFormat('ko-KR').format(n);

        $('#latestWinMeta').innerHTML = `
            <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                <span>${latest.date} 추첨</span>
                ${latest.prize_amount ? `<span class="badge" style="font-size:0.85em; background:rgba(255,255,255,0.1)">1등 ${fmtCount(latest.winners_count)}명 (${fmtMoney(latest.prize_amount)})</span>` : ''}
            </div>
        `;
    }

    renderDataLists() {
        const fill = (id, list, emptyText) => {
            const el = $(id);
            if (!el) return;
            el.innerHTML = '';
            if (!list.length) {
                el.innerHTML = `<div class="empty-state">${emptyText}</div>`;
                return;
            }
            list.slice(0, 50).forEach(item => {
                const div = document.createElement('div');
                div.className = 'result-item';
                const dateStr = item.date || item.created_at || '';
                div.innerHTML = `
                    <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                    <span class="result-meta">${dateStr ? new Date(dateStr).toLocaleDateString() : ''}</span>
                    <div class="result-actions">
                      <button class="icon-btn copy-btn" title="복사"><i class="ph ph-copy"></i></button>
                      <button class="icon-btn qr-btn" title="QR"><i class="ph ph-qr-code"></i></button>
                    </div>
                `;
                div.querySelector('.copy-btn').onclick = () => UIManager.copyNumbers(item.numbers);
                div.querySelector('.qr-btn').onclick = () => UIManager.showQR(item.numbers);
                el.appendChild(div);
            });
        };

        fill('#favList', this.data.state.favorites, '저장된 즐겨찾기가 없습니다.');
        fill('#historyList', this.data.state.history, '생성 기록이 없습니다.');
    }
}
