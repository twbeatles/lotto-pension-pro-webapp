import { endMark, startMark } from '../../../../utils/perf.js';
import { setInputValue } from './helpers.js';
import { renderFavoritesList } from './favorites.js';
import { renderHistoryList } from './history.js';
import { renderTicketsList } from './tickets.js';
import { renderCampaignsList } from './campaigns.js';
import { renderLocalUpdatesSummary } from './localUpdates.js';

export const appDataListRenderMethods = {
    renderDataLists() {
        startMark('data.render');
        setInputValue('#favSearch', this.getDataListState('fav').query);
        setInputValue('#historySearch', this.getDataListState('history').query);
        setInputValue('#ticketSearch', this.getDataListState('ticket').query);
        setInputValue('#campaignSearch', this.getDataListState('campaign').query);

        renderFavoritesList(this);
        renderHistoryList(this);
        renderTicketsList(this);
        renderCampaignsList(this);
        renderLocalUpdatesSummary(this);

        this.renderSettingsPanel();
        endMark('data.render');
    }
};