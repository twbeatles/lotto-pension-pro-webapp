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
            version: 1,
            exportedAt: new Date().toISOString(),
            favorites: this.data.state.favorites,
            history: this.data.state.history,
            settings: { theme: this.data.state.theme }
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `lotto_pro_backup_v1_${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        UIManager.toast('백업 파일을 내보냈습니다.', 'success');
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

    mergeByNumbers(existing, incoming) {
        const seen = new Set(existing.map(x => x.numbers.join(',')));
        const merged = [...existing];
        // Put new (non-duplicate) items on top
        incoming.forEach(x => {
            const k = x.numbers.join(',');
            if (seen.has(k)) return;
            seen.add(k);
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
            if (!json || typeof json !== 'object' || json.version !== 1) {
                UIManager.toast('가져오기 실패: 지원하지 않는 백업 파일 형식입니다.', 'error', 3500);
                return;
            }

            const incomingFav = this.normalizeItems(json.favorites);
            const incomingHist = this.normalizeItems(json.history);
            const incomingTheme = json.settings?.theme === 'light' ? 'light' : 'dark';

            const merge = confirm('기존 데이터를 유지하고 병합할까요? (확인=병합 / 취소=덮어쓰기)');
            if (merge) {
                this.data.state.favorites = this.mergeByNumbers(this.data.state.favorites, incomingFav);
                this.data.state.history = this.mergeByNumbers(this.data.state.history, incomingHist);
                // Keep current theme on merge
            } else {
                this.data.state.favorites = incomingFav;
                this.data.state.history = incomingHist;
                this.data.state.theme = incomingTheme;
                this.app.applyTheme();
            }

            // Clamp history size
            if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
                this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
            }

            this.data.save();
            this.app.renderDataLists();
            UIManager.toast('가져오기 완료', 'success');
        } catch (err) {
            console.error('Import failed', err);
            UIManager.toast('가져오기 실패: JSON 파싱 오류', 'error', 3500);
        } finally {
            // allow re-importing same file
            input.value = '';
        }
    }
}
