import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { clearElement, makeEl } from '../dom.js';

export const pension720CampaignRenderMethods = {
    renderCampaigns() {
        const list = $('#pension720CampaignList');
        const summary = $('#pension720CampaignSummary');
        const campaigns = this.data.state.pension720Campaigns || [];
        clearElement(list);
        if (summary) summary.textContent = `${campaigns.length}개 캠페인`;
        if (!list) return;

        if (!campaigns.length) {
            list.appendChild(makeEl('p', 'empty-state', '생성한 연금복권 캠페인이 없습니다.'));
            return;
        }

        campaigns.forEach((campaign) => {
            const row = makeEl('div', 'p720-saved-row');
            const main = makeEl('div', 'p720-saved-main');
            const ticketCount = this.data.countPension720TicketsByCampaignId(campaign.id);
            main.appendChild(makeEl('strong', '', campaign.name));
            main.appendChild(
                makeEl(
                    'span',
                    'result-meta',
                    `${campaign.startDrawNo}회부터 ${campaign.weeks}회 · 회차당 ${campaign.setsPerDraw}개 · 저장 ${ticketCount}개`
                )
            );
            row.appendChild(main);
            const del = makeEl('button', 'btn ghost sm', '삭제');
            del.type = 'button';
            del.addEventListener('click', async () => {
                const confirmed = await UIManager.confirm({
                    title: '연금복권 캠페인 삭제',
                    message: `'${campaign.name}' 캠페인과 연결 저장 번호 ${ticketCount}개를 삭제합니다.`,
                    confirmText: '삭제',
                    cancelText: '취소'
                });
                if (!confirmed) return;
                const result = this.data.removePension720Campaign(campaign.id, { cascadeTickets: true });
                if (result.removedCampaign) {
                    UIManager.toast(
                        `연금복권 캠페인 1개, 연결 번호 ${result.removedTickets}개를 삭제했습니다.`,
                        'success'
                    );
                    this.renderSavedTickets();
                    this.renderCampaigns();
                    this.renderCheckPlaceholder(true);
                }
            });
            row.appendChild(del);
            list.appendChild(row);
        });
    }
};