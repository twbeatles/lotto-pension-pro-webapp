import { CONFIG } from '../../utils/config.js';
import { UIManager } from '../../core/UIManager.js';
import { normalizeBackupPayload } from '../../utils/backup.js';
import { UI_STRINGS } from '../../utils/strings.js';

function safeClone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function countStoredItems({
    favorites = [],
    history = [],
    ticketTotal = 0,
    campaigns = [],
    pension720Tickets = [],
    pension720Campaigns = [],
    localUpdates = [],
    presets = []
}) {
    return (
        favorites.length +
        history.length +
        ticketTotal +
        campaigns.length +
        pension720Tickets.length +
        pension720Campaigns.length +
        localUpdates.length +
        presets.length
    );
}

export const dataIoImportMethods = {
    normalizeImportPayload(normalized) {
        const incomingLocalUpdateResult = this.normalizeLocalUpdates(normalized.localUpdates);
        return {
            favorites: this.normalizeItems(normalized.favorites),
            history: this.normalizeItems(normalized.history),
            theme: normalized.settings?.theme === 'light' ? 'light' : 'dark',
            proxy: typeof normalized.settings?.customProxy === 'string' ? normalized.settings.customProxy : '',
            strategyPrefs: normalized.settings?.strategyPrefs || null,
            tickets: this.normalizeTicketItems(normalized.ticketBook),
            campaigns: this.normalizeCampaignItems(normalized.campaigns),
            pension720Tickets: this.normalizePension720TicketItems(normalized.pension720Tickets),
            pension720Campaigns: this.normalizePension720CampaignItems(normalized.pension720Campaigns),
            alertPrefs: this.data.mergeAlertPrefs(normalized.alertPrefs || {}),
            localUpdates: incomingLocalUpdateResult.items,
            futureDropped: incomingLocalUpdateResult.droppedFuture,
            strategyPresets: this.normalizeStrategyPresets(normalized.strategyPresets)
        };
    },

    buildImportPreview(incoming, importOptions) {
        const merge = importOptions.mode === 'merge';
        const current = this.data.state;
        const incomingTicketTotal = this.data.getTotalTicketCount(incoming.tickets);
        const appliedSettings = this.describeAppliedSettings(importOptions);
        const before = {
            favorites: current.favorites?.length || 0,
            history: current.history?.length || 0,
            ticketTotal: this.data.getTotalTicketCount(),
            campaigns: current.campaigns?.length || 0,
            pension720Tickets: current.pension720Tickets?.length || 0,
            pension720Campaigns: current.pension720Campaigns?.length || 0,
            localUpdates: this.data.getLocalUpdates().length,
            presets: current.strategyPresets?.length || 0
        };
        const incomingTotal = countStoredItems({
            favorites: incoming.favorites,
            history: incoming.history,
            ticketTotal: incomingTicketTotal,
            campaigns: incoming.campaigns,
            pension720Tickets: incoming.pension720Tickets,
            pension720Campaigns: incoming.pension720Campaigns,
            localUpdates: incoming.localUpdates,
            presets: incoming.strategyPresets
        });

        if (merge) {
            const beforeCampaignIds = new Set(
                (current.campaigns || []).map((item) => String(item?.id || '').trim()).filter(Boolean)
            );
            const incomingCampaignIds = new Set(
                incoming.campaigns.map((item) => String(item?.id || '').trim()).filter(Boolean)
            );
            const beforePension720CampaignIds = new Set(
                (current.pension720Campaigns || []).map((item) => String(item?.id || '').trim()).filter(Boolean)
            );
            const incomingPension720CampaignIds = new Set(
                incoming.pension720Campaigns.map((item) => String(item?.id || '').trim()).filter(Boolean)
            );
            const nextFavorites = this.mergeByNumbers(
                safeClone(current.favorites || []),
                safeClone(incoming.favorites)
            );
            const nextHistory = this.mergeHistoryEntries(safeClone(current.history || []), safeClone(incoming.history));
            const nextTickets = this.mergeTickets(safeClone(current.ticketBook || []), safeClone(incoming.tickets));
            const rawCampaigns = this.mergeCampaigns(safeClone(current.campaigns || []), safeClone(incoming.campaigns));
            const campaignCleanup = this.pruneCampaignsWithoutTickets(rawCampaigns, nextTickets, incomingCampaignIds);
            const nextPension720Tickets = this.mergePension720Tickets(
                safeClone(current.pension720Tickets || []),
                safeClone(incoming.pension720Tickets)
            );
            const rawPension720Campaigns = this.mergePension720Campaigns(
                safeClone(current.pension720Campaigns || []),
                safeClone(incoming.pension720Campaigns)
            );
            const pension720CampaignCleanup = this.prunePension720CampaignsWithoutTickets(
                rawPension720Campaigns,
                nextPension720Tickets,
                incomingPension720CampaignIds
            );
            const mergedLocalUpdates = this.mergeLocalUpdates(
                safeClone(this.data.getLocalUpdates({ warningMode: 'manual' })),
                safeClone(incoming.localUpdates)
            );
            const localUpdateResult = this.normalizeLocalUpdates(mergedLocalUpdates);
            const nextPresets = this.mergeStrategyPresets(
                safeClone(current.strategyPresets || []),
                safeClone(incoming.strategyPresets)
            );
            const newCampaigns = campaignCleanup.campaigns.filter((item) => {
                const campaignId = String(item?.id || '').trim();
                return campaignId && !beforeCampaignIds.has(campaignId);
            }).length;
            const newPension720Campaigns = pension720CampaignCleanup.campaigns.filter((item) => {
                const campaignId = String(item?.id || '').trim();
                return campaignId && !beforePension720CampaignIds.has(campaignId);
            }).length;
            const added =
                nextFavorites.length -
                before.favorites +
                (nextHistory.length - before.history) +
                (this.data.getTotalTicketCount(nextTickets) - before.ticketTotal) +
                newCampaigns +
                (nextPension720Tickets.length - before.pension720Tickets) +
                newPension720Campaigns +
                (localUpdateResult.items.length - before.localUpdates) +
                (nextPresets.length - before.presets);
            const cleaned = campaignCleanup.removed.length + pension720CampaignCleanup.removed.length;
            const skipped = cleaned;
            const duplicate = Math.max(incomingTotal - added - skipped, 0);

            return {
                mode: 'merge',
                incoming,
                importOptions,
                preview: {
                    added,
                    duplicate,
                    skipped,
                    cleaned,
                    futureDropped: incoming.futureDropped,
                    appliedSettings,
                    projectedTicketTotal: this.data.getTotalTicketCount(nextTickets)
                },
                next: {
                    favorites: nextFavorites,
                    history: nextHistory,
                    tickets: nextTickets,
                    campaigns: campaignCleanup.campaigns,
                    pension720Tickets: nextPension720Tickets,
                    pension720Campaigns: pension720CampaignCleanup.campaigns,
                    localUpdates: localUpdateResult.items,
                    strategyPresets: nextPresets,
                    alertPrefs: importOptions.applyAlerts
                        ? this.data.mergeAlertPrefs({
                              ...(current.alertPrefs || {}),
                              ...incoming.alertPrefs
                          })
                        : current.alertPrefs,
                    theme: importOptions.applyTheme ? incoming.theme : current.theme,
                    proxy: importOptions.applyProxy ? incoming.proxy : current.customProxy,
                    strategyPrefs:
                        importOptions.applyStrategyPrefs && incoming.strategyPrefs
                            ? this.data.mergeStrategyPrefs({
                                  ...(current.strategyPrefs || {}),
                                  ...(incoming.strategyPrefs || {})
                              })
                            : current.strategyPrefs
                }
            };
        }

        const campaignCleanup = this.pruneCampaignsWithoutTickets(
            safeClone(incoming.campaigns),
            safeClone(incoming.tickets)
        );
        const pension720CampaignCleanup = this.prunePension720CampaignsWithoutTickets(
            safeClone(incoming.pension720Campaigns),
            safeClone(incoming.pension720Tickets)
        );
        const added = countStoredItems({
            favorites: incoming.favorites,
            history: incoming.history,
            ticketTotal: incomingTicketTotal,
            campaigns: campaignCleanup.campaigns,
            pension720Tickets: incoming.pension720Tickets,
            pension720Campaigns: pension720CampaignCleanup.campaigns,
            localUpdates: incoming.localUpdates,
            presets: incoming.strategyPresets
        });
        const cleaned = campaignCleanup.removed.length + pension720CampaignCleanup.removed.length;

        return {
            mode: 'overwrite',
            incoming,
            importOptions,
            preview: {
                added,
                duplicate: 0,
                skipped: cleaned,
                cleaned,
                futureDropped: incoming.futureDropped,
                appliedSettings,
                projectedTicketTotal: incomingTicketTotal
            },
            next: {
                favorites: incoming.favorites,
                history: incoming.history,
                tickets: incoming.tickets,
                campaigns: campaignCleanup.campaigns,
                pension720Tickets: incoming.pension720Tickets,
                pension720Campaigns: pension720CampaignCleanup.campaigns,
                localUpdates: incoming.localUpdates,
                strategyPresets: incoming.strategyPresets,
                alertPrefs: importOptions.applyAlerts ? incoming.alertPrefs : current.alertPrefs,
                theme: importOptions.applyTheme ? incoming.theme : current.theme,
                proxy: importOptions.applyProxy ? incoming.proxy : current.customProxy,
                strategyPrefs:
                    importOptions.applyStrategyPrefs && incoming.strategyPrefs
                        ? this.data.mergeStrategyPrefs(incoming.strategyPrefs)
                        : current.strategyPrefs
            }
        };
    },

    buildImportPreviewMessage(prepared) {
        const modeLabel = prepared.mode === 'overwrite' ? '바꾸기' : '합치기';
        const applied = prepared.preview.appliedSettings.length ? prepared.preview.appliedSettings.join(', ') : '없음';
        return [
            `${modeLabel} 가져오기를 진행할까요?`,
            '',
            `추가/반영: ${prepared.preview.added}건`,
            `중복: ${prepared.preview.duplicate}건`,
            `건너뜀: ${prepared.preview.skipped}건`,
            `정리될 캠페인: ${prepared.preview.cleaned}개`,
            `예상 연금복권 저장 수: ${prepared.next.pension720Tickets?.length || 0}개`,
            `예상 연금복권 캠페인: ${prepared.next.pension720Campaigns?.length || 0}개`,
            `적용될 설정: ${applied}`,
            `미래 회차 제외: ${prepared.preview.futureDropped}건`,
            `예상 내 번호 수: ${prepared.preview.projectedTicketTotal}개`,
            prepared.mode === 'overwrite' ? '현재 데이터는 자동 백업 파일로 먼저 저장됩니다.' : ''
        ]
            .filter((line) => line !== '')
            .join('\n');
    },

    async confirmPreparedImport(prepared) {
        if (typeof document === 'undefined' || typeof UIManager.confirm !== 'function') return true;
        return UIManager.confirm({
            title: '백업 파일 가져오기 확인',
            message: this.buildImportPreviewMessage(prepared),
            confirmText: prepared.mode === 'overwrite' ? '바꾸기 실행' : '합치기 실행'
        });
    },

    applyPreparedImport(prepared) {
        const next = prepared.next;
        this.data.state.favorites = next.favorites;
        this.data.state.history = next.history;
        this.data.state.ticketBook = next.tickets;
        this.data.state.campaigns = next.campaigns;
        this.data.state.pension720Tickets = next.pension720Tickets;
        this.data.state.pension720Campaigns = next.pension720Campaigns;
        this.data.state.strategyPresets = next.strategyPresets;
        this.data.state.alertPrefs = next.alertPrefs;
        this.data.state.theme = next.theme;
        this.data.state.customProxy = next.proxy;
        this.data.state.strategyPrefs = next.strategyPrefs;
        this.data.setLocalUpdates(next.localUpdates, { warningMode: 'manual' });

        if (prepared.importOptions.applyProxy) this.syncProxyInput();
        if (prepared.importOptions.applyTheme) this.app?.applyTheme?.();
    },

    async importAll(e) {
        const input = e.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        if (Number(file.size || 0) > CONFIG.LIMITS.MAX_IMPORT_BYTES) {
            UIManager.toast(
                `백업 파일은 최대 ${(CONFIG.LIMITS.MAX_IMPORT_BYTES / (1024 * 1024)).toFixed(1)}MB까지 가져올 수 있습니다.`,
                'error',
                3500
            );
            input.value = '';
            return;
        }

        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const normalized = normalizeBackupPayload(json);
            if (!normalized) {
                UIManager.toast(UI_STRINGS.dataio.importUnsupported, 'error', 3500);
                return;
            }

            const incoming = this.normalizeImportPayload(normalized);
            const importOptions = this.getImportOptionsFromUI();
            const prepared = this.buildImportPreview(incoming, importOptions);
            if (prepared.preview.projectedTicketTotal > CONFIG.LIMITS.MAX_IMPORT_TICKETS) {
                UIManager.toast(
                    `내 번호 보관함은 최대 ${CONFIG.LIMITS.MAX_IMPORT_TICKETS}개 번호까지 가져올 수 있습니다.`,
                    'error',
                    3500
                );
                return;
            }
            if ((prepared.next.pension720Tickets?.length || 0) > CONFIG.LIMITS.MAX_PENSION720_TICKETS) {
                UIManager.toast(
                    `연금복권 저장 목록은 최대 ${CONFIG.LIMITS.MAX_PENSION720_TICKETS}개까지 가져올 수 있습니다.`,
                    'error',
                    3500
                );
                return;
            }

            const confirmed = await this.confirmPreparedImport(prepared);
            if (!confirmed) {
                UIManager.toast('가져오기를 취소했습니다.', 'info');
                return;
            }

            if (prepared.mode === 'overwrite') {
                const backup = this.ensureBackupBeforeDestructive?.({
                    prefix: 'lotto_pension_pro_before_replace',
                    errorMessage: '백업 파일 다운로드를 확인할 수 없어 덮어쓰기를 중단했습니다.'
                });
                if (!backup) return;
            }
            this.applyPreparedImport(prepared);

            if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
                this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
            }

            this.data.markAllDirty?.();
            this.data.save(true);
            this.app?.renderSettingsPanel?.();
            this.refreshPresetSelectors();
            await this.runPostImportRefresh();

            const message =
                prepared.mode === 'merge'
                    ? UI_STRINGS.dataio.mergeComplete(prepared.preview)
                    : UI_STRINGS.dataio.overwriteComplete({
                          added: prepared.preview.added,
                          skipped: prepared.preview.skipped,
                          applied: prepared.preview.appliedSettings,
                          cleaned: prepared.preview.cleaned,
                          futureDropped: prepared.preview.futureDropped
                      });
            UIManager.toast(message, 'success');
        } catch (err) {
            console.error('Import failed', err);
            UIManager.toast(UI_STRINGS.dataio.importInvalid, 'error', 3500);
        } finally {
            input.value = '';
        }
    }
};
