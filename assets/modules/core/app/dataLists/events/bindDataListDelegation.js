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
                                    ? `이 묶음으로 저장한 구매 번호 ${linkedTickets}개도 함께 삭제됩니다.`
                                    : '이 회차 묶음만 삭제됩니다.';
                            const confirmed = await UIManager.confirm({
                                title: `'${campaign.name}' 회차 묶음을 삭제할까요?`,
                                message: detail
                            });
                            if (!confirmed) return;
                            const result = this.data.removeCampaign(campaign.id, { cascadeTickets: true });
                            if (result.removedCampaign) {
                                UIManager.toast(`회차 묶음과 구매 번호 ${result.removedTickets}개를 삭제했어요.`, 'success');
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
                if (action === 'ticket' && source !== 'ticket') {
                    const targetDrawNo = (Number(this.data.state.winningStats?.[0]?.draw_no) || 0) + 1;
                    const result = this.data.addTicket(item.numbers, {
                        source: 'generator',
                        targetDrawNo
                    });
                    if (result?.ticket) {
                        UIManager.toast(
                            result.incremented
                                ? `${targetDrawNo}회차에 같은 번호가 있어 수량을 ${result.quantity}장으로 늘렸어요.`
                                : `${targetDrawNo}회차 구매 번호로 저장했어요.`,
                            'success'
                        );
                    } else {
                        UIManager.toast('구매 번호로 저장하지 못했어요.', 'error');
                    }
                    this.renderDataLists();
                    return;
                }
                if (action === 'delete' && (source === 'fav' || source === 'hist')) {
                    const rawIndex = Number(itemEl.dataset.rawIndex);
                    const removed =
                        source === 'fav' ? this.data.removeFavoriteAt(rawIndex) : this.data.removeHistoryAt(rawIndex);
                    if (removed) UIManager.toast('삭제했어요.', 'success');
                    this.renderDataLists();
                    return;
                }
                if (action === 'delete' && source === 'ticket') {
                    const result = this.data.removeTicket(item.id);
                    if (result.removed) {
                        const cleanupSuffix =
                            result.prunedCampaigns > 0 ? `, 회차 묶음 ${result.prunedCampaigns}개 자동 정리` : '';
                        UIManager.toast(`구매 번호 ${result.removedTickets}개를 삭제했어요${cleanupSuffix}.`, 'success');
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