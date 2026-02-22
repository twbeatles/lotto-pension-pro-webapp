import { $ } from '../utils/utils.js';
import { CONFIG } from '../utils/config.js';
import { UIManager } from '../core/UIManager.js';

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
    }

    exportAll() {
        const payload = {
            version: 2,
            exportedAt: new Date().toISOString(),
            favorites: this.data.state.favorites,
            history: this.data.state.history,
            ticketBook: this.data.state.ticketBook,
            campaigns: this.data.state.campaigns,
            alertPrefs: this.data.state.alertPrefs,
            settings: {
                theme: this.data.state.theme,
                customProxy: this.data.state.customProxy,
                strategyPrefs: this.data.state.strategyPrefs
            }
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `로또_프로_백업_v2_${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        UIManager.toast('백업 파일(2버전)을 내보냈습니다.', 'success');
    }

    normalizeItems(items) {
        if (!Array.isArray(items)) return [];
        return items
            .filter(x => x && Array.isArray(x.numbers))
            .map(x => ({
                numbers: [...new Set(x.numbers.map(Number).filter(n => n >= 1 && n <= 45))]
                    .slice(0, 6)
                    .sort((a, b) => a - b),
                date: typeof x.date === 'string' ? x.date : new Date().toISOString()
            }))
            .filter(x => x.numbers.length === 6);
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

    mergeByNumbers(existing, incoming) {
        const seen = new Set(existing.map(x => x.numbers.join(',')));
        const merged = [...existing];
        incoming.forEach(x => {
            const k = x.numbers.join(',');
            if (seen.has(k)) return;
            seen.add(k);
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

    async importAll(e) {
        const input = e.currentTarget;
        const file = input.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const json = JSON.parse(text);
            if (!json || typeof json !== 'object') {
                UIManager.toast('가져오기 실패: 지원하지 않는 파일 형식입니다.', 'error', 3500);
                return;
            }

            const version = Number(json.version || 1);
            if (version !== 1 && version !== 2) {
                UIManager.toast('가져오기 실패: 지원하지 않는 백업 버전입니다.', 'error', 3500);
                return;
            }

            const incomingFav = this.normalizeItems(json.favorites);
            const incomingHist = this.normalizeItems(json.history);
            const incomingTheme = json.settings?.theme === 'light' ? 'light' : 'dark';
            const incomingProxy = typeof json.settings?.customProxy === 'string' ? json.settings.customProxy : '';
            const incomingStrategyPrefs = json.settings?.strategyPrefs || null;

            const incomingTickets = version >= 2
                ? this.normalizeTicketItems(json.ticketBook)
                : [];
            const incomingCampaigns = version >= 2
                ? this.normalizeCampaignItems(json.campaigns)
                : [];
            const incomingAlertPrefs = version >= 2
                ? this.data.mergeAlertPrefs(json.alertPrefs || {})
                : this.data.getDefaultAlertPrefs();

            const merge = confirm(`데이터를 가져옵니다.\n- 즐겨찾기: ${incomingFav.length}개\n- 히스토리: ${incomingHist.length}개\n- 티켓북: ${incomingTickets.length}개\n- 캠페인: ${incomingCampaigns.length}개\n\n기존 데이터와 병합하시겠습니까? (확인=병합, 취소=덮어쓰기)`);

            if (merge) {
                const beforeFav = this.data.state.favorites.length;
                const beforeHist = this.data.state.history.length;
                const beforeTickets = this.data.state.ticketBook.length;
                const beforeCampaigns = this.data.state.campaigns.length;

                this.data.state.favorites = this.mergeByNumbers(this.data.state.favorites, incomingFav);
                this.data.state.history = this.mergeByNumbers(this.data.state.history, incomingHist);
                this.data.state.ticketBook = this.mergeTickets(this.data.state.ticketBook, incomingTickets);
                this.data.state.campaigns = [...incomingCampaigns, ...this.data.state.campaigns]
                    .filter((x, idx, arr) => arr.findIndex((y) => y.id === x.id) === idx);
                this.data.state.alertPrefs = this.data.mergeAlertPrefs({
                    ...this.data.state.alertPrefs,
                    ...incomingAlertPrefs
                });

                const newFav = this.data.state.favorites.length - beforeFav;
                const newHist = this.data.state.history.length - beforeHist;
                const newTickets = this.data.state.ticketBook.length - beforeTickets;
                const newCampaigns = this.data.state.campaigns.length - beforeCampaigns;
                UIManager.toast(`병합 완료 (신규: 즐겨찾기 ${newFav}, 히스토리 ${newHist}, 티켓 ${newTickets}, 캠페인 ${newCampaigns})`, 'success');
            } else {
                this.data.state.favorites = incomingFav;
                this.data.state.history = incomingHist;
                this.data.state.ticketBook = incomingTickets;
                this.data.state.campaigns = incomingCampaigns;
                this.data.state.alertPrefs = incomingAlertPrefs;
                this.data.state.theme = incomingTheme;
                this.data.state.customProxy = incomingProxy;
                if (incomingStrategyPrefs) {
                    this.data.state.strategyPrefs = this.data.mergeStrategyPrefs(incomingStrategyPrefs);
                }
                this.app.applyTheme();
                UIManager.toast(`덮어쓰기 완료 (즐겨찾기 ${incomingFav.length}, 히스토리 ${incomingHist.length}, 티켓 ${incomingTickets.length})`, 'success');
            }

            if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
                this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
            }

            this.data.save();
            this.app.renderDataLists();
        } catch (err) {
            console.error('가져오기 실패', err);
            UIManager.toast('가져오기 실패: 백업 파일 해석 오류', 'error', 3500);
        } finally {
            input.value = '';
        }
    }
}
