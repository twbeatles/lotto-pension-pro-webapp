import { CONFIG } from '../../utils/config.js';
import { UIManager } from '../../core/UIManager.js';
import { normalizeBackupPayload } from '../../utils/backup.js';
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
                UIManager.toast('Import failed: unsupported backup format.', 'error', 3500);
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
                const beforeCampaigns = this.data.state.campaigns.length;
                const beforeUpdates = this.data.getLocalUpdates().length;
                const beforePresets = (this.data.state.strategyPresets || []).length;

                this.data.state.favorites = this.mergeByNumbers(this.data.state.favorites, incomingFav);
                this.data.state.history = this.mergeByNumbers(this.data.state.history, incomingHist);
                this.data.state.ticketBook = this.mergeTickets(this.data.state.ticketBook, incomingTickets);
                this.data.state.campaigns = this.mergeCampaigns(this.data.state.campaigns, incomingCampaigns);
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
                const newCampaigns = this.data.state.campaigns.length - beforeCampaigns;
                const newUpdates = mergedUpdates.length - beforeUpdates;
                const newPresets = this.data.state.strategyPresets.length - beforePresets;
                const addedTotal = newFav + newHist + newTickets + newCampaigns + newUpdates + newPresets;
                const duplicateTotal = Math.max(incomingTotal - addedTotal, 0);
                const skippedTotal = 0;
                const appliedSettings = this.describeAppliedSettings(importOptions);

                UIManager.toast(
                    `Merge complete (added:${addedTotal}, duplicate:${duplicateTotal}, skipped:${skippedTotal})` +
                    (appliedSettings.length ? `, applied:${appliedSettings.join('/')}` : ''),
                    'success'
                );
            } else {
                this.data.state.favorites = incomingFav;
                this.data.state.history = incomingHist;
                this.data.state.ticketBook = incomingTickets;
                this.data.state.campaigns = incomingCampaigns;
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
                UIManager.toast(
                    `Overwrite complete (added:${incomingFav.length + incomingHist.length + incomingTickets.length + incomingCampaigns.length + incomingLocalUpdates.length + incomingStrategyPresets.length}, duplicate:0, skipped:0)` +
                    (appliedSettings.length ? `, applied:${appliedSettings.join('/')}` : ''),
                    'success'
                );
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
            UIManager.toast('Import failed: invalid backup file.', 'error', 3500);
        } finally {
            input.value = '';
        }
    }
};
