import { $, $$ } from '../utils/utils.js';
import { DataManager } from './DataManager.js';
import { UIManager } from './UIManager.js';
import { GeneratorModule } from '../features/Generator.js';
import { runWhenIdle } from '../utils/loader.js';

export class LottoApp {
    constructor() {
        this.data = new DataManager();
        this.generator = null; // eager
        this.stats = null;
        this.ai = null;
        this.check = null;
        this.dataIO = null;
        this.backtest = null;
        this.qr = null;
        this.currentRoute = 'gen';
        this.moduleConstructors = {};
        this.pendingModulePromises = new Map();
        this.dataListDelegationBound = false;
        this.routeToken = 0;
    }

    async init() {
        // Link app to data manager if needed
        if (this.data.setApp) this.data.setApp(this);

        // Load Data
        this.data.load();
        this.applyTheme();

        // Eager module (default route)
        this.generator = new GeneratorModule(this);

        // Bind Global Events
        this.bindNav();
        this.bindThemeToggle();
        this.bindDataEvents();
        this.bindDataListDelegation();

        // Initial Route (fast paint)
        await this.route('gen');

        // Async Load
        try {
            await this.data.fetchWinningStats();
            this.updateLatestWin();

            // Auto-Sync in background (silent, idle)
            runWhenIdle(() => {
                this.data.fetchLatestFromAPI({ silent: true, trigger: 'idle' });
            });
        } catch (error) {
            console.error('Failed to fetch winning stats:', error);
            // Fallback for offline mode or error
            $('#latestWinMeta').innerHTML = `<span class="error-msg">데이터 동기화 실패 (오프라인)</span>`;
        }

        await this.refreshCurrentRoute();
        this.preloadLikelyModules();

        console.log('LottoApp Initialized');
    }

    async ensureModule(name) {
        if (this[name]) return this[name];
        if (this.pendingModulePromises.has(name)) {
            return this.pendingModulePromises.get(name);
        }

        const loadPromise = (async () => {
            if (!this.moduleConstructors[name]) {
                if (name === 'stats') {
                    const mod = await import('../features/Stats.js');
                    this.moduleConstructors[name] = mod.StatsModule;
                } else if (name === 'ai') {
                    const mod = await import('../features/Ai.js');
                    this.moduleConstructors[name] = mod.AiModule;
                } else if (name === 'check') {
                    const mod = await import('../features/Check.js');
                    this.moduleConstructors[name] = mod.CheckModule;
                } else if (name === 'dataIO') {
                    const mod = await import('../features/DataIO.js');
                    this.moduleConstructors[name] = mod.DataIOModule;
                } else if (name === 'backtest') {
                    const mod = await import('../features/Backtest.js');
                    this.moduleConstructors[name] = mod.BacktestModule;
                } else if (name === 'qr') {
                    const mod = await import('../features/QrScanner.js');
                    this.moduleConstructors[name] = mod.QrScannerModule;
                }
            }

            const Ctor = this.moduleConstructors[name];
            if (!Ctor) return null;
            if (!this[name]) this[name] = new Ctor(this);
            return this[name];
        })();

        this.pendingModulePromises.set(name, loadPromise);
        try {
            return await loadPromise;
        } finally {
            this.pendingModulePromises.delete(name);
        }
    }

    preloadLikelyModules() {
        runWhenIdle(() => {
            // Keep cold-start as lean as possible; non-critical modules load on route entry.
        });
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
            this.data.fetchLatestFromAPI({ silent: false, trigger: 'manual' });
        });

        // Main Refresh Button
        $('#refreshDataBtn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const icon = btn.querySelector('i');
            icon.classList.add('ph-spin');
            await this.data.fetchLatestFromAPI({ silent: false, trigger: 'refresh' });
            icon.classList.remove('ph-spin');
        });

        $('#customProxyUrl')?.addEventListener('change', (e) => {
            this.data.state.customProxy = e.target.value.trim();
            this.data.save();
        });
    }

    bindDataListDelegation() {
        if (this.dataListDelegationBound) return;

        const bindList = (listId, source) => {
            const el = $(listId);
            if (!el) return;
            el.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const itemEl = e.target.closest('.result-item[data-idx]');
                if (!itemEl) return;

                const idx = Number(itemEl.dataset.idx);
                const items = source === 'fav' ? this.data.state.favorites : this.data.state.history;
                const item = items[idx];
                if (!item) return;

                const action = btn.dataset.action;
                if (action === 'copy') UIManager.copyNumbers(item.numbers);
                if (action === 'qr') UIManager.showQR(item.numbers);
            });
        };

        bindList('#favList', 'fav');
        bindList('#historyList', 'hist');
        this.dataListDelegationBound = true;
    }

    applyTheme() {
        document.body.setAttribute('data-theme', this.data.state.theme);
        // Update icons if needed
        const icon = this.data.state.theme === 'light' ? 'ph-moon' : 'ph-sun';
        const btns = $$('#themeToggle i, #mobileThemeToggle i');
        btns.forEach(i => i.className = `ph ${icon}`);
    }

    async route(target) {
        const localToken = ++this.routeToken;
        this.currentRoute = target;
        // Active Nav
        $$('.nav-item').forEach(el => el.classList.remove('active'));
        $$(`.nav-item[data-target="${target}"]`).forEach(el => el.classList.add('active'));

        // Active Page
        $$('.page').forEach(el => el.classList.remove('active'));
        const page = $(`#page-${target}`);
        if (page) page.classList.add('active');
        const isStale = () => localToken !== this.routeToken;

        // Page specific renders
        if (target === 'stats') {
            await this.ensureModule('stats');
            if (isStale()) return;
            this.stats?.render();
        }
        if (target === 'ai') {
            await this.ensureModule('ai');
            if (isStale()) return;
        }
        if (target === 'data') {
            await this.ensureModule('dataIO');
            if (isStale()) return;
            this.renderDataLists();
        }
        if (target === 'check') {
            await this.ensureModule('qr');
            if (isStale()) return;
            await this.ensureModule('check');
            if (isStale()) return;
            this.check?.onEnter();
        }
        if (target === 'bt') {
            await this.ensureModule('backtest');
            if (isStale()) return;
            this.backtest?.onEnter();
        }
    }

    async refreshCurrentRoute() {
        const t = this.currentRoute;
        if (t === 'gen') this.updateLatestWin();
        if (t === 'stats') {
            await this.ensureModule('stats');
            this.stats?.render();
        }
        if (t === 'data') this.renderDataLists();
        if (t === 'check') {
            await this.ensureModule('check');
            this.check?.onEnter();
        }
        if (t === 'bt') {
            await this.ensureModule('backtest');
            this.backtest?.resetUI();
        }
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
            if (!list.length) {
                el.innerHTML = `<div class="empty-state">${emptyText}</div>`;
                return;
            }

            const frag = document.createDocumentFragment();
            list.slice(0, 50).forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'result-item';
                div.dataset.idx = String(idx);
                const dateStr = item.date || item.created_at || '';
                div.innerHTML = `
                    <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                    <span class="result-meta">${dateStr ? new Date(dateStr).toLocaleDateString() : ''}</span>
                    <div class="result-actions">
                      <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                      <button class="icon-btn" data-action="qr" title="QR"><i class="ph ph-qr-code"></i></button>
                    </div>
                `;
                frag.appendChild(div);
            });
            el.innerHTML = '';
            el.appendChild(frag);
        };

        fill('#favList', this.data.state.favorites, '저장된 즐겨찾기가 없습니다.');
        fill('#historyList', this.data.state.history, '생성 기록이 없습니다.');
    }

    async requestNumbers(nums) {
        if (!Array.isArray(nums) || nums.length !== 6) return;
        await this.route('gen');
        const list = $('#genResultList');
        if (!list) return;
        this.generator?.renderResultItem(nums, 0, list);
        this.data.state.generated = [nums];
        UIManager.toast('AI 추천 번호를 생성 탭으로 가져왔습니다.', 'success');
    }
}
