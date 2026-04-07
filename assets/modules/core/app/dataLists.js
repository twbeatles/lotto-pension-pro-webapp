import { $ } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';
import { endMark, startMark } from '../../utils/perf.js';
import { CONFIG } from '../../utils/config.js';
export const appDataListMethods = {
    bindDataEvents() {
        $('#clearFavorites')?.addEventListener('click', async () => {
            const confirmed = await UIManager.confirm({
                title: '즐겨찾기를 모두 삭제할까요?',
                message: `${this.data.state.favorites.length}개 항목이 삭제됩니다.`
            });
            if (!confirmed) return;
            this.data.clearFavorites();
            this.renderDataLists();
        });

        $('#clearHistory')?.addEventListener('click', async () => {
            const confirmed = await UIManager.confirm({
                title: '히스토리를 모두 삭제할까요?',
                message: `${this.data.state.history.length}개 항목이 삭제됩니다.`
            });
            if (!confirmed) return;
            this.data.clearHistory();
            this.renderDataLists();
        });

        $('#clearTickets')?.addEventListener('click', async () => {
            const filter = $('#ticketFilter')?.value || 'all';
            const filterLabels = { all: '전체', pending: '예정', win: '당첨', lose: '미당첨' };
            const filterLabel = filterLabels[filter] || filter;
            const visibleTickets = (this.data.state.ticketBook || []).filter((item) => {
                return filter === 'all' || this.getTicketStatusMeta(item).code === filter;
            });
            const visibleCount = this.data.getTotalTicketCount(visibleTickets);
            const confirmed = await UIManager.confirm({
                title: `티켓북에서 '${filterLabel}' 항목을 삭제할까요?`,
                message: `${visibleCount}개 티켓이 삭제됩니다.`
            });
            if (!confirmed) return;
            const result = this.data.clearTicketBook(filter);
            const cleanupSuffix = result.prunedCampaigns > 0 ? `, 캠페인 ${result.prunedCampaigns}개 자동 정리` : '';
            UIManager.toast(`${result.removedTickets}개 티켓 삭제${cleanupSuffix}`, result.removedTickets > 0 ? 'success' : 'info');
            this.renderDataLists();
        });

        $('#clearCampaigns')?.addEventListener('click', async () => {
            const campaigns = this.data.state.campaigns || [];
            if (!campaigns.length) {
                UIManager.toast('삭제할 캠페인이 없습니다.', 'info');
                return;
            }
            const linkedTickets = this.data.countTicketsByCampaignIds(campaigns.map((item) => item.id));
            const detail = linkedTickets > 0 ? `캠페인 ${campaigns.length}개와 연결 티켓 ${linkedTickets}개가 함께 삭제됩니다.` : `캠페인 ${campaigns.length}개가 삭제됩니다.`;
            const confirmed = await UIManager.confirm({
                title: '캠페인을 모두 삭제할까요?',
                message: detail
            });
            if (!confirmed) return;
            const result = this.data.clearCampaigns({ cascadeTickets: true });
            UIManager.toast(
                `캠페인 ${result.removedCampaigns}개, 연결 티켓 ${result.removedTickets}개 삭제`,
                result.removedCampaigns > 0 ? 'success' : 'info'
            );
            this.renderDataLists();
        });

        $('#clearLocalUpdatesBtn')?.addEventListener('click', async () => {
            const updateCount = this.data.getLocalUpdates().length;
            if (!updateCount) {
                UIManager.toast('정리할 로컬 업데이트가 없습니다.', 'info');
                return;
            }
            const confirmed = await UIManager.confirm({
                title: '로컬 최신 회차 업데이트를 정리할까요?',
                message: `${updateCount}개 보정 데이터가 삭제되고 정적 JSON 기준으로 다시 구성됩니다.`
            });
            if (!confirmed) return;

            this.data.clearLocalUpdates?.();
            await this.data.fetchWinningStats({ notifyTicketSettle: false });
            this.updateLatestWin();
            await this.refreshCurrentRoute();
            this.renderDataLists();
            UIManager.toast(`로컬 업데이트 ${updateCount}개를 정리했습니다.`, 'success');
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
            if (this.data.resolveProxyConfig?.()?.url) {
                this.queueAutoSync?.('proxy-change', { delayMs: 300, force: true });
            }
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
                        void (async () => {
                        const linkedTickets = this.data.countTicketsByCampaignId(campaign.id);
                        const detail = linkedTickets > 0 ? `연결된 티켓 ${linkedTickets}개도 함께 삭제됩니다.` : '이 캠페인만 삭제됩니다.';
                        const confirmed = await UIManager.confirm({
                            title: `'${campaign.name}' 캠페인을 삭제할까요?`,
                            message: detail
                        });
                        if (!confirmed) return;
                        const result = this.data.removeCampaign(campaign.id, { cascadeTickets: true });
                        if (result.removedCampaign) {
                            UIManager.toast(
                                `캠페인 1개, 연결 티켓 ${result.removedTickets}개 삭제`,
                                'success'
                            );
                        }
                        this.renderDataLists();
                        })();
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
                    const result = this.data.removeTicket(item.id);
                    if (result.removed) {
                        const cleanupSuffix = result.prunedCampaigns > 0
                            ? `, 캠페인 ${result.prunedCampaigns}개 자동 정리`
                            : '';
                        UIManager.toast(`${result.removedTickets}개 티켓 삭제${cleanupSuffix}`, 'success');
                    }
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
                this.getTicketStatusMeta(item).label,
                `x${this.data.getTicketQuantity(item)}`
            ]));
        const ticketPage = this.paginateItems('ticket', tickets);
        ticketPage.summaryText = `총 ${this.data.getTotalTicketCount(tickets)}개 티켓`;
        if (!ticketPage.totalItems) {
            renderEmpty('#ticketList', 'ph-ticket', this.getDataListState('ticket').query ? '검색 결과가 없습니다.' : '조건에 맞는 티켓이 없습니다.');
        } else {
            $('#ticketList').innerHTML = ticketPage.items.map((item) => {
                const status = this.getTicketStatusMeta(item);
                const quantity = this.data.getTicketQuantity(item);
                return `
                    <div class="result-item" data-id="${this.escapeHtml(item.id)}">
                        <div class="result-main">
                            <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                            <span class="result-meta result-meta-inline">
                                <span>${item.targetDrawNo}회차 · ${status.label}</span>
                                ${quantity > 1 ? `<span class="badge status-badge ticket-quantity-badge">x${quantity}</span>` : ''}
                            </span>
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

        const localUpdates = this.data.getLocalUpdates();
        const localUpdatesSummary = $('#localUpdatesSummary');
        if (localUpdatesSummary) {
            localUpdatesSummary.textContent = localUpdates.length
                ? `로컬 최신 회차 보정 데이터 ${localUpdates.length}개가 저장되어 있습니다.`
                : '저장된 로컬 최신 회차 보정 데이터가 없습니다.';
        }
        const localUpdatesMeta = $('#localUpdatesMeta');
        if (localUpdatesMeta) {
            const latestLocalDraw = localUpdates.length ? Math.max(...localUpdates.map((item) => Number(item?.draw_no || 0))) : 0;
            localUpdatesMeta.textContent = latestLocalDraw > 0
                ? `가장 최근 로컬 반영 회차: ${latestLocalDraw}회`
                : '정적 JSON만 사용 중입니다.';
        }
        const clearLocalUpdatesBtn = $('#clearLocalUpdatesBtn');
        if (clearLocalUpdatesBtn) clearLocalUpdatesBtn.disabled = !localUpdates.length;

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
        this._persistDataListState?.();
    },

    setDataListPage(scope, page) {
        const state = this.getDataListState(scope);
        const nextPage = Math.max(1, Math.floor(Number(page) || 1));
        state.page = nextPage;
        this._persistDataListState?.();
    },

    _persistDataListState() {
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(
                    CONFIG.KEYS.SESSION_DATA_LIST_STATE,
                    JSON.stringify(this.dataListState)
                );
            }
        } catch (_e) {
            // sessionStorage 저장 실패는 조용히 무시
        }
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
            <span class="pagination-summary">${pageInfo?.summaryText || `총 ${totalItems}개`}</span>
            <div class="pagination-actions">
                <button class="btn ghost sm" data-page-scope="${scope}" data-page="${prevPage}" ${page <= 1 ? 'disabled' : ''}>이전</button>
                <span class="pagination-page">${page} / ${totalPages}</span>
                <button class="btn ghost sm" data-page-scope="${scope}" data-page="${nextPage}" ${page >= totalPages ? 'disabled' : ''}>다음</button>
            </div>
        `;
    },

    formatDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return this.dateFormatter.format(d);
    }
};
