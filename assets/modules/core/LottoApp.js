import { $, $$ } from '../utils/utils.js';
import { DataManager } from './DataManager.js';
import { UIManager } from './UIManager.js';
import { GeneratorModule } from '../features/Generator.js';
import { runWhenIdle } from '../utils/loader.js';
import { endMark, startMark } from '../utils/perf.js';
import { StrategyWorkerClient } from './StrategyWorkerClient.js';

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
        this.navItems = [];
        this.pageItems = [];
        this.navByTarget = new Map();
        this.strategyWorker = new StrategyWorkerClient();
        this.dataListRenderToken = 0;
        this.dateFormatter = new Intl.DateTimeFormat('ko-KR');
    }

    async init() {
        startMark('app.init');
        // Link app to data manager if needed
        if (this.data.setApp) this.data.setApp(this);

        // Load Data
        this.data.load();
        this.applyTheme();

        // Eager module (default route)
        this.generator = new GeneratorModule(this);

        this.cacheStaticSelectors();

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
            console.error('당첨 데이터 조회 실패:', error);
            // Fallback for offline mode or error
            $('#latestWinMeta').innerHTML = `<span class="error-msg">데이터 동기화 실패 (오프라인)</span>`;
        }

        await this.refreshCurrentRoute();
        this.preloadLikelyModules();

        endMark('app.init');
        console.log('앱 초기화 완료');
    }

    cacheStaticSelectors() {
        this.navItems = Array.from($$('.nav-item'));
        this.pageItems = Array.from($$('.page'));
        this.navByTarget.clear();
        this.navItems.forEach((el) => {
            const target = el.dataset.target;
            if (!target) return;
            if (!this.navByTarget.has(target)) this.navByTarget.set(target, []);
            this.navByTarget.get(target).push(el);
        });
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
            // Warm important modules and worker during idle time.
            import('../features/Ai.js')
                .then((mod) => { this.moduleConstructors.ai = mod.AiModule; })
                .catch(() => null);
            import('../features/Backtest.js')
                .then((mod) => { this.moduleConstructors.backtest = mod.BacktestModule; })
                .catch(() => null);

            this.strategyWorker?.warmup?.().catch(() => null);
        });
    }

    bindNav() {
        // Desktop & Mobile Nav
        this.navItems.forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                this.route(target).catch((err) => {
                    console.error('페이지 전환 실패', err);
                    UIManager.toast('페이지 전환 중 오류가 발생했습니다.', 'error');
                });
            });
        });
    }

    bindThemeToggle() {
        const toggle = () => {
            this.data.state.theme = this.data.state.theme === 'light' ? 'dark' : 'light';
            this.data.markDirty?.('settings');
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

        $('#clearTickets')?.addEventListener('click', () => {
            const filter = $('#ticketFilter')?.value || 'all';
            const filterLabels = { all: '전체', pending: '예정', win: '당첨', lose: '미당첨' };
            const filterLabel = filterLabels[filter] || filter;
            if (!confirm(`티켓북에서 '${filterLabel}' 항목을 삭제하시겠습니까?`)) return;
            const removed = this.data.clearTicketBook(filter);
            UIManager.toast(`${removed}개 티켓 삭제`, removed > 0 ? 'success' : 'info');
            this.renderDataLists();
        });

        $('#clearCampaigns')?.addEventListener('click', () => {
            if (!confirm('캠페인을 모두 삭제하시겠습니까?')) return;
            this.data.clearCampaigns();
            this.renderDataLists();
        });

        $('#ticketFilter')?.addEventListener('change', () => this.renderDataLists());

        $('#alertEnableInApp')?.addEventListener('change', (e) => {
            this.data.setAlertPrefs({ enableInApp: Boolean(e.target.checked) });
        });
        $('#alertEnableSystem')?.addEventListener('change', (e) => {
            this.data.setAlertPrefs({ enableSystemNotification: Boolean(e.target.checked) });
        });
        $('#alertNotifyOnResult')?.addEventListener('change', (e) => {
            this.data.setAlertPrefs({ notifyOnNewResult: Boolean(e.target.checked) });
        });

        $('#syncDataBtn')?.addEventListener('click', () => {
            this.data.fetchLatestFromAPI({ silent: false, trigger: 'manual' });
        });

        $('#cancelSyncBtn')?.addEventListener('click', () => {
            const cancelled = this.data.cancelActiveSync?.();
            if (!cancelled) {
                UIManager.toast('취소 가능한 동기화가 없습니다.', 'info');
            }
        });

        // Main Refresh Button
        $('#refreshDataBtn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const icon = btn.querySelector('i');
            icon?.classList.add('ph-spin');
            try {
                await this.data.fetchLatestFromAPI({ silent: false, trigger: 'refresh' });
            } finally {
                icon?.classList.remove('ph-spin');
            }
        });

        $('#customProxyUrl')?.addEventListener('change', (e) => {
            this.data.state.customProxy = e.target.value.trim();
            this.data.markDirty?.('settings');
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
                const itemEl = e.target.closest('.result-item[data-idx], .result-item[data-id]');
                if (!itemEl) return;

                const action = btn.dataset.action;
                if (source === 'campaign') {
                    const id = itemEl.dataset.id;
                    const campaign = (this.data.state.campaigns || []).find((x) => x.id === id);
                    if (!campaign) return;
                    if (action === 'delete') {
                        this.data.removeCampaign(campaign.id);
                        this.renderDataLists();
                    }
                    return;
                }

                let item = null;
                if (source === 'ticket') {
                    const id = itemEl.dataset.id;
                    item = (this.data.state.ticketBook || []).find((x) => x.id === id);
                } else {
                    const idx = Number(itemEl.dataset.idx);
                    const items = source === 'fav' ? this.data.state.favorites : this.data.state.history;
                    item = items[idx];
                }
                if (!item) return;

                if (action === 'copy') UIManager.copyNumbers(item.numbers);
                if (action === 'qr') UIManager.showQR(item.numbers);
                if (action === 'delete' && source === 'ticket') {
                    this.data.removeTicket(item.id);
                    this.renderDataLists();
                }
            });
        };

        bindList('#favList', 'fav');
        bindList('#historyList', 'hist');
        bindList('#ticketList', 'ticket');
        bindList('#campaignList', 'campaign');
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
        const perfLabel = `route:${target}`;
        startMark(perfLabel);
        const localToken = ++this.routeToken;
        const changedRoute = this.currentRoute !== target;
        this.currentRoute = target;

        try {
            if (changedRoute) {
                // Active Nav
                this.navItems.forEach((el) => el.classList.remove('active'));
                (this.navByTarget.get(target) || []).forEach((el) => el.classList.add('active'));

                // Active Page
                this.pageItems.forEach((el) => el.classList.remove('active'));
                const page = $(`#page-${target}`);
                if (page) page.classList.add('active');
            }
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
        } finally {
            endMark(perfLabel, { changedRoute });
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

        const nextDrawNo = Number(latest.draw_no) + 1;
        ['genTargetDrawNo', 'campStartDraw', 'aiTargetDrawNo'].forEach((id) => {
            const el = $(`#${id}`);
            if (!el) return;
            const current = Number(el.value);
            if (!Number.isFinite(current) || current <= 1) {
                el.value = String(nextDrawNo);
            }
        });
    }

    renderDataLists() {
        startMark('data.render');
        const renderToken = ++this.dataListRenderToken;
        // Lazy rendering helper to prevent main thread blocking
        const renderChunk = (list, renderer, targetEl, chunkSize = 20) => {
            if (!targetEl) return;
            targetEl.innerHTML = '';
            let index = 0;

            const doChunk = () => {
                if (renderToken !== this.dataListRenderToken) return;
                const end = Math.min(index + chunkSize, list.length);
                let html = '';
                for (let i = index; i < end; i++) {
                    const item = list[i];
                    const attrs = [
                        renderer.datasetId ? ` data-id="${item.id}"` : '',
                        renderer.datasetIdx ? ` data-idx="${i}"` : ''
                    ].join('');
                    html += `<div class="result-item"${attrs}>${renderer.html(item)}</div>`;
                }

                targetEl.insertAdjacentHTML('beforeend', html);
                index = end;

                if (index < list.length) {
                    if (window.requestIdleCallback) {
                        window.requestIdleCallback(doChunk, { timeout: 100 });
                    } else {
                        setTimeout(doChunk, 16);
                    }
                }
            };

            if (list.length > 0) doChunk();
        };

        const fill = (id, list, emptyText) => {
            const el = $(id);
            if (!el) return;
            if (!list.length) {
                el.innerHTML = `
                    <div class="empty-state">
                        <i class="ph ph-folder-open"></i>
                        <p>${emptyText}</p>
                    </div>
                `;
                return;
            }

            renderChunk(list.slice(0, 50), {
                datasetIdx: true,
                html: (item) => {
                    const dateStr = item.date || item.created_at || '';
                    return `
                        <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                        <span class="result-meta">${this.formatDate(dateStr)}</span>
                        <div class="result-actions">
                          <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                          <button class="icon-btn" data-action="qr" title="큐알"><i class="ph ph-qr-code"></i></button>
                        </div>
                    `;
                }
            }, el);
        };

        const fillTickets = () => {
            const el = $('#ticketList');
            if (!el) return;
            const filter = $('#ticketFilter')?.value || 'all';
            const raw = this.data.state.ticketBook || [];
            const status = (item) => {
                if (!item.checked) return 'pending';
                if (item.checked.rank > 0) return 'win';
                return 'lose';
            };
            const list = raw.filter((item) => filter === 'all' || status(item) === filter);
            if (!list.length) {
                el.innerHTML = `
                    <div class="empty-state">
                        <i class="ph ph-ticket"></i>
                        <p>조건에 맞는 티켓이 없습니다.</p>
                    </div>
                `;
                return;
            }

            renderChunk(list.slice(0, 100), {
                datasetId: true,
                html: (item) => {
                    const rankText = !item.checked ? '미정산' : (item.checked.rank > 0 ? `${item.checked.rank}등` : '미당첨');
                    return `
                        <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                        <span class="result-meta">${item.targetDrawNo}회 · ${rankText}</span>
                        <div class="result-actions">
                          <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                          <button class="icon-btn" data-action="qr" title="큐알"><i class="ph ph-qr-code"></i></button>
                          <button class="icon-btn" data-action="delete" title="삭제"><i class="ph ph-trash"></i></button>
                        </div>
                    `;
                }
            }, el);
        };

        const fillCampaigns = () => {
            const el = $('#campaignList');
            if (!el) return;
            const list = this.data.state.campaigns || [];
            if (!list.length) {
                el.innerHTML = `
                    <div class="empty-state">
                        <i class="ph ph-calendar-blank"></i>
                        <p>저장된 캠페인이 없습니다.</p>
                    </div>
                `;
                return;
            }

            el.innerHTML = '';
            const fragment = document.createDocumentFragment();
            list.slice(0, 50).forEach((item) => {
                const row = document.createElement('div');
                row.className = 'result-item';
                row.dataset.id = String(item.id || '');

                const title = document.createElement('div');
                title.className = 'result-meta';
                title.textContent = String(item.name || '');

                const meta = document.createElement('span');
                meta.className = 'result-meta';
                meta.textContent = `${item.startDrawNo}회 시작 총 ${item.weeks}주, 주당 ${item.setsPerWeek}세트`;

                const actions = document.createElement('div');
                actions.className = 'result-actions';
                const button = document.createElement('button');
                button.className = 'icon-btn';
                button.dataset.action = 'delete';
                button.title = '삭제';
                button.setAttribute('aria-label', '캠페인 삭제');
                const icon = document.createElement('i');
                icon.className = 'ph ph-trash';
                button.appendChild(icon);
                actions.appendChild(button);

                row.appendChild(title);
                row.appendChild(meta);
                row.appendChild(actions);
                fragment.appendChild(row);
            });
            el.appendChild(fragment);
        };

        fill('#favList', this.data.state.favorites, '저장된 즐겨찾기가 없습니다.');
        fill('#historyList', this.data.state.history, '생성 기록이 없습니다.');
        fillTickets();
        fillCampaigns();

        const inApp = $('#alertEnableInApp');
        const system = $('#alertEnableSystem');
        const notify = $('#alertNotifyOnResult');
        if (inApp) inApp.checked = this.data.state.alertPrefs?.enableInApp !== false;
        if (system) system.checked = Boolean(this.data.state.alertPrefs?.enableSystemNotification);
        if (notify) notify.checked = this.data.state.alertPrefs?.notifyOnNewResult !== false;
        endMark('data.render');
    }

    formatDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return this.dateFormatter.format(d);
    }

    async requestNumbers(nums) {
        if (!Array.isArray(nums) || nums.length !== 6) return;
        await this.route('gen');
        const list = $('#genResultList');
        if (!list) return;
        this.generator?.renderResultItem(nums, 0, list);
        this.data.state.generated = [nums];
        UIManager.toast('인공지능 추천 번호를 생성 탭으로 가져왔습니다.', 'success');
    }
}
