import { $ } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';
import { endMark, startMark } from '../../utils/perf.js';
export const appDataListMethods = {
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
            const campaigns = this.data.state.campaigns || [];
            if (!campaigns.length) {
                UIManager.toast('삭제할 캠페인이 없습니다.', 'info');
                return;
            }
            const linkedTickets = this.data.countTicketsByCampaignIds(campaigns.map((item) => item.id));
            const detail = linkedTickets > 0 ? ` 연결된 티켓 ${linkedTickets}개도 함께 삭제됩니다.` : '';
            if (!confirm(`캠페인 ${campaigns.length}개를 모두 삭제하시겠습니까?${detail}`)) return;
            const result = this.data.clearCampaigns({ cascadeTickets: true });
            UIManager.toast(
                `캠페인 ${result.removedCampaigns}개, 연결 티켓 ${result.removedTickets}개 삭제`,
                result.removedCampaigns > 0 ? 'success' : 'info'
            );
            this.renderDataLists();
        });

        $('#ticketFilter')?.addEventListener('change', () => {
            this.setDataListPage('ticket', 1);
            this.renderDataLists();
        });

        [
            ['#favSearch', 'fav'],
            ['#historySearch', 'history'],
            ['#ticketSearch', 'ticket'],
            ['#campaignSearch', 'campaign']
        ].forEach(([selector, scope]) => {
            $(selector)?.addEventListener('input', (e) => {
                this.setDataListQuery(scope, e.currentTarget.value || '');
                this.renderDataLists();
            });
        });

        ['#favPagination', '#historyPagination', '#ticketPagination', '#campaignPagination'].forEach((selector) => {
            $(selector)?.addEventListener('click', (e) => {
                const button = e.target.closest('button[data-page-scope][data-page]');
                if (!button) return;
                const scope = button.dataset.pageScope;
                const nextPage = Number(button.dataset.page);
                if (!scope || !Number.isFinite(nextPage)) return;
                this.setDataListPage(scope, nextPage);
                this.renderDataLists();
            });
        });

        $('#alertEnableInApp')?.addEventListener('change', (e) => {
            this.data.setAlertPrefs({ enableInApp: Boolean(e.target.checked) });
            this.renderSettingsPanel();
        });
        $('#alertEnableSystem')?.addEventListener('change', async (e) => {
            await this.handleSystemNotificationToggle(Boolean(e.target.checked));
        });
        $('#alertNotifyOnResult')?.addEventListener('change', (e) => {
            this.data.setAlertPrefs({ notifyOnNewResult: Boolean(e.target.checked) });
            this.renderSettingsPanel();
        });
        $('#testSystemNotificationBtn')?.addEventListener('click', async () => {
            await this.handleTestSystemNotification();
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
            this.renderSettingsPanel();
        });
    },

    bindPersistenceEvents() {
        const flushSave = () => {
            this.data.save(true);
        };
        window.addEventListener('pagehide', flushSave);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                flushSave();
            }
        });
    },

    bindDataListDelegation() {
        if (this.dataListDelegationBound) return;

        const bindList = (listId, source) => {
            const el = $(listId);
            if (!el) return;
            el.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const itemEl = e.target.closest('.result-item[data-raw-index], .result-item[data-id]');
                if (!itemEl) return;

                const action = btn.dataset.action;
                if (source === 'campaign') {
                    const id = itemEl.dataset.id;
                    const campaign = (this.data.state.campaigns || []).find((x) => x.id === id);
                    if (!campaign) return;
                    if (action === 'delete') {
                        const linkedTickets = this.data.countTicketsByCampaignId(campaign.id);
                        const detail = linkedTickets > 0 ? ` 연결된 티켓 ${linkedTickets}개도 함께 삭제됩니다.` : '';
                        if (!confirm(`'${campaign.name}' 캠페인을 삭제하시겠습니까?${detail}`)) return;
                        const result = this.data.removeCampaign(campaign.id, { cascadeTickets: true });
                        if (result.removedCampaign) {
                            UIManager.toast(
                                `캠페인 1개, 연결 티켓 ${result.removedTickets}개 삭제`,
                                'success'
                            );
                        }
                        this.renderDataLists();
                    }
                    return;
                }

                const item = source === 'ticket'
                    ? (this.data.state.ticketBook || []).find((x) => x.id === itemEl.dataset.id)
                    : (source === 'fav' ? this.data.state.favorites : this.data.state.history)[Number(itemEl.dataset.rawIndex)];
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
    },

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

        this.renderSettingsPanel();
        endMark('data.render');
    },

    escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    getDataListState(scope) {
        if (!this.dataListState[scope]) {
            this.dataListState[scope] = { query: '', page: 1 };
        }
        return this.dataListState[scope];
    },

    setDataListQuery(scope, query) {
        const state = this.getDataListState(scope);
        const normalized = String(query || '').trim();
        if (state.query === normalized) return;
        state.query = normalized;
        state.page = 1;
    },

    setDataListPage(scope, page) {
        const state = this.getDataListState(scope);
        const nextPage = Math.max(1, Math.floor(Number(page) || 1));
        state.page = nextPage;
    },

    matchesSearch(query, values = []) {
        const normalizedQuery = String(query || '').trim().toLowerCase();
        if (!normalizedQuery) return true;
        return values.some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    },

    getTicketStatusMeta(item) {
        if (!item?.checked) return { code: 'pending', label: '예정' };
        if (Number(item.checked.rank) > 0) return { code: 'win', label: `${item.checked.rank}등` };
        return { code: 'lose', label: '미당첨' };
    },

    paginateItems(scope, items = []) {
        const state = this.getDataListState(scope);
        const totalItems = items.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / this.dataListPageSize));
        const page = Math.min(state.page, totalPages);
        state.page = page;
        const start = (page - 1) * this.dataListPageSize;
        return {
            items: items.slice(start, start + this.dataListPageSize),
            totalItems,
            totalPages,
            page
        };
    },

    renderPagination(containerSelector, scope, pageInfo) {
        const el = $(containerSelector);
        if (!el) return;
        const totalItems = Number(pageInfo?.totalItems || 0);
        if (!totalItems) {
            el.innerHTML = '';
            return;
        }

        const totalPages = Math.max(1, Number(pageInfo?.totalPages || 1));
        const page = Math.max(1, Number(pageInfo?.page || 1));
        const prevPage = Math.max(1, page - 1);
        const nextPage = Math.min(totalPages, page + 1);

        el.innerHTML = `
            <span class="pagination-summary">총 ${totalItems}개</span>
            <div class="pagination-actions">
                <button class="btn ghost sm" data-page-scope="${scope}" data-page="${prevPage}" ${page <= 1 ? 'disabled' : ''}>이전</button>
                <span class="pagination-page">${page} / ${totalPages}</span>
                <button class="btn ghost sm" data-page-scope="${scope}" data-page="${nextPage}" ${page >= totalPages ? 'disabled' : ''}>다음</button>
            </div>
        `;
    },

    renderDataListsLegacy() {
        startMark('data.render');

        const setInputValue = (selector, value) => {
            const el = $(selector);
            if (el && el.value !== value) el.value = value;
        };
        const renderEmpty = (selector, icon, text) => {
            const el = $(selector);
            if (!el) return;
            el.innerHTML = `
                <div class="empty-state">
                    <i class="ph ${icon}"></i>
                    <p>${text}</p>
                </div>
            `;
        };

        setInputValue('#favSearch', this.getDataListState('fav').query);
        setInputValue('#historySearch', this.getDataListState('history').query);
        setInputValue('#ticketSearch', this.getDataListState('ticket').query);
        setInputValue('#campaignSearch', this.getDataListState('campaign').query);

        const favorites = (this.data.state.favorites || [])
            .map((item, rawIndex) => ({ item, rawIndex }))
            .filter(({ item }) => this.matchesSearch(this.getDataListState('fav').query, [
                (item.numbers || []).join(', '),
                item.date,
                this.formatDate(item.date)
            ]));
        const favoritePage = this.paginateItems('fav', favorites);
        if (!favoritePage.totalItems) {
            renderEmpty('#favList', 'ph-folder-open', this.getDataListState('fav').query ? '검색 결과가 없습니다.' : '저장된 즐겨찾기가 없습니다.');
        } else {
            $('#favList').innerHTML = favoritePage.items.map(({ item, rawIndex }) => `
                <div class="result-item" data-raw-index="${rawIndex}">
                    <div class="result-main">
                        <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                        <span class="result-meta">${this.formatDate(item.date)}</span>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                        <button class="icon-btn" data-action="qr" title="QR"><i class="ph ph-qr-code"></i></button>
                    </div>
                </div>
            `).join('');
        }
        this.renderPagination('#favPagination', 'fav', favoritePage);

        const history = (this.data.state.history || [])
            .map((item, rawIndex) => ({ item, rawIndex }))
            .filter(({ item }) => this.matchesSearch(this.getDataListState('history').query, [
                (item.numbers || []).join(', '),
                item.date,
                this.formatDate(item.date)
            ]));
        const historyPage = this.paginateItems('history', history);
        if (!historyPage.totalItems) {
            renderEmpty('#historyList', 'ph-clock-counter-clockwise', this.getDataListState('history').query ? '검색 결과가 없습니다.' : '생성 히스토리가 없습니다.');
        } else {
            $('#historyList').innerHTML = historyPage.items.map(({ item, rawIndex }) => `
                <div class="result-item" data-raw-index="${rawIndex}">
                    <div class="result-main">
                        <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                        <span class="result-meta">${this.formatDate(item.date)}</span>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                        <button class="icon-btn" data-action="qr" title="QR"><i class="ph ph-qr-code"></i></button>
                    </div>
                </div>
            `).join('');
        }
        this.renderPagination('#historyPagination', 'history', historyPage);

        const ticketFilter = $('#ticketFilter')?.value || 'all';
        const tickets = (this.data.state.ticketBook || [])
            .filter((item) => ticketFilter === 'all' || this.getTicketStatusMeta(item).code === ticketFilter)
            .filter((item) => this.matchesSearch(this.getDataListState('ticket').query, [
                (item.numbers || []).join(', '),
                item.targetDrawNo,
                this.getTicketStatusMeta(item).label
            ]));
        const ticketPage = this.paginateItems('ticket', tickets);
        if (!ticketPage.totalItems) {
            renderEmpty('#ticketList', 'ph-ticket', this.getDataListState('ticket').query ? '검색 결과가 없습니다.' : '조건에 맞는 티켓이 없습니다.');
        } else {
            $('#ticketList').innerHTML = ticketPage.items.map((item) => {
                const status = this.getTicketStatusMeta(item);
                return `
                    <div class="result-item" data-id="${this.escapeHtml(item.id)}">
                        <div class="result-main">
                            <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                            <span class="result-meta">${item.targetDrawNo}회차 · ${status.label}</span>
                        </div>
                        <div class="result-actions">
                            <button class="icon-btn" data-action="copy" title="복사"><i class="ph ph-copy"></i></button>
                            <button class="icon-btn" data-action="qr" title="QR"><i class="ph ph-qr-code"></i></button>
                            <button class="icon-btn" data-action="delete" title="삭제"><i class="ph ph-trash"></i></button>
                        </div>
                    </div>
                `;
            }).join('');
        }
        this.renderPagination('#ticketPagination', 'ticket', ticketPage);

        const campaigns = (this.data.state.campaigns || [])
            .filter((item) => this.matchesSearch(this.getDataListState('campaign').query, [
                item.name,
                item.startDrawNo
            ]));
        const campaignPage = this.paginateItems('campaign', campaigns);
        if (!campaignPage.totalItems) {
            renderEmpty('#campaignList', 'ph-calendar-blank', this.getDataListState('campaign').query ? '검색 결과가 없습니다.' : '등록된 캠페인이 없습니다.');
        } else {
            $('#campaignList').innerHTML = campaignPage.items.map((item) => `
                <div class="result-item" data-id="${this.escapeHtml(item.id)}">
                    <div class="result-main">
                        <strong class="result-title">${this.escapeHtml(item.name)}</strong>
                        <span class="result-meta">${item.startDrawNo}회차 시작 · ${item.weeks}주 · 주당 ${item.setsPerWeek}세트</span>
                    </div>
                    <div class="result-actions">
                        <button class="icon-btn" data-action="delete" title="삭제" aria-label="캠페인 삭제"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }
        this.renderPagination('#campaignPagination', 'campaign', campaignPage);

        const inApp = $('#alertEnableInApp');
        const system = $('#alertEnableSystem');
        const notify = $('#alertNotifyOnResult');
        if (inApp) inApp.checked = this.data.state.alertPrefs?.enableInApp !== false;
        if (system) system.checked = Boolean(this.data.state.alertPrefs?.enableSystemNotification);
        if (notify) notify.checked = this.data.state.alertPrefs?.notifyOnNewResult !== false;

        const permission = this.data.getNotificationPermissionState();
        const permissionBadge = $('#systemNotificationStatusBadge');
        if (permissionBadge) {
            permissionBadge.textContent = permission.label;
            permissionBadge.className = `badge ${this.getStatusBadgeClass(permission.code)}`;
        }
        const permissionHelp = $('#systemNotificationHelp');
        if (permissionHelp) {
            permissionHelp.textContent = permission.code === 'granted'
                ? '브라우저 권한이 허용되어 있습니다.'
                : permission.code === 'unsupported'
                    ? '현재 환경에서는 시스템 알림을 지원하지 않습니다.'
                    : '시스템 알림 토글을 켜면 권한을 요청합니다.';
        }

        const storageSummary = this.data.getStorageSummary();
        const storageBadge = $('#storageHealthBadge');
        if (storageBadge) {
            storageBadge.textContent = this.getStorageHealthLabel(storageSummary.status);
            storageBadge.className = `badge ${this.getStatusBadgeClass(storageSummary.status)}`;
        }
        const storageUsage = $('#storageUsageValue');
        if (storageUsage) storageUsage.textContent = this.formatBytes(storageSummary.bytes);
        const storageCounts = $('#storageCountsValue');
        if (storageCounts) {
            storageCounts.textContent = `즐겨찾기 ${storageSummary.counts.favorites} · 히스토리 ${storageSummary.counts.history} · 티켓 ${storageSummary.counts.tickets} · 캠페인 ${storageSummary.counts.campaigns}`;
        }
        const storageNotice = $('#storageHealthNote');
        if (storageNotice) storageNotice.textContent = this.getStorageHealthMessage(storageSummary);

        const proxyInput = $('#customProxyUrl');
        if (proxyInput && proxyInput.value !== (this.data.state.customProxy || '')) {
            proxyInput.value = this.data.state.customProxy || '';
        }

        const freshness = this.data.getDataFreshness();
        const syncMeta = this.data.state.syncMeta || this.data.getDefaultSyncMeta?.() || {};
        const syncModeEl = $('#syncMetaMode');
        if (syncModeEl) syncModeEl.textContent = this.data.getSyncModeLabel(syncMeta.mode);
        const syncSourceEl = $('#syncMetaSource');
        if (syncSourceEl) syncSourceEl.textContent = syncMeta.currentSource || '-';
        const syncSuccessEl = $('#syncMetaLastSuccess');
        if (syncSuccessEl) syncSuccessEl.textContent = syncMeta.lastSuccessAt ? this.formatDateTime(syncMeta.lastSuccessAt) : '-';
        const syncDrawEl = $('#syncMetaLastDraw');
        if (syncDrawEl) syncDrawEl.textContent = syncMeta.lastSuccessDrawNo ? `${syncMeta.lastSuccessDrawNo}회차` : '-';
        const syncFailureEl = $('#syncMetaLastFailure');
        if (syncFailureEl) {
            syncFailureEl.textContent = syncMeta.lastFailureMessage
                ? `${this.formatDateTime(syncMeta.lastFailureAt)} · ${syncMeta.lastFailureMessage}`
                : '-';
        }
        const syncWarningEl = $('#syncMetaWarning');
        if (syncWarningEl) {
            if (freshness.isStale) {
                syncWarningEl.textContent = freshness.hasProxy
                    ? `현재 데이터가 예상 최신 회차보다 ${freshness.behindBy}회차 뒤처져 있습니다. 지금 동기화할 수 있습니다.`
                    : `현재 데이터가 예상 최신 회차보다 ${freshness.behindBy}회차 뒤처져 있습니다. 프록시 URL을 설정하면 실시간 동기화를 사용할 수 있습니다.`;
            } else if (freshness.staticBehindBy > 0) {
                syncWarningEl.textContent = `정적 JSON은 ${freshness.staticBehindBy}회차 뒤처져 있지만 로컬 업데이트가 보완하고 있습니다.`;
            } else {
                syncWarningEl.textContent = '현재 데이터는 최신 상태입니다.';
            }
        }

        endMark('data.render');
    },

    formatDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return this.dateFormatter.format(d);
    }
};
