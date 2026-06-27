import { $ } from '../../../../utils/utils.js';
import { UIManager } from '../../../UIManager.js';

export const appDataListBindDelegationEventMethods = {
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
                            const detail =
                                linkedTickets > 0
                                    ? `연결된 티켓 ${linkedTickets}개도 함께 삭제됩니다.`
                                    : '이 캠페인만 삭제됩니다.';
                            const confirmed = await UIManager.confirm({
                                title: `'${campaign.name}' 캠페인을 삭제할까요?`,
                                message: detail
                            });
                            if (!confirmed) return;
                            const result = this.data.removeCampaign(campaign.id, { cascadeTickets: true });
                            if (result.removedCampaign) {
                                UIManager.toast(`캠페인 1개, 연결 티켓 ${result.removedTickets}개 삭제`, 'success');
                            }
                            this.renderDataLists();
                        })();
                    }
                    return;
                }

                const item =
                    source === 'ticket'
                        ? (this.data.state.ticketBook || []).find((x) => x.id === itemEl.dataset.id)
                        : (source === 'fav' ? this.data.state.favorites : this.data.state.history)[
                              Number(itemEl.dataset.rawIndex)
                          ];
                if (!item) return;

                if (action === 'copy') UIManager.copyNumbers(item.numbers);
                if (action === 'qr') UIManager.showQR(item.numbers);
                if (action === 'delete' && source === 'ticket') {
                    const result = this.data.removeTicket(item.id);
                    if (result.removed) {
                        const cleanupSuffix =
                            result.prunedCampaigns > 0 ? `, 캠페인 ${result.prunedCampaigns}개 자동 정리` : '';
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
    }
};