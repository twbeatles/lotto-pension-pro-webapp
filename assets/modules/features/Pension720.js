import { $ } from '../utils/utils.js';
import { Pension720Engine } from '../core/Pension720Engine.js';
import {
    getPension720StrategyMeta,
    listPension720Strategies,
    resolvePension720StrategyId
} from '../core/Pension720StrategyCatalog.js';
import { UIManager } from '../core/UIManager.js';
import { StrategyPresetController } from '../utils/strategyPresets.js';
import { CONFIG } from '../utils/config.js';

const PENSION720_ANALYSIS_PRESETS = {
    fast: {
        label: '빠름',
        lookbackWindow: 20,
        candidatePoolSize: 80
    },
    basic: {
        label: '기본',
        lookbackWindow: 40,
        candidatePoolSize: 140
    },
    precise: {
        label: '정밀',
        lookbackWindow: 80,
        candidatePoolSize: 240
    }
};

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

function getAnalysisPresetLabelFromRequest(request = {}) {
    const lookbackWindow = Number(request.params?.lookbackWindow || 0);
    const candidatePoolSize = Number(request.params?.candidatePoolSize || 0);
    const matched = Object.values(PENSION720_ANALYSIS_PRESETS).find((preset) => {
        return preset.lookbackWindow === lookbackWindow && preset.candidatePoolSize === candidatePoolSize;
    });
    return matched?.label || '직접';
}

export class Pension720Module {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.lastRecommendations = Array.isArray(app.data.state.pension720Results)
            ? app.data.state.pension720Results
            : [];
        this.lastRecommendationOptions = null;
        this.isRecommending = false;
        this.isGeneratingCampaign = false;
        this.recommendationToken = 0;
        this.campaignToken = 0;
        this.recommendBtnOriginalText = '';
        this.bound = false;
        this.bindEvents();
        this.populateStrategySelect();
        this.applySavedStrategyPrefs();
        this.presetController = new StrategyPresetController({
            data: this.data,
            scope: 'pension720',
            selectId: 'pension720PresetSelect',
            loadBtnId: 'pension720PresetLoadBtn',
            saveBtnId: 'pension720PresetSaveBtn',
            deleteBtnId: 'pension720PresetDeleteBtn',
            getRequest: () => this.getStrategyRequestFromUI(),
            applyRequest: (request) => this.applyStrategyRequest(request)
        });
    }

    bindEvents() {
        if (this.bound) return;
        $('#pension720RefreshBtn')?.addEventListener('click', () => this.refreshData());
        $('#pension720RecommendBtn')?.addEventListener('click', () => this.runRecommendation());
        $('#pension720ResetOptionsBtn')?.addEventListener('click', () => this.resetRecommendationOptions());
        $('#pension720CampaignBtn')?.addEventListener('click', () => this.runCampaignRecommendation());
        $('#pension720CampaignResetBtn')?.addEventListener('click', () => this.resetCampaignOptions());
        $('#pension720ClearTicketsBtn')?.addEventListener('click', () => this.clearSavedTickets());
        $('#pension720CopyAllBtn')?.addEventListener('click', () => this.copySavedTickets());
        $('#pension720ExportCsvBtn')?.addEventListener('click', () => this.exportSavedTicketsCsv());
        $('#pension720CheckLatestBtn')?.addEventListener('click', () => this.runLatestCheck());
        $('#pension720ShowExperimental')?.addEventListener('change', () => this.populateStrategySelect());
        $('#pension720AnalysisPreset')?.addEventListener('change', (event) => {
            if (event.currentTarget.value === 'custom') return;
            this.applyAnalysisPreset(event.currentTarget.value);
        });
        ['#pension720LookbackWindow', '#pension720CandidatePoolSize'].forEach((selector) => {
            $(selector)?.addEventListener('input', () => this.syncAnalysisPresetSelect());
        });

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
                this.renderCampaigns();
                if (!(this.data.state.pension720Tickets || []).length) this.renderCheckPlaceholder(true);
            }
        });

        this.bound = true;
    }

    syncBusyButtons() {
        const anyBusy = this.isRecommending || this.isGeneratingCampaign;
        const recommendBtn = $('#pension720RecommendBtn');
        const campaignBtn = $('#pension720CampaignBtn');
        const resetCampaignBtn = $('#pension720CampaignResetBtn');
        const resetOptionsBtn = $('#pension720ResetOptionsBtn');

        if (recommendBtn) {
            if (!this.recommendBtnOriginalText) this.recommendBtnOriginalText = recommendBtn.textContent || '추천 시작';
            recommendBtn.disabled = anyBusy;
            recommendBtn.textContent = this.isRecommending ? '추천 중' : this.recommendBtnOriginalText;
        }
        if (campaignBtn) {
            campaignBtn.disabled = anyBusy;
            campaignBtn.replaceChildren();
            const icon = makeEl('i', this.isGeneratingCampaign ? 'ph ph-spinner ph-spin' : 'ph ph-calendar-plus');
            campaignBtn.append(icon, document.createTextNode(this.isGeneratingCampaign ? ' 생성 중' : ' 캠페인 생성'));
        }
        if (resetCampaignBtn) resetCampaignBtn.disabled = anyBusy;
        if (resetOptionsBtn) resetOptionsBtn.disabled = anyBusy;
    }

    readNumberInput(id, fallback = null) {
        const el = $(`#${id}`);
        if (!el) return fallback;
        const value = String(el.value || '').trim();
        if (!value) return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    buildRange(minId, maxId) {
        const min = this.readNumberInput(minId, null);
        const max = this.readNumberInput(maxId, null);
        if (min === null || max === null) return null;
        return min <= max ? [min, max] : [max, min];
    }

    parseGroups(value = '') {
        const groups = [
            ...new Set(
                String(value || '')
                    .split(/[^0-9]+/)
                    .map(Number)
                    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 5)
            )
        ].sort((a, b) => a - b);
        return groups.length ? groups : null;
    }

    parseFixedDigits(value = '') {
        const text = String(value || '').trim();
        if (!text) return null;
        const out = Array(6).fill(null);
        let found = false;
        for (const match of text.matchAll(/([1-6])\s*[:=]\s*([0-9])/g)) {
            out[Number(match[1]) - 1] = Number(match[2]);
            found = true;
        }
        return found ? out : null;
    }

    parseExcludedDigits(value = '') {
        const text = String(value || '').trim();
        if (!text) return null;
        const out = Array.from({ length: 6 }, () => []);
        let found = false;
        for (const segment of text.split(/[;|/]+/)) {
            const match = segment.match(/([1-6])\s*[:=]\s*([0-9,\s]+)/);
            if (!match) continue;
            const pos = Number(match[1]) - 1;
            const digits = [
                ...new Set(
                    match[2]
                        .split(/[^0-9]+/)
                        .map(Number)
                        .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9)
                )
            ];
            if (digits.length) {
                out[pos] = digits;
                found = true;
            }
        }
        return found ? out : null;
    }

    getSuggestedNextDrawNo() {
        return (this.data.state.pension720Stats?.[0]?.draw_no || 0) + 1;
    }

    populateStrategySelect() {
        const select = $('#pension720StrategySelect');
        if (!select) return;
        const current = select.value || 'mixed_balance';
        const includeExperimental = Boolean($('#pension720ShowExperimental')?.checked);
        const items = listPension720Strategies({ includeExperimental });
        select.replaceChildren();
        items.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.label} (등급 ${item.tier})${item.experimental ? ' [실험]' : ''}`;
            select.appendChild(opt);
        });
        const resolved = resolvePension720StrategyId(current);
        if ([...select.options].some((item) => item.value === resolved)) select.value = resolved;
    }

    applyAnalysisPreset(presetId = 'basic') {
        const preset = PENSION720_ANALYSIS_PRESETS[presetId] || PENSION720_ANALYSIS_PRESETS.basic;
        const lookback = $('#pension720LookbackWindow');
        const pool = $('#pension720CandidatePoolSize');
        const select = $('#pension720AnalysisPreset');
        if (lookback) lookback.value = String(preset.lookbackWindow);
        if (pool) pool.value = String(preset.candidatePoolSize);
        if (select) select.value = PENSION720_ANALYSIS_PRESETS[presetId] ? presetId : 'basic';
    }

    syncAnalysisPresetSelect() {
        const select = $('#pension720AnalysisPreset');
        if (!select) return 'custom';
        const lookback = Number($('#pension720LookbackWindow')?.value || 0);
        const pool = Number($('#pension720CandidatePoolSize')?.value || 0);
        const matched = Object.entries(PENSION720_ANALYSIS_PRESETS).find(([, preset]) => {
            return preset.lookbackWindow === lookback && preset.candidatePoolSize === pool;
        });
        select.value = matched?.[0] || 'custom';
        return select.value;
    }

    getStrategyRequestFromUI() {
        const strategyId = resolvePension720StrategyId($('#pension720StrategySelect')?.value || 'mixed_balance');
        const seed = this.readNumberInput('pension720Seed', null);
        return {
            strategyId,
            params: {
                seed: Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : null,
                lookbackWindow: this.readNumberInput('pension720LookbackWindow', 40),
                candidatePoolSize: this.readNumberInput('pension720CandidatePoolSize', 140)
            },
            filters: {
                groups: this.parseGroups($('#pension720AllowedGroups')?.value || ''),
                fixedDigits: this.parseFixedDigits($('#pension720FixedDigits')?.value || ''),
                excludedDigitsByPosition: this.parseExcludedDigits($('#pension720ExcludedDigits')?.value || ''),
                digitSumRange: this.buildRange('pension720DigitSumMin', 'pension720DigitSumMax'),
                oddDigitRange: this.buildRange('pension720OddMin', 'pension720OddMax'),
                highDigitRange: this.buildRange('pension720HighMin', 'pension720HighMax'),
                uniqueDigitMin: this.readNumberInput('pension720UniqueDigitMin', null),
                maxSameDigit: this.readNumberInput('pension720MaxSameDigit', null)
            }
        };
    }

    applyStrategyRequest(saved) {
        if (!saved) return;
        const assign = (id, value) => {
            const el = $(`#${id}`);
            if (el && value !== undefined && value !== null) el.value = value;
        };
        const strategyId = resolvePension720StrategyId(saved.strategyId || 'mixed_balance');
        const select = $('#pension720StrategySelect');
        if (select && [...select.options].some((item) => item.value === strategyId)) select.value = strategyId;
        assign('pension720Seed', saved.params?.seed ?? '');
        assign('pension720LookbackWindow', saved.params?.lookbackWindow);
        assign('pension720CandidatePoolSize', saved.params?.candidatePoolSize);
        assign('pension720AllowedGroups', Array.isArray(saved.filters?.groups) ? saved.filters.groups.join(',') : '');
        assign('pension720FixedDigits', this.formatFixedDigits(saved.filters?.fixedDigits));
        assign('pension720ExcludedDigits', this.formatExcludedDigits(saved.filters?.excludedDigitsByPosition));
        this.applyRangeToFields('pension720DigitSumMin', 'pension720DigitSumMax', saved.filters?.digitSumRange);
        this.applyRangeToFields('pension720OddMin', 'pension720OddMax', saved.filters?.oddDigitRange);
        this.applyRangeToFields('pension720HighMin', 'pension720HighMax', saved.filters?.highDigitRange);
        assign('pension720UniqueDigitMin', saved.filters?.uniqueDigitMin);
        assign('pension720MaxSameDigit', saved.filters?.maxSameDigit);
        this.syncAnalysisPresetSelect();
    }

    applyRangeToFields(minId, maxId, pair) {
        const minEl = $(`#${minId}`);
        const maxEl = $(`#${maxId}`);
        if (!minEl || !maxEl) return;
        if (Array.isArray(pair) && pair.length >= 2) {
            minEl.value = pair[0];
            maxEl.value = pair[1];
        } else {
            minEl.value = '';
            maxEl.value = '';
        }
    }

    formatFixedDigits(value) {
        if (!value) return '';
        const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
        return [...entries]
            .filter(([, digit]) => digit !== null && digit !== undefined && digit !== '')
            .map(([pos, digit]) => `${Number(pos) + 1}=${digit}`)
            .join(', ');
    }

    formatExcludedDigits(value) {
        if (!value) return '';
        const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
        return [...entries]
            .filter(([, digits]) => Array.isArray(digits) && digits.length)
            .map(([pos, digits]) => `${Number(pos) + 1}=${digits.join(',')}`)
            .join('; ');
    }

    applySavedStrategyPrefs() {
        this.applyStrategyRequest(this.data.state.strategyPrefs?.pension720);
    }

    resetRecommendationOptions() {
        const assign = (id, value) => {
            const el = $(`#${id}`);
            if (el) el.value = value;
        };
        assign('pension720RecommendCount', 5);
        assign('pension720Seed', '');
        assign('pension720AllowedGroups', '');
        assign('pension720FixedDigits', '');
        assign('pension720ExcludedDigits', '');
        [
            'pension720DigitSumMin',
            'pension720DigitSumMax',
            'pension720OddMin',
            'pension720OddMax',
            'pension720HighMin',
            'pension720HighMax',
            'pension720UniqueDigitMin',
            'pension720MaxSameDigit'
        ].forEach((id) => {
            const el = $(`#${id}`);
            if (el) el.value = '';
        });
        if ($('#pension720StrategySelect')) $('#pension720StrategySelect').value = 'mixed_balance';
        this.applyAnalysisPreset('basic');
        const request = this.getStrategyRequestFromUI();
        this.data.setStrategyPrefs('pension720', request);
        this.data.save();
        UIManager.toast('연금복권 추천 옵션이 초기화되었습니다.');
    }

    resetCampaignOptions(force = true) {
        const defaults = {
            pension720CampaignStartDraw: this.getSuggestedNextDrawNo(),
            pension720CampaignWeeks: 4,
            pension720CampaignSetsPerDraw: 3
        };
        Object.entries(defaults).forEach(([id, value]) => {
            const el = $(`#${id}`);
            if (!el) return;
            if (!force && String(el.value || '').trim()) return;
            el.value = String(value);
        });
    }

    async onEnter() {
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        this.resetCampaignOptions(false);
        this.render();
    }

    render() {
        this.renderStatus();
        this.renderStats();
        this.renderSavedTickets();
        this.renderCampaigns();
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
        return {
            setCount,
            request: this.getStrategyRequestFromUI()
        };
    }

    async runRecommendation() {
        if (this.isRecommending || this.isGeneratingCampaign) return;
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        if (!this.data.state.pension720Stats.length) {
            UIManager.toast('연금복권 데이터가 없습니다. 최신 데이터 확인을 먼저 실행해주세요.', 'error');
            return;
        }

        const output = $('#pension720Output');
        const options = this.getRecommendationOptions();
        const localToken = ++this.recommendationToken;
        this.isRecommending = true;
        this.syncBusyButtons();
        output?.setAttribute('aria-busy', 'true');
        try {
            this.lastRecommendations = [];
            this.data.state.pension720Results = [];
            this.data.persistTemporaryResultsToSession?.();
            const engine = new Pension720Engine(this.data.state.pension720Stats);
            this.data.setStrategyPrefs('pension720', options.request);
            this.data.save();
            this.lastRecommendationOptions = options;
            this.lastRecommendations = engine.recommend(options);
            if (localToken !== this.recommendationToken) return;
            this.data.state.pension720Results = this.lastRecommendations;
            this.data.persistTemporaryResultsToSession?.();
            this.renderRecommendations(this.lastRecommendations);
            UIManager.toast(`연금복권 추천 ${this.lastRecommendations.length}개를 만들었습니다.`, 'success');
        } finally {
            if (localToken === this.recommendationToken) {
                this.isRecommending = false;
                this.syncBusyButtons();
            }
            output?.setAttribute('aria-busy', 'false');
        }
    }

    renderRecommendations(recommendations = []) {
        const out = $('#pension720Output');
        clearElement(out);
        if (!out) return;
        const notice = $('#pension720ResultTempNotice');
        if (notice) notice.hidden = !recommendations.length;

        if (!recommendations.length) {
            out.appendChild(makeEl('p', 'empty-state', '추천 시작을 누르면 연금복권 번호가 표시됩니다.'));
            return;
        }

        const request = this.lastRecommendationOptions?.request || this.getRecommendationOptions().request;
        const strategyLabel = getPension720StrategyMeta(request?.strategyId || 'mixed_balance').label;
        const analysisLabel = getAnalysisPresetLabelFromRequest(request);
        recommendations.forEach((item, index) => {
            const card = makeEl('article', 'p720-card');
            const head = makeEl('div', 'p720-card-head');
            head.appendChild(makeEl('span', 'rank-badge', `#${index + 1}`));
            head.appendChild(
                makeEl('span', 'badge', `${item.strategyLabel || strategyLabel} · ${analysisLabel} · 점수 ${Number(item.score || 0).toFixed(1)}`)
            );
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
        const strategyRequest = this.lastRecommendationOptions?.request || this.getStrategyRequestFromUI();
        const result = this.data.addPension720Ticket({
            group,
            number: recommendation.number,
            score: recommendation.score,
            source: 'recommendation',
            strategyRequest,
            memo: getPension720StrategyMeta(strategyRequest.strategyId).label
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
        const strategyRequest = this.lastRecommendationOptions?.request || this.getStrategyRequestFromUI();
        const result = this.data.addPension720TicketsBulk(
            groups.map((group) => ({
                group,
                number: recommendation.number,
                score: recommendation.score,
                source: 'recommendation',
                strategyRequest,
                memo: getPension720StrategyMeta(strategyRequest.strategyId).label,
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

    getCampaignRuntimeRequest(baseRequest, index = 0) {
        const seed = baseRequest?.params?.seed;
        const hasSeed = seed !== null && seed !== undefined && seed !== '' && Number.isFinite(Number(seed));
        return {
            ...baseRequest,
            params: {
                ...(baseRequest?.params || {}),
                seed: hasSeed ? Math.floor(Number(seed)) + Math.max(0, Math.floor(Number(index) || 0)) : null
            }
        };
    }

    async runCampaignRecommendation() {
        if (this.isRecommending || this.isGeneratingCampaign) return false;
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        if (!this.data.state.pension720Stats.length) {
            UIManager.toast('연금복권 데이터가 없습니다. 최신 데이터 확인을 먼저 실행해주세요.', 'error');
            return false;
        }

        const startDrawNo = Math.max(1, Math.floor(this.readNumberInput('pension720CampaignStartDraw', this.getSuggestedNextDrawNo())));
        const weeks = Math.max(1, Math.floor(this.readNumberInput('pension720CampaignWeeks', 4)));
        const setsPerDraw = Math.max(1, Math.floor(this.readNumberInput('pension720CampaignSetsPerDraw', 3)));
        const totalRequested = weeks * setsPerDraw;

        if (weeks > CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS) {
            UIManager.toast(`캠페인 회차 수는 최대 ${CONFIG.LIMITS.MAX_CAMPAIGN_WEEKS}회입니다.`, 'warning');
            return false;
        }
        if (setsPerDraw > CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK) {
            UIManager.toast(`회차당 세트 수는 최대 ${CONFIG.LIMITS.MAX_CAMPAIGN_SETS_PER_WEEK}세트입니다.`, 'warning');
            return false;
        }
        if (totalRequested > CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS) {
            UIManager.toast(`캠페인 총 번호 수는 최대 ${CONFIG.LIMITS.MAX_CAMPAIGN_TOTAL_TICKETS}개입니다.`, 'warning');
            return false;
        }

        const localToken = ++this.campaignToken;
        this.isGeneratingCampaign = true;
        this.syncBusyButtons();
        try {
            const engine = new Pension720Engine(this.data.state.pension720Stats);
            const baseRequest = this.getStrategyRequestFromUI();
            const campaignId = this.data.createId('p720_campaign');
            const strategyLabel = getPension720StrategyMeta(baseRequest.strategyId).label;
            const createdAt = new Date().toISOString();
            const tickets = [];
            let totalCreated = 0;

            for (let i = 0; i < weeks; i++) {
                const targetDrawNo = startDrawNo + i;
                const runtimeRequest = this.getCampaignRuntimeRequest(baseRequest, i);
                const recommendations = engine.recommend({
                    setCount: setsPerDraw,
                    request: runtimeRequest
                });
                recommendations.forEach((recommendation) => {
                    tickets.push({
                        group: recommendation.group,
                        number: recommendation.number,
                        score: recommendation.score,
                        source: 'campaign',
                        targetDrawNo,
                        campaignId,
                        strategyRequest: runtimeRequest,
                        memo: `${strategyLabel} · ${startDrawNo}-${startDrawNo + weeks - 1}회`,
                        createdAt
                    });
                    totalCreated++;
                });
            }

            if (localToken !== this.campaignToken) return false;
            const result = this.data.addPension720TicketsBulk(tickets, { silent: true });
            let campaign = null;
            if (result.inserted > 0) {
                campaign = this.data.addPension720Campaign({
                    id: campaignId,
                    name: `${startDrawNo}회 시작 ${weeks}회`,
                    startDrawNo,
                    weeks,
                    setsPerDraw,
                    strategyRequest: baseRequest,
                    createdAt
                });
            }
            this.data.setStrategyPrefs('pension720', baseRequest);
            this.data.save();
            this.renderSavedTickets();
            this.renderCampaigns();

            if (totalCreated < totalRequested) {
                UIManager.toast(`필터 조건으로 ${totalCreated}/${totalRequested}개만 생성되었습니다.`, 'warning', 3500);
            }
            if (campaign && result.inserted > 0) {
                UIManager.toast(`연금복권 캠페인 생성 완료: 저장 번호 ${result.inserted}개 반영`, 'success');
            } else if (totalCreated > 0) {
                UIManager.toast('생성된 연금복권 번호가 모두 중복되어 캠페인을 저장하지 않았습니다.', 'warning', 3500);
            } else {
                UIManager.toast('생성된 연금복권 번호가 없어 캠페인을 저장하지 않았습니다.', 'warning', 3500);
            }
            return Boolean(campaign);
        } finally {
            if (localToken === this.campaignToken) {
                this.isGeneratingCampaign = false;
                this.syncBusyButtons();
            }
        }
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
            const meta = [
                ticket.targetDrawNo ? `${ticket.targetDrawNo}회` : '',
                ticket.memo || '',
                `${formatDate(ticket.createdAt.slice(0, 10))} 저장`
            ]
                .filter(Boolean)
                .join(' · ');
            main.appendChild(makeEl('span', 'result-meta', meta));
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

    renderCampaigns() {
        const list = $('#pension720CampaignList');
        const summary = $('#pension720CampaignSummary');
        const campaigns = this.data.state.pension720Campaigns || [];
        clearElement(list);
        if (summary) summary.textContent = `${campaigns.length}개 캠페인`;
        if (!list) return;

        if (!campaigns.length) {
            list.appendChild(makeEl('p', 'empty-state', '생성한 연금복권 캠페인이 없습니다.'));
            return;
        }

        campaigns.forEach((campaign) => {
            const row = makeEl('div', 'p720-saved-row');
            const main = makeEl('div', 'p720-saved-main');
            const ticketCount = this.data.countPension720TicketsByCampaignId(campaign.id);
            main.appendChild(makeEl('strong', '', campaign.name));
            main.appendChild(
                makeEl(
                    'span',
                    'result-meta',
                    `${campaign.startDrawNo}회부터 ${campaign.weeks}회 · 회차당 ${campaign.setsPerDraw}개 · 저장 ${ticketCount}개`
                )
            );
            row.appendChild(main);
            const del = makeEl('button', 'btn ghost sm', '삭제');
            del.type = 'button';
            del.addEventListener('click', async () => {
                const confirmed = await UIManager.confirm({
                    title: '연금복권 캠페인 삭제',
                    message: `'${campaign.name}' 캠페인과 연결 저장 번호 ${ticketCount}개를 삭제합니다.`,
                    confirmText: '삭제',
                    cancelText: '취소'
                });
                if (!confirmed) return;
                const result = this.data.removePension720Campaign(campaign.id, { cascadeTickets: true });
                if (result.removedCampaign) {
                    UIManager.toast(
                        `연금복권 캠페인 1개, 연결 번호 ${result.removedTickets}개를 삭제했습니다.`,
                        'success'
                    );
                    this.renderSavedTickets();
                    this.renderCampaigns();
                    this.renderCheckPlaceholder(true);
                }
            });
            row.appendChild(del);
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
            this.renderCampaigns();
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
        const header = ['group', 'number', 'targetDrawNo', 'campaignId', 'source', 'score', 'memo', 'createdAt'];
        const rows = tickets.map((ticket) =>
            [
                ticket.group,
                ticket.number,
                ticket.targetDrawNo || '',
                ticket.campaignId || '',
                ticket.source,
                ticket.score || 0,
                ticket.memo || '',
                ticket.createdAt
            ]
                .map(escapeCsvCell)
                .join(',')
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
