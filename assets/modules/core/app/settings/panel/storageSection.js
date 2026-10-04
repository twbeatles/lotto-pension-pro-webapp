import { $ } from '../../../../utils/utils.js';

export const appSettingsStorageSectionMethods = {
    renderSettingsStorageSection() {
        if (typeof document === 'undefined') return;
        const storageSummary = this.data.getStorageSummary();
        const storageBadge = $('#storageHealthBadge');
        if (storageBadge) {
            storageBadge.textContent = this.getStorageHealthLabel(storageSummary.status);
            storageBadge.className = `badge ${this.getStatusBadgeClass(storageSummary.status)}`;
        }
        const storageUsage = $('#storageUsageValue');
        if (storageUsage) storageUsage.textContent = this.formatBytes(storageSummary.bytes);
        const storageCounts = $('#storageCountsValue');
        if (storageCounts) {
            storageCounts.textContent = [
                `즐겨찾기 ${storageSummary.counts.favorites}`,
                `기록 ${storageSummary.counts.history}`,
                `구매 번호 ${storageSummary.counts.tickets}`,
                `연금복권 ${storageSummary.counts.pension720Tickets || 0}`,
                `회차 묶음 ${storageSummary.counts.campaigns}`,
                `연금 회차 묶음 ${storageSummary.counts.pension720Campaigns || 0}`,
                `저장한 설정 ${storageSummary.counts.presets}`,
                `받은 최신 회차 ${storageSummary.counts.localUpdates}`
            ].join(' · ');
        }
        const storageNotice = $('#storageHealthNote');
        if (storageNotice) storageNotice.textContent = this.getStorageHealthMessage(storageSummary);
    }
};
