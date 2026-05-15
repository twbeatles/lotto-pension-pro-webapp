import { $ } from '../utils/utils.js';
import { Pension720Engine } from '../core/Pension720Engine.js';
import { UIManager } from '../core/UIManager.js';

function clearElement(el) {
    if (el) el.replaceChildren();
}

function makeEl(tag, className = '', text = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

function appendDigitBalls(container, number, options = {}) {
    const wrap = makeEl('div', 'p720-number');
    if (options.group) {
        const group = makeEl('span', 'p720-ball p720-group', `${options.group}조`);
        wrap.appendChild(group);
    }
    String(number || '')
        .split('')
        .forEach((digit) => {
            wrap.appendChild(makeEl('span', 'p720-ball', digit));
        });
    container.appendChild(wrap);
    return wrap;
}

function formatDate(date = '') {
    return String(date || '').replaceAll('-', '.');
}

function formatTicket(ticket) {
    return `${Number(ticket?.group || 0)}조 ${String(ticket?.number || '').padStart(6, '0')}`;
}

function getCheckSortValue(result) {
    if (!result) return 99;
    if (result.rank === 'bonus') return 2.5;
    return result.rank ? Number(result.rank) : 99;
}

function escapeCsvCell(value = '') {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function getProfileLabel(profile = 'basic') {
    if (profile === 'fast') return '빠름';
    if (profile === 'precise') return '정밀';
    return '기본';
}

export class Pension720Module {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.lastRecommendations = [];
        this.lastRecommendationOptions = null;
        this.bound = false;
        this.bindEvents();
    }

    bindEvents() {
        if (this.bound) return;
        $('#pension720RefreshBtn')?.addEventListener('click', () => this.refreshData());
        $('#pension720RecommendBtn')?.addEventListener('click', () => this.runRecommendation());
        $('#pension720ClearTicketsBtn')?.addEventListener('click', () => this.clearSavedTickets());
        $('#pension720CopyAllBtn')?.addEventListener('click', () => this.copySavedTickets());
        $('#pension720ExportCsvBtn')?.addEventListener('click', () => this.exportSavedTicketsCsv());
        $('#pension720CheckLatestBtn')?.addEventListener('click', () => this.runLatestCheck());

        $('#pension720Output')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-p720-action]');
            if (!button) return;
            const index = Number(button.dataset.index);
            const recommendation = this.lastRecommendations[index];
            if (!recommendation) return;
            if (button.dataset.p720Action === 'save') {
                this.saveRecommendation(recommendation, recommendation.group);
            } else if (button.dataset.p720Action === 'save-expansion') {
                this.saveExpansion(recommendation);
            }
        });

        $('#pension720SavedList')?.addEventListener('click', (event) => {
            const copyButton = event.target.closest('[data-p720-copy]');
            if (copyButton) {
                const ticket = this.findSavedTicket(copyButton.dataset.p720Copy);
                if (ticket) UIManager.copyText(formatTicket(ticket));
                return;
            }
            const button = event.target.closest('[data-p720-delete]');
            if (!button) return;
            const removed = this.data.removePension720Ticket(button.dataset.p720Delete);
            if (removed) {
                UIManager.toast('연금복권 번호를 삭제했습니다.', 'success');
                this.renderSavedTickets();
                if (!(this.data.state.pension720Tickets || []).length) this.renderCheckPlaceholder(true);
            }
        });

        this.bound = true;
    }

    async onEnter() {
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        this.render();
    }

    render() {
        this.renderStatus();
        this.renderStats();
        this.renderSavedTickets();
        this.renderCheckPlaceholder();
        if (this.lastRecommendations.length) {
            this.renderRecommendations(this.lastRecommendations);
        }
    }

    renderStatus() {
        const health = this.data.mergePension720DataHealth(
            this.data.pension720DataHealth || this.data.getDefaultPension720DataHealth()
        );
        const latest = this.data.state.pension720Stats?.[0] || null;
        const statusEl = $('#pension720DataStatus');
        const latestDrawEl = $('#pension720LatestDraw');
        const latestNumberEl = $('#pension720LatestNumber');
        const latestBonusEl = $('#pension720LatestBonus');

        if (statusEl) {
            statusEl.textContent =
                health.availability === 'full' ? health.message : '연금복권 데이터를 불러와야 합니다.';
            statusEl.className = `badge status-badge ${health.availability === 'full' ? 'is-good' : 'is-bad'}`;
        }
        if (latestDrawEl) {
            latestDrawEl.textContent = latest ? `${latest.draw_no}회 · ${formatDate(latest.date)}` : '-';
        }
        if (latestNumberEl) {
            latestNumberEl.replaceChildren();
            if (latest) appendDigitBalls(latestNumberEl, latest.number, { group: latest.group });
            else latestNumberEl.textContent = '-';
        }
        if (latestBonusEl) {
            latestBonusEl.replaceChildren();
            if (latest) appendDigitBalls(latestBonusEl, latest.bonus_number);
            else latestBonusEl.textContent = '-';
        }
    }

    renderStats() {
        const stats = this.data.state.pension720Stats || [];
        const groupContainer = $('#pension720GroupStats');
        const digitContainer = $('#pension720DigitStats');
        const recentContainer = $('#pension720RecentSummary');
        clearElement(groupContainer);
        clearElement(digitContainer);
        clearElement(recentContainer);

        if (!stats.length) {
            groupContainer?.appendChild(makeEl('p', 'empty-state', '연금복권 데이터를 불러온 뒤 통계를 표시합니다.'));
            return;
        }

        const engine = new Pension720Engine(stats);
        const summary = engine.getSummary();
        const maxGroupScore = Math.max(...summary.topGroups.map((item) => item.score), 1);
        summary.topGroups
            .slice()
            .sort((a, b) => a.group - b.group)
            .forEach((item) => {
                const row = makeEl('div', 'p720-stat-row');
                row.appendChild(makeEl('span', 'p720-stat-label', `${item.group}조`));
                const track = makeEl('span', 'p720-stat-track');
                const fill = makeEl('span', 'p720-stat-fill');
                fill.style.width = `${Math.max(4, (item.score / maxGroupScore) * 100).toFixed(1)}%`;
                track.appendChild(fill);
                row.appendChild(track);
                row.appendChild(makeEl('span', 'p720-stat-value', `${item.rawCount || item.count || 0}회`));
                groupContainer?.appendChild(row);
            });

        engine.analysis.positionStats.forEach((weights, pos) => {
            const topDigits = weights
                .map((weight, digit) => ({ digit, weight }))
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 3);
            const item = makeEl('div', 'p720-digit-position');
            item.appendChild(makeEl('span', 'p720-stat-label', `${pos + 1}번째`));
            const balls = makeEl('div', 'p720-digit-balls');
            topDigits.forEach(({ digit }) => balls.appendChild(makeEl('span', 'p720-ball sm', String(digit))));
            item.appendChild(balls);
            digitContainer?.appendChild(item);
        });

        const recent = stats.slice(0, 8);
        recent.forEach((draw) => {
            const item = makeEl('div', 'p720-recent-item');
            item.appendChild(makeEl('span', 'p720-recent-draw', `${draw.draw_no}회`));
            appendDigitBalls(item, draw.number, { group: draw.group });
            recentContainer?.appendChild(item);
        });
    }

    async refreshData() {
        const btn = $('#pension720RefreshBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '새로고침 중';
        }
        try {
            const ok = await this.data.fetchPension720Stats({ remote: true, preserveExistingOnFailure: true });
            this.render();
            UIManager.toast(
                ok ? '연금복권 데이터를 새로고침했습니다.' : '연금복권 데이터를 확인하지 못했습니다.',
                ok ? 'success' : 'warning'
            );
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '최신 데이터 확인';
            }
        }
    }

    getRecommendationOptions() {
        const setCount = Math.max(1, Math.min(20, Number($('#pension720RecommendCount')?.value || 5)));
        const profileRaw = String($('#pension720AnalysisPreset')?.value || 'basic');
        const profile = ['fast', 'basic', 'precise'].includes(profileRaw) ? profileRaw : 'basic';
        const seedValue = $('#pension720Seed')?.value;
        const seed = seedValue === '' ? null : Number(seedValue);
        return {
            setCount,
            profile,
            seed: Number.isFinite(seed) && seed > 0 ? seed : null
        };
    }

    async runRecommendation() {
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        if (!this.data.state.pension720Stats.length) {
            UIManager.toast('연금복권 데이터가 없습니다. 최신 데이터 확인을 먼저 실행해주세요.', 'error');
            return;
        }

        const btn = $('#pension720RecommendBtn');
        const output = $('#pension720Output');
        const options = this.getRecommendationOptions();
        if (btn) {
            btn.disabled = true;
            btn.textContent = '추천 중';
        }
        output?.setAttribute('aria-busy', 'true');
        try {
            const engine = new Pension720Engine(this.data.state.pension720Stats);
            this.lastRecommendationOptions = options;
            this.lastRecommendations = engine.recommend(options);
            this.data.state.pension720Results = this.lastRecommendations;
            this.renderRecommendations(this.lastRecommendations);
            UIManager.toast(`연금복권 추천 ${this.lastRecommendations.length}개를 만들었습니다.`, 'success');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '추천 시작';
            }
            output?.setAttribute('aria-busy', 'false');
        }
    }

    renderRecommendations(recommendations = []) {
        const out = $('#pension720Output');
        clearElement(out);
        if (!out) return;

        if (!recommendations.length) {
            out.appendChild(makeEl('p', 'empty-state', '추천 시작을 누르면 연금복권 번호가 표시됩니다.'));
            return;
        }

        const profile = getProfileLabel(this.lastRecommendationOptions?.profile || this.getRecommendationOptions().profile);
        recommendations.forEach((item, index) => {
            const card = makeEl('article', 'p720-card');
            const head = makeEl('div', 'p720-card-head');
            head.appendChild(makeEl('span', 'rank-badge', `#${index + 1}`));
            head.appendChild(makeEl('span', 'badge', `${profile} · 점수 ${Number(item.score || 0).toFixed(1)}`));
            card.appendChild(head);

            appendDigitBalls(card, item.number, { group: item.group });

            const reasons = makeEl('div', 'p720-reasons');
            (item.reasons || []).forEach((reason) => reasons.appendChild(makeEl('span', 'meta-badge', reason)));
            card.appendChild(reasons);

            const expansion = makeEl('p', 'p720-expansion');
            expansion.textContent = `확장 조 제안: ${item.expansionGroups.map((group) => `${group}조`).join(', ')}`;
            card.appendChild(expansion);

            const actions = makeEl('div', 'row-actions');
            const saveBtn = makeEl('button', 'btn ghost sm', '저장');
            saveBtn.type = 'button';
            saveBtn.dataset.p720Action = 'save';
            saveBtn.dataset.index = String(index);
            const expansionBtn = makeEl('button', 'btn ghost sm', '확장 조 모두 저장');
            expansionBtn.type = 'button';
            expansionBtn.dataset.p720Action = 'save-expansion';
            expansionBtn.dataset.index = String(index);
            actions.append(saveBtn, expansionBtn);
            card.appendChild(actions);

            card.appendChild(makeEl('p', 'result-disclaimer', '재미와 참고용이며 당첨을 보장하지 않습니다.'));
            out.appendChild(card);
        });
    }

    saveRecommendation(recommendation, group) {
        const result = this.data.addPension720Ticket({
            group,
            number: recommendation.number,
            score: recommendation.score,
            source: 'recommendation'
        });
        UIManager.toast(
            result.inserted ? '연금복권 번호를 저장했습니다.' : '이미 저장된 연금복권 번호입니다.',
            result.inserted ? 'success' : 'info'
        );
        this.renderSavedTickets();
    }

    saveExpansion(recommendation) {
        const groups = [recommendation.group, ...(recommendation.expansionGroups || [])];
        const now = new Date().toISOString();
        const result = this.data.addPension720TicketsBulk(
            groups.map((group) => ({
                group,
                number: recommendation.number,
                score: recommendation.score,
                source: 'recommendation',
                createdAt: now
            }))
        );
        const truncatedText = result.truncated ? `, 보관 한도로 ${result.truncated}개는 제외됨` : '';
        UIManager.toast(
            result.inserted
                ? `확장 조 ${result.inserted}개를 저장했습니다${truncatedText}.`
                : '확장 조 번호가 모두 이미 저장되어 있습니다.',
            result.inserted ? 'success' : 'info'
        );
        this.renderSavedTickets();
    }

    renderSavedTickets() {
        const list = $('#pension720SavedList');
        const summary = $('#pension720SavedSummary');
        const clearBtn = $('#pension720ClearTicketsBtn');
        const copyAllBtn = $('#pension720CopyAllBtn');
        const exportBtn = $('#pension720ExportCsvBtn');
        const checkBtn = $('#pension720CheckLatestBtn');
        const tickets = this.data.state.pension720Tickets || [];
        clearElement(list);

        if (summary) summary.textContent = `${tickets.length}개 저장됨`;
        if (clearBtn) clearBtn.disabled = !tickets.length;
        if (copyAllBtn) copyAllBtn.disabled = !tickets.length;
        if (exportBtn) exportBtn.disabled = !tickets.length;
        if (checkBtn) checkBtn.disabled = !tickets.length;
        if (!list) return;

        if (!tickets.length) {
            list.appendChild(makeEl('p', 'empty-state', '저장한 연금복권 번호가 없습니다.'));
            return;
        }

        tickets.forEach((ticket) => {
            const row = makeEl('div', 'p720-saved-row');
            const main = makeEl('div', 'p720-saved-main');
            appendDigitBalls(main, ticket.number, { group: ticket.group });
            main.appendChild(makeEl('span', 'result-meta', `${formatDate(ticket.createdAt.slice(0, 10))} 저장`));
            row.appendChild(main);
            const copy = makeEl('button', 'btn ghost sm', '복사');
            copy.type = 'button';
            copy.dataset.p720Copy = ticket.id;
            const del = makeEl('button', 'btn ghost sm', '삭제');
            del.type = 'button';
            del.dataset.p720Delete = ticket.id;
            row.append(copy, del);
            list.appendChild(row);
        });
    }

    findSavedTicket(id = '') {
        const targetId = String(id || '').trim();
        return (this.data.state.pension720Tickets || []).find((ticket) => ticket.id === targetId) || null;
    }

    async clearSavedTickets() {
        const count = this.data.state.pension720Tickets?.length || 0;
        if (!count) return;
        const confirmed = await UIManager.confirm({
            title: '연금복권 저장 번호 정리',
            message: `저장한 연금복권 번호 ${count}개를 삭제합니다. 계속할까요?`,
            confirmText: '전체 정리',
            cancelText: '취소'
        });
        if (!confirmed) return;
        const removed = this.data.clearPension720Tickets();
        if (removed) {
            UIManager.toast(`연금복권 저장 번호 ${removed}개를 정리했습니다.`, 'success');
            this.renderSavedTickets();
            this.renderCheckPlaceholder(true);
        }
    }

    copySavedTickets() {
        const tickets = this.data.state.pension720Tickets || [];
        if (!tickets.length) {
            UIManager.toast('복사할 연금복권 번호가 없습니다.', 'warning');
            return;
        }
        UIManager.copyText(tickets.map(formatTicket).join('\n'));
    }

    exportSavedTicketsCsv() {
        const tickets = this.data.state.pension720Tickets || [];
        if (!tickets.length) {
            UIManager.toast('내보낼 연금복권 번호가 없습니다.', 'warning');
            return;
        }
        const header = ['group', 'number', 'source', 'score', 'createdAt'];
        const rows = tickets.map((ticket) =>
            [ticket.group, ticket.number, ticket.source, ticket.score || 0, ticket.createdAt].map(escapeCsvCell).join(',')
        );
        const csv = `${header.join(',')}\n${rows.join('\n')}\n`;
        if (
            typeof document === 'undefined' ||
            typeof Blob === 'undefined' ||
            typeof URL === 'undefined' ||
            typeof URL.createObjectURL !== 'function'
        ) {
            UIManager.copyText(csv);
            return;
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `lotto_pension_pro_pension720_tickets_${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        UIManager.toast('연금복권 저장 목록 CSV를 내보냈습니다.', 'success');
    }

    renderCheckPlaceholder(force = false) {
        const output = $('#pension720CheckOutput');
        if (force) clearElement(output);
        if (!output || output.childElementCount) return;
        output.appendChild(makeEl('p', 'empty-state', '저장 번호가 있으면 최신 회차 기준으로 확인할 수 있습니다.'));
    }

    async runLatestCheck() {
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        const latest = this.data.state.pension720Stats?.[0];
        const tickets = this.data.state.pension720Tickets || [];
        if (!latest) {
            UIManager.toast('연금복권 당첨 데이터가 없습니다. 최신 데이터 확인을 먼저 실행해주세요.', 'error');
            return;
        }
        if (!tickets.length) {
            UIManager.toast('확인할 저장 번호가 없습니다.', 'warning');
            return;
        }
        const results = tickets
            .map((ticket) => ({
                ticket,
                result: this.data.evaluatePension720Ticket(ticket, latest)
            }))
            .filter((item) => item.result)
            .sort((a, b) => getCheckSortValue(a.result) - getCheckSortValue(b.result));
        this.renderCheckResults(latest, results);
    }

    renderCheckResults(latest, results = []) {
        const output = $('#pension720CheckOutput');
        clearElement(output);
        if (!output) return;

        const summary = makeEl('div', 'p720-check-summary');
        summary.appendChild(makeEl('strong', '', `${latest.draw_no}회 · ${formatDate(latest.date)}`));
        summary.appendChild(makeEl('span', '', `1등 ${latest.group}조 ${latest.number} / 보너스 ${latest.bonus_number}`));
        output.appendChild(summary);

        results.forEach(({ ticket, result }) => {
            const row = makeEl('div', 'p720-check-row');
            const main = makeEl('div', 'p720-saved-main');
            appendDigitBalls(main, ticket.number, { group: ticket.group });
            main.appendChild(
                makeEl(
                    'span',
                    'result-meta',
                    result.matchType === 'bonus'
                        ? '보너스 번호 일치'
                        : `끝자리 ${result.trailingMatches}개 일치`
                )
            );
            row.appendChild(main);
            const badge = makeEl('span', `badge ${result.rank ? 'ok' : 'no'}`, result.label);
            row.appendChild(badge);
            row.appendChild(makeEl('span', 'p720-check-prize', result.prizeLabel));
            output.appendChild(row);
        });
    }
}
