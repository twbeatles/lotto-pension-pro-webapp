import { $ } from '../utils/utils.js';
import { CONFIG } from '../utils/config.js';
import { UIManager } from '../core/UIManager.js';
import { buildBackupPayload, normalizeBackupPayload } from '../utils/backup.js';

export async function runPostImportRefresh({ data, app } = {}) {
    if (!data || !app) return;
    await data.fetchWinningStats({ notifyTicketSettle: false });
    app.updateLatestWin?.();
    await app.refreshCurrentRoute?.();
    app.renderDataLists?.();
}

export class DataIOModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.bindEvents();
    }

    bindEvents() {
        $('#exportAll')?.addEventListener('click', () => this.exportAll());
        $('#importAllTrigger')?.addEventListener('click', () => $('#importInput')?.click());
        $('#importInput')?.addEventListener('change', (e) => this.importAll(e));
        $('#importMode')?.addEventListener('change', (e) => this.applyImportModeDefaults(String(e.target.value || 'merge')));
        this.applyImportModeDefaults(String($('#importMode')?.value || 'merge'));
    }

    exportAll() {
        const payload = buildBackupPayload(this.data.state, {
            localUpdates: this.data.getLocalUpdates(),
            strategyPresets: this.data.state.strategyPresets || []
        });

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `lotto_backup_v3_${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        UIManager.toast('Backup file (v3) exported.', 'success');
    }

    normalizeItems(items) {
        if (!Array.isArray(items)) return [];
        return items
            .filter((x) => x && Array.isArray(x.numbers))
            .map((x) => ({
                numbers: [...new Set(x.numbers.map(Number).filter((n) => n >= 1 && n <= 45))]
                    .slice(0, 6)
                    .sort((a, b) => a - b),
                date: typeof x.date === 'string' ? x.date : new Date().toISOString()
            }))
            .filter((x) => x.numbers.length === 6);
    }

    normalizeTicketItems(items) {
        if (!Array.isArray(items)) return [];
        return items
            .map((x) => this.data.normalizeTicketEntry(x))
            .filter(Boolean)
            .map((x) => ({
                ...x,
                source: ['generator', 'ai', 'import'].includes(x.source) ? x.source : 'import'
            }));
    }

    normalizeCampaignItems(items) {
        if (!Array.isArray(items)) return [];
        return items.map((x) => this.data.normalizeCampaignEntry(x)).filter(Boolean);
    }

    normalizeLocalUpdates(items) {
        if (!Array.isArray(items)) return [];
        return items
            .map((x) => this.data.normalizeDrawItem(x))
            .filter(Boolean);
    }

    normalizeStrategyPresets(items) {
        return this.data.mergeStrategyPresets(items || []);
    }

    mergeByNumbers(existing, incoming) {
        const seen = new Set(existing.map((x) => x.numbers.join(',')));
        const merged = [...existing];
        incoming.forEach((x) => {
            const key = x.numbers.join(',');
            if (seen.has(key)) return;
            seen.add(key);
            merged.unshift(x);
        });
        return merged;
    }

    mergeTickets(existing, incoming) {
        const merged = [...existing];
        const seen = new Set(existing.map((x) => this.data.buildTicketKey(x)));
        incoming.forEach((x) => {
            const key = this.data.buildTicketKey(x);
            if (seen.has(key)) return;
            seen.add(key);
            merged.unshift(x);
        });
        return merged;
    }

    mergeLocalUpdates(existing, incoming) {
        const map = new Map();
        (existing || []).forEach((item) => {
            if (!item) return;
            map.set(Number(item.draw_no), item);
        });
        (incoming || []).forEach((item) => {
            if (!item) return;
            map.set(Number(item.draw_no), item);
        });
        return Array.from(map.values())
            .filter((x) => Number.isFinite(Number(x?.draw_no)))
            .sort((a, b) => Number(a.draw_no) - Number(b.draw_no));
    }

    mergeCampaigns(existing, incoming) {
        return [...incoming, ...existing]
            .filter((x, idx, arr) => arr.findIndex((y) => y.id === x.id) === idx);
    }

    mergeStrategyPresets(existing, incoming) {
        return this.data.mergeStrategyPresets([...(existing || []), ...(incoming || [])]);
    }

    syncProxyInput() {
        const proxyInput = $('#customProxyUrl');
        if (!proxyInput) return;
        proxyInput.value = this.data.state.customProxy || '';
    }

    applyImportModeDefaults(mode = 'merge') {
        const applyTheme = $('#importApplyTheme');
        const applyProxy = $('#importApplyProxy');
        const applyStrategyPrefs = $('#importApplyStrategyPrefs');
        if (!applyTheme || !applyProxy || !applyStrategyPrefs) return;

        const isOverwrite = mode === 'overwrite';
        applyTheme.checked = isOverwrite;
        applyProxy.checked = isOverwrite;
        applyStrategyPrefs.checked = isOverwrite;
    }

    getImportOptionsFromUI() {
        const modeRaw = String($('#importMode')?.value || 'merge').toLowerCase();
        const mode = modeRaw === 'overwrite' ? 'overwrite' : 'merge';
        return {
            mode,
            applyTheme: Boolean($('#importApplyTheme')?.checked),
            applyProxy: Boolean($('#importApplyProxy')?.checked),
            applyStrategyPrefs: Boolean($('#importApplyStrategyPrefs')?.checked)
        };
    }

    async runPostImportRefresh() {
        await runPostImportRefresh({ data: this.data, app: this.app });
    }

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

            const version = Number(normalized.version || 1);
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
                this.data.state.alertPrefs = this.data.mergeAlertPrefs({
                    ...this.data.state.alertPrefs,
                    ...incomingAlertPrefs
                });

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

                UIManager.toast(
                    `Merge complete (added:${addedTotal}, duplicate:${duplicateTotal}, skipped:${skippedTotal})` +
                    (importOptions.applyTheme || importOptions.applyProxy || importOptions.applyStrategyPrefs ? ', settings applied' : ''),
                    'success'
                );
            } else {
                this.data.state.favorites = incomingFav;
                this.data.state.history = incomingHist;
                this.data.state.ticketBook = incomingTickets;
                this.data.state.campaigns = incomingCampaigns;
                this.data.state.alertPrefs = incomingAlertPrefs;
                this.data.state.strategyPresets = incomingStrategyPresets;
                if (importOptions.applyTheme) this.data.state.theme = incomingTheme;
                if (importOptions.applyProxy) this.data.state.customProxy = incomingProxy;
                if (importOptions.applyStrategyPrefs && incomingStrategyPrefs) {
                    this.data.state.strategyPrefs = this.data.mergeStrategyPrefs(incomingStrategyPrefs);
                }
                this.data.setLocalUpdates(incomingLocalUpdates);
                if (importOptions.applyProxy) this.syncProxyInput();
                if (importOptions.applyTheme) this.app.applyTheme();
                UIManager.toast(
                    `Overwrite complete (added:${incomingFav.length + incomingHist.length + incomingTickets.length + incomingCampaigns.length + incomingLocalUpdates.length + incomingStrategyPresets.length}, duplicate:0, skipped:0)`,
                    'success'
                );
            }

            if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
                this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
            }

            this.data.markAllDirty?.();
            this.data.save(true);
            await this.runPostImportRefresh();
        } catch (err) {
            console.error('Import failed', err);
            UIManager.toast('Import failed: invalid backup file.', 'error', 3500);
        } finally {
            input.value = '';
        }
    }
}
