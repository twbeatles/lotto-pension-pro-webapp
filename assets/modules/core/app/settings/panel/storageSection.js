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
                `티켓 ${storageSummary.counts.tickets}`,
                `연금복권 ${storageSummary.counts.pension720Tickets || 0}`,
                `캠페인 ${storageSummary.counts.campaigns}`,
                `연금캠페인 ${storageSummary.counts.pension720Campaigns || 0}`,
                `프리셋 ${storageSummary.counts.presets}`,
                `로컬업데이트 ${storageSummary.counts.localUpdates}`
            ].join(' · ');
        }
        const storageNotice = $('#storageHealthNote');
        if (storageNotice) storageNotice.textContent = this.getStorageHealthMessage(storageSummary);
    }
};
