import { CONFIG } from '../../utils/config.js';
import { UIManager } from '../../core/UIManager.js';
import { normalizeBackupPayload } from '../../utils/backup.js';
import { UI_STRINGS } from '../../utils/strings.js';
export const dataIoImportMethods = {
    async importAll(e) {
        const input = e.currentTarget;
        const file = input.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const normalized = normalizeBackupPayload(json);
            if (!normalized) {
                UIManager.toast(UI_STRINGS.dataio.importUnsupported, 'error', 3500);
                return;
            }

            const incomingFav = this.normalizeItems(normalized.favorites);
            const incomingHist = this.normalizeItems(normalized.history);
            const incomingTheme = normalized.settings?.theme === 'light' ? 'light' : 'dark';
            const incomingProxy = typeof normalized.settings?.customProxy === 'string' ? normalized.settings.customProxy : '';
            const incomingStrategyPrefs = normalized.settings?.strategyPrefs || null;
            const incomingTickets = this.normalizeTicketItems(normalized.ticketBook);
            const incomingCampaigns = this.normalizeCampaignItems(normalized.campaigns);
            const incomingAlertPrefs = this.data.mergeAlertPrefs(normalized.alertPrefs || {});
            const incomingLocalUpdates = this.normalizeLocalUpdates(normalized.localUpdates);
            const incomingStrategyPresets = this.normalizeStrategyPresets(normalized.strategyPresets);
            const importOptions = this.getImportOptionsFromUI();
            const merge = importOptions.mode === 'merge';

            if (merge) {
                const incomingTotal = incomingFav.length
                    + incomingHist.length
                    + incomingTickets.length
                    + incomingCampaigns.length
                    + incomingLocalUpdates.length
                    + incomingStrategyPresets.length;

                const beforeFav = this.data.state.favorites.length;
                const beforeHist = this.data.state.history.length;
                const beforeTickets = this.data.state.ticketBook.length;
                const beforeCampaignIds = new Set(
                    (this.data.state.campaigns || [])
                        .map((item) => String(item?.id || '').trim())
                        .filter(Boolean)
                );
                const beforeUpdates = this.data.getLocalUpdates().length;
                const beforePresets = (this.data.state.strategyPresets || []).length;
                const incomingCampaignIds = new Set(
                    incomingCampaigns
                        .map((item) => String(item?.id || '').trim())
                        .filter(Boolean)
                );

                this.data.state.favorites = this.mergeByNumbers(this.data.state.favorites, incomingFav);
                this.data.state.history = this.mergeByNumbers(this.data.state.history, incomingHist);
                const mergedTickets = this.mergeTickets(this.data.state.ticketBook, incomingTickets);
                const mergedCampaigns = this.mergeCampaigns(this.data.state.campaigns, incomingCampaigns);
                const mergeCampaignCleanup = this.pruneCampaignsWithoutTickets(
                    mergedCampaigns,
                    mergedTickets,
                    incomingCampaignIds
                );
                this.data.state.ticketBook = mergedTickets;
                this.data.state.campaigns = mergeCampaignCleanup.campaigns;
                if (importOptions.applyAlerts) {
                    this.data.state.alertPrefs = this.data.mergeAlertPrefs({
                        ...this.data.state.alertPrefs,
                        ...incomingAlertPrefs
                    });
                }

                const mergedUpdates = this.mergeLocalUpdates(this.data.getLocalUpdates(), incomingLocalUpdates);
                this.data.setLocalUpdates(mergedUpdates);

                this.data.state.strategyPresets = this.mergeStrategyPresets(
                    this.data.state.strategyPresets,
                    incomingStrategyPresets
                );
                if (importOptions.applyTheme) this.data.state.theme = incomingTheme;
                if (importOptions.applyProxy) this.data.state.customProxy = incomingProxy;
                if (importOptions.applyStrategyPrefs && incomingStrategyPrefs) {
                    this.data.state.strategyPrefs = this.data.mergeStrategyPrefs({
                        ...(this.data.state.strategyPrefs || {}),
                        ...(incomingStrategyPrefs || {})
                    });
                }
                if (importOptions.applyProxy) this.syncProxyInput();
                if (importOptions.applyTheme) this.app.applyTheme();

                const newFav = this.data.state.favorites.length - beforeFav;
                const newHist = this.data.state.history.length - beforeHist;
                const newTickets = this.data.state.ticketBook.length - beforeTickets;
                const newCampaigns = (this.data.state.campaigns || []).filter((item) => {
                    const campaignId = String(item?.id || '').trim();
                    return campaignId && !beforeCampaignIds.has(campaignId);
                }).length;
                const newUpdates = mergedUpdates.length - beforeUpdates;
                const newPresets = this.data.state.strategyPresets.length - beforePresets;
                const prunedCampaigns = mergeCampaignCleanup.removed.length;
                const addedTotal = newFav + newHist + newTickets + newCampaigns + newUpdates + newPresets;
                const skippedTotal = prunedCampaigns;
                const duplicateTotal = Math.max(incomingTotal - addedTotal - skippedTotal, 0);
                const appliedSettings = this.describeAppliedSettings(importOptions);

                UIManager.toast(UI_STRINGS.dataio.mergeComplete({
                    added: addedTotal,
                    duplicate: duplicateTotal,
                    skipped: skippedTotal,
                    applied: appliedSettings,
                    cleaned: prunedCampaigns
                }), 'success');
            } else {
                this.data.state.favorites = incomingFav;
                this.data.state.history = incomingHist;
                this.data.state.ticketBook = incomingTickets;
                const overwriteCampaignCleanup = this.pruneCampaignsWithoutTickets(incomingCampaigns, incomingTickets);
                this.data.state.campaigns = overwriteCampaignCleanup.campaigns;
                if (importOptions.applyAlerts) {
                    this.data.state.alertPrefs = incomingAlertPrefs;
                }
                this.data.state.strategyPresets = incomingStrategyPresets;
                if (importOptions.applyTheme) this.data.state.theme = incomingTheme;
                if (importOptions.applyProxy) this.data.state.customProxy = incomingProxy;
                if (importOptions.applyStrategyPrefs && incomingStrategyPrefs) {
                    this.data.state.strategyPrefs = this.data.mergeStrategyPrefs(incomingStrategyPrefs);
                }
                this.data.setLocalUpdates(incomingLocalUpdates);
                if (importOptions.applyProxy) this.syncProxyInput();
                if (importOptions.applyTheme) this.app.applyTheme();
                const appliedSettings = this.describeAppliedSettings(importOptions);
                const prunedCampaigns = overwriteCampaignCleanup.removed.length;
                UIManager.toast(UI_STRINGS.dataio.overwriteComplete({
                    added: incomingFav.length
                        + incomingHist.length
                        + incomingTickets.length
                        + this.data.state.campaigns.length
                        + incomingLocalUpdates.length
                        + incomingStrategyPresets.length,
                    skipped: prunedCampaigns,
                    applied: appliedSettings,
                    cleaned: prunedCampaigns
                }), 'success');
            }

            if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
                this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
            }

            this.data.markAllDirty?.();
            this.data.save(true);
            this.app.renderSettingsPanel?.();
            this.refreshPresetSelectors();
            await this.runPostImportRefresh();
        } catch (err) {
            console.error('Import failed', err);
            UIManager.toast(UI_STRINGS.dataio.importInvalid, 'error', 3500);
        } finally {
            input.value = '';
        }
    }
};
