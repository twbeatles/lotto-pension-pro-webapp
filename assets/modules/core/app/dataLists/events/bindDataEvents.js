import { $ } from '../../../../utils/utils.js';
import { UIManager } from '../../../UIManager.js';

export const appDataListBindDataEventMethods = {
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
                title: `내 번호 보관함에서 '${filterLabel}' 항목을 삭제할까요?`,
                message: `${visibleCount}개 티켓이 삭제됩니다.`
            });
            if (!confirmed) return;
            const result = this.data.clearTicketBook(filter);
            const cleanupSuffix = result.prunedCampaigns > 0 ? `, 캠페인 ${result.prunedCampaigns}개 자동 정리` : '';
            UIManager.toast(
                `${result.removedTickets}개 티켓 삭제${cleanupSuffix}`,
                result.removedTickets > 0 ? 'success' : 'info'
            );
            this.renderDataLists();
        });

        $('#clearCampaigns')?.addEventListener('click', async () => {
            const campaigns = this.data.state.campaigns || [];
            if (!campaigns.length) {
                UIManager.toast('삭제할 캠페인이 없습니다.', 'info');
                return;
            }
            const linkedTickets = this.data.countTicketsByCampaignIds(campaigns.map((item) => item.id));
            const detail =
                linkedTickets > 0
                    ? `캠페인 ${campaigns.length}개와 연결 티켓 ${linkedTickets}개가 함께 삭제됩니다.`
                    : `캠페인 ${campaigns.length}개가 삭제됩니다.`;
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
            await this.data.fetchWinningStats({
                notifyTicketSettle: false,
                preserveExistingOnFailure: false
            });
            this.updateLatestWin();
            await this.refreshCurrentRoute();
            this.renderDataLists();
            UIManager.toast(`로컬 업데이트 ${updateCount}개를 정리했습니다.`, 'success');
        });

        const runBackupAndCleanup = async () => {
            const summary = this.data.getStorageSummary?.() || { counts: {} };
            const confirmed = await UIManager.confirm({
                title: '백업하고 오래된 데이터를 정리할까요?',
                message:
                    `먼저 현재 데이터를 백업 파일로 저장합니다.\n` +
                    `그 다음 생성 히스토리는 최근 200개만 남기고, 정산 끝난 미당첨 번호만 정리합니다.\n` +
                    `예정 번호, 당첨 번호, 내 기기 최신 회차 보정 데이터는 삭제하지 않습니다.\n\n` +
                    `현재 저장: 히스토리 ${summary.counts?.history || 0}개 / 번호 ${summary.counts?.tickets || 0}개`
            });
            if (!confirmed) return;

            const dataIo = await this.ensureModule?.('dataIO');
            const backup = await dataIo?.ensureBackupBeforeDestructive?.({
                prefix: 'lotto_pension_pro_before_cleanup',
                errorMessage: '백업 파일 다운로드를 확인할 수 없어 데이터 정리를 중단했습니다.'
            });
            if (!backup) return;
            const result = this.data.cleanupStoredRecords({ keepHistory: 200, removeSettledLosses: true });
            this.renderDataLists();
            this.renderSettingsPanel?.();
            UIManager.toast(
                `정리 완료: 히스토리 ${result.historyTrimmed}개, 미당첨 번호 ${result.removedTickets}개, 캠페인 ${result.removedCampaigns}개`,
                result.historyTrimmed || result.removedTickets || result.removedCampaigns ? 'success' : 'info',
                4500
            );
        };

        $('#backupAndCleanupBtn')?.addEventListener('click', runBackupAndCleanup);
        $('#settingsBackupAndCleanupBtn')?.addEventListener('click', runBackupAndCleanup);

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
            this.data.abortSyncInFlight?.({ force: true });
            this.data.state.customProxy = e.target.value.trim();
            this.data.markDirty?.('settings');
            this.data.save();
            this.renderSettingsPanel();
            this.queueAutoSync?.('proxy-change', { delayMs: 300, force: true });
        });
    }
};