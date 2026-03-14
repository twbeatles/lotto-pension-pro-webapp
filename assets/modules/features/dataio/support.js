import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { buildBackupPayload } from '../../utils/backup.js';
import { runPostImportRefresh } from './postImportRefresh.js';
export const dataIoSupportMethods = {
    bindEvents() {
        $('#exportAll')?.addEventListener('click', () => this.exportAll());
        $('#importAllTrigger')?.addEventListener('click', () => $('#importInput')?.click());
        $('#importInput')?.addEventListener('change', (e) => this.importAll(e));
        $('#importMode')?.addEventListener('change', (e) => this.applyImportModeDefaults(String(e.target.value || 'merge')));
        this.applyImportModeDefaults(String($('#importMode')?.value || 'merge'));
    },

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
    },

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
    },

    normalizeTicketItems(items) {
        if (!Array.isArray(items)) return [];
        return items
            .map((x) => this.data.normalizeTicketEntry(x))
            .filter(Boolean)
            .map((x) => ({
                ...x,
                source: ['generator', 'ai', 'import'].includes(x.source) ? x.source : 'import'
            }));
    },

    normalizeCampaignItems(items) {
        if (!Array.isArray(items)) return [];
        return items.map((x) => this.data.normalizeCampaignEntry(x)).filter(Boolean);
    },

    normalizeLocalUpdates(items) {
        if (!Array.isArray(items)) return [];
        return items
            .map((x) => this.data.normalizeDrawItem(x))
            .filter(Boolean);
    },

    normalizeStrategyPresets(items) {
        return this.data.mergeStrategyPresets(items || []);
    },

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
    },

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
    },

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
    },

    mergeCampaigns(existing, incoming) {
        return [...incoming, ...existing]
            .filter((x, idx, arr) => arr.findIndex((y) => y.id === x.id) === idx);
    },

    mergeStrategyPresets(existing, incoming) {
        return this.data.mergeStrategyPresets([...(existing || []), ...(incoming || [])]);
    },

    syncProxyInput() {
        this.app.renderSettingsPanel?.();
    },

    applyImportModeDefaults(mode = 'merge') {
        const applyTheme = $('#importApplyTheme');
        const applyProxy = $('#importApplyProxy');
        const applyStrategyPrefs = $('#importApplyStrategyPrefs');
        const applyAlerts = $('#importApplyAlerts');
        if (!applyTheme || !applyProxy || !applyStrategyPrefs || !applyAlerts) return;

        const isOverwrite = mode === 'overwrite';
        applyTheme.checked = isOverwrite;
        applyProxy.checked = isOverwrite;
        applyStrategyPrefs.checked = isOverwrite;
        applyAlerts.checked = isOverwrite;
    },

    getImportOptionsFromUI() {
        const modeRaw = String($('#importMode')?.value || 'merge').toLowerCase();
        const mode = modeRaw === 'overwrite' ? 'overwrite' : 'merge';
        return {
            mode,
            applyTheme: Boolean($('#importApplyTheme')?.checked),
            applyProxy: Boolean($('#importApplyProxy')?.checked),
            applyStrategyPrefs: Boolean($('#importApplyStrategyPrefs')?.checked),
            applyAlerts: Boolean($('#importApplyAlerts')?.checked)
        };
    },

    describeAppliedSettings(importOptions = {}) {
        const labels = [];
        if (importOptions.applyTheme) labels.push('테마');
        if (importOptions.applyProxy) labels.push('프록시');
        if (importOptions.applyStrategyPrefs) labels.push('전략 설정');
        if (importOptions.applyAlerts) labels.push('알림 설정');
        return labels;
    },

    async runPostImportRefresh() {
        await runPostImportRefresh({ data: this.data, app: this.app });
    },

    refreshPresetSelectors() {
        this.app.generator?.presetController?.render();
        this.app.ai?.presetController?.render();
        this.app.backtest?.presetController?.render();
    }
};
