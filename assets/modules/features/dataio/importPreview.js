import { countStoredItems, safeClone } from './importHelpers.js';

export const dataIoImportPreviewMethods = {
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
    }
};
