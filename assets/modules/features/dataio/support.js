import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { buildBackupPayload } from '../../utils/backup.js';
import { runPostImportRefresh } from './postImportRefresh.js';
import { UI_STRINGS } from '../../utils/strings.js';
export const dataIoSupportMethods = {
    bindEvents() {
        $('#exportAll')?.addEventListener('click', () => this.exportAll());
        $('#importAllTrigger')?.addEventListener('click', () => $('#importInput')?.click());
        $('#importInput')?.addEventListener('change', (e) => this.importAll(e));
        $('#importMode')?.addEventListener('change', (e) =>
            this.applyImportModeDefaults(String(e.target.value || 'merge'))
        );
        this.applyImportModeDefaults(String($('#importMode')?.value || 'merge'));
        this.renderDataStatusSummary();
    },

    renderDataStatusSummary() {
        const container = $('#dataStatusSummary');
        if (!container) return;
        container.replaceChildren();

        const freshness = this.data.getDataFreshness?.() || {};
        const pensionHealth = this.data.mergePension720DataHealth?.(
            this.data.pension720DataHealth || this.data.getDefaultPension720DataHealth?.()
        );
        const pensionLatest = this.data.state.pension720Stats?.[0] || null;
        const syncMeta = this.data.state.syncMeta || this.data.getDefaultSyncMeta?.() || {};
        const localUpdates = this.data.getLocalUpdates?.() || [];
        const storageSummary = this.data.getStorageSummary?.() || { counts: {} };

        const makeCard = (title, rows = [], status = '') => {
            const card = document.createElement('div');
            card.className = 'data-status-card';
            const head = document.createElement('div');
            head.className = 'data-status-head';
            const titleEl = document.createElement('strong');
            titleEl.textContent = title;
            head.appendChild(titleEl);
            if (status) {
                const badge = document.createElement('span');
                badge.className = 'badge status-badge';
                badge.textContent = status;
                head.appendChild(badge);
            }
            card.appendChild(head);
            rows.forEach(([label, value]) => {
                const row = document.createElement('div');
                row.className = 'data-status-row';
                const labelEl = document.createElement('span');
                labelEl.textContent = label;
                const valueEl = document.createElement('b');
                valueEl.textContent = value || '-';
                row.append(labelEl, valueEl);
                card.appendChild(row);
            });
            return card;
        };

        container.append(
            makeCard(
                '로또 6/45',
                [
                    ['source', this.data.getDataHealthSourceLabel?.(freshness.source) || freshness.source || '-'],
                    ['최신 회차', freshness.latestDrawNo ? `${freshness.latestDrawNo}회` : '-'],
                    ['예상 최신', freshness.estimatedLatestDrawNo ? `${freshness.estimatedLatestDrawNo}회` : '-'],
                    ['local update', `${localUpdates.length}건`],
                    ['마지막 성공', syncMeta.lastSuccessAt ? this.app.formatDateTime(syncMeta.lastSuccessAt) : '-'],
                    ['메시지', freshness.dataHealthMessage || syncMeta.lastFailureMessage || '-']
                ],
                freshness.availability === 'full' ? '정상' : '확인 필요'
            ),
            makeCard(
                '연금복권720+',
                [
                    ['source', this.data.getPension720DataHealthSourceLabel?.(pensionHealth?.source) || pensionHealth?.source || '-'],
                    ['최신 회차', pensionLatest ? `${pensionLatest.draw_no}회` : '-'],
                    ['최신 번호', pensionLatest ? `${pensionLatest.group}조 ${pensionLatest.number}` : '-'],
                    ['저장 번호', `${storageSummary.counts?.pension720Tickets || 0}개`],
                    ['마지막 확인', pensionHealth?.updatedAt ? this.app.formatDateTime(pensionHealth.updatedAt) : '-'],
                    ['메시지', pensionHealth?.message || '-']
                ],
                pensionHealth?.availability === 'full' ? '정상' : '확인 필요'
            )
        );
    },

    exportAll(options = {}) {
        const payload = buildBackupPayload(this.data.state, {
            localUpdates: this.data.getLocalUpdates(),
            strategyPresets: this.data.state.strategyPresets || []
        });

        const json = JSON.stringify(payload, null, 2);
        if (
            typeof document === 'undefined' ||
            typeof document.createElement !== 'function' ||
            typeof Blob === 'undefined' ||
            typeof URL === 'undefined' ||
            typeof URL.createObjectURL !== 'function'
        ) {
            return {
                filename: '',
                payload,
                downloaded: false
            };
        }
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        const prefix = String(options.prefix || 'lotto_pension_pro_backup_v4').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `${prefix}_${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        if (!options.silent) UIManager.toast(UI_STRINGS.dataio.backupExported, 'success');
        return {
            filename: a.download,
            payload,
            downloaded: true
        };
    },

    ensureBackupBeforeDestructive(options = {}) {
        const result = this.exportAll({
            silent: true,
            prefix: options.prefix || 'lotto_pension_pro_before_change'
        });
        if (result?.downloaded) return result;
        UIManager.toast(
            options.errorMessage || '백업 파일 다운로드를 확인할 수 없어 작업을 중단했습니다.',
            'error',
            4500
        );
        return null;
    },

    normalizeItems(items) {
        if (!Array.isArray(items)) return [];
        return items.map((x) => this.data.normalizeStoredNumberEntry(x)).filter(Boolean);
    },

    normalizeTicketItems(items) {
        if (!Array.isArray(items)) return [];
        const normalized = items
            .map((x) => this.data.normalizeTicketEntry(x))
            .filter(Boolean)
            .map((x) => ({
                ...x,
                source: ['generator', 'ai', 'import'].includes(x.source) ? x.source : 'import'
            }));
        return this.data.mergeTicketEntries([], normalized);
    },

    normalizeCampaignItems(items) {
        if (!Array.isArray(items)) return [];
        return items.map((x) => this.data.normalizeCampaignEntry(x)).filter(Boolean);
    },

    normalizePension720TicketItems(items) {
        return this.data.mergePension720Tickets([], Array.isArray(items) ? items : []);
    },

    normalizeLocalUpdates(items) {
        return this.data.sanitizeLocalUpdates(items);
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

    mergeHistoryEntries(existing, incoming) {
        return this.data.mergeHistoryEntries(existing, incoming);
    },

    mergeTickets(existing, incoming) {
        return this.data.mergeTicketEntries(existing, incoming);
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
        return [...incoming, ...existing].filter((x, idx, arr) => arr.findIndex((y) => y.id === x.id) === idx);
    },

    mergePension720Tickets(existing, incoming) {
        return this.data.mergePension720Tickets(existing, incoming);
    },

    pruneCampaignsWithoutTickets(campaigns = [], tickets = [], targetCampaignIds = null) {
        const targetIds =
            targetCampaignIds instanceof Set
                ? targetCampaignIds
                : new Set((targetCampaignIds || []).map((item) => String(item || '').trim()).filter(Boolean));
        const limitToTargets = targetIds.size > 0;
        const linkedCampaignIds = new Set(
            (tickets || []).map((ticket) => String(ticket?.campaignId || '').trim()).filter(Boolean)
        );

        const kept = [];
        const removed = [];

        (campaigns || []).forEach((campaign) => {
            const campaignId = String(campaign?.id || '').trim();
            const shouldValidate = !limitToTargets || targetIds.has(campaignId);
            if (shouldValidate && (!campaignId || !linkedCampaignIds.has(campaignId))) {
                removed.push(campaign);
                return;
            }
            kept.push(campaign);
        });

        return {
            campaigns: kept,
            removed
        };
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
        if (importOptions.applyProxy) labels.push('데이터 연결 주소');
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
