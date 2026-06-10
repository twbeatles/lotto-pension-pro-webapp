import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { StrategyPresetController } from '../../utils/strategyPresets.js';
import { formatTicket } from './dom.js';
import { pension720CampaignMethods } from './campaigns.js';
import { pension720CheckMethods } from './checks.js';
import { pension720OptionMethods } from './options.js';
import { pension720RecommendationMethods } from './recommendations.js';
import { pension720StatsMethods } from './stats.js';
import { pension720TicketMethods } from './tickets.js';

export class Pension720Module {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.lastRecommendations = Array.isArray(app.data.state.pension720Results)
            ? app.data.state.pension720Results
            : [];
        this.lastRecommendationOptions = null;
        this.isRecommending = false;
        this.isGeneratingCampaign = false;
        this.recommendationToken = 0;
        this.campaignToken = 0;
        this.recommendBtnOriginalText = '';
        this.bound = false;
        this.bindEvents();
        this.populateStrategySelect();
        this.applySavedStrategyPrefs();
        this.presetController = new StrategyPresetController({
            data: this.data,
            scope: 'pension720',
            selectId: 'pension720PresetSelect',
            loadBtnId: 'pension720PresetLoadBtn',
            saveBtnId: 'pension720PresetSaveBtn',
            deleteBtnId: 'pension720PresetDeleteBtn',
            getRequest: () => this.getStrategyRequestFromUI(),
            applyRequest: (request) => this.applyStrategyRequest(request)
        });
    }

    bindEvents() {
        if (this.bound) return;
        $('#pension720RefreshBtn')?.addEventListener('click', () => this.refreshData());
        $('#pension720RecommendBtn')?.addEventListener('click', () => this.runRecommendation());
        $('#pension720ResetOptionsBtn')?.addEventListener('click', () => this.resetRecommendationOptions());
        $('#pension720CampaignBtn')?.addEventListener('click', () => this.runCampaignRecommendation());
        $('#pension720CampaignResetBtn')?.addEventListener('click', () => this.resetCampaignOptions());
        $('#pension720ClearTicketsBtn')?.addEventListener('click', () => this.clearSavedTickets());
        $('#pension720CopyAllBtn')?.addEventListener('click', () => this.copySavedTickets());
        $('#pension720ExportCsvBtn')?.addEventListener('click', () => this.exportSavedTicketsCsv());
        $('#pension720CheckLatestBtn')?.addEventListener('click', () => this.runLatestCheck());
        $('#pension720ShowExperimental')?.addEventListener('change', () => this.populateStrategySelect());
        $('#pension720AnalysisPreset')?.addEventListener('change', (event) => {
            if (event.currentTarget.value === 'custom') return;
            this.applyAnalysisPreset(event.currentTarget.value);
        });
        ['#pension720LookbackWindow', '#pension720CandidatePoolSize'].forEach((selector) => {
            $(selector)?.addEventListener('input', () => this.syncAnalysisPresetSelect());
        });

        $('#pension720Output')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-p720-action]');
            if (!button) return;
            const index = Number(button.dataset.index);
            const recommendation = this.lastRecommendations[index];
            if (!recommendation) return;
            if (button.dataset.p720Action === 'save') {
                this.saveRecommendation(recommendation, recommendation.group);
            } else if (button.dataset.p720Action === 'save-expansion') {
                this.saveExpansion(recommendation);
            }
        });

        $('#pension720SavedList')?.addEventListener('click', (event) => {
            const copyButton = event.target.closest('[data-p720-copy]');
            if (copyButton) {
                const ticket = this.findSavedTicket(copyButton.dataset.p720Copy);
                if (ticket) UIManager.copyText(formatTicket(ticket));
                return;
            }
            const button = event.target.closest('[data-p720-delete]');
            if (!button) return;
            const removed = this.data.removePension720Ticket(button.dataset.p720Delete);
            if (removed) {
                UIManager.toast('연금복권 번호를 삭제했습니다.', 'success');
                this.renderSavedTickets();
                this.renderCampaigns();
                if (!(this.data.state.pension720Tickets || []).length) this.renderCheckPlaceholder(true);
            }
        });

        this.bound = true;
    }
}

Object.assign(
    Pension720Module.prototype,
    pension720OptionMethods,
    pension720StatsMethods,
    pension720RecommendationMethods,
    pension720CampaignMethods,
    pension720TicketMethods,
    pension720CheckMethods
);
