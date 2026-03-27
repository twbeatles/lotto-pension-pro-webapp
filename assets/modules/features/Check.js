import { $, $$ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';
import { UI_STRINGS } from '../utils/strings.js';

export class CheckModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.source = 'favorites';
        this.mode = 'latest';
        this.ticketStatusFilter = 'all';
        this.searchQuery = '';
        this.scanned = [];
        this.selectedItemKey = '';
        this.currentTicket = null;
        this.currentDrawNo = null;
        this.dateFormatter = new Intl.DateTimeFormat('ko-KR');
        this.bindEvents();
    }

    bindEvents() {
        $$('.seg-btn[data-source]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                const src = event.currentTarget.dataset.source;
                if (['favorites', 'history', 'scanned', 'tickets'].includes(src)) {
                    this.setSource(src);
                }
            });
        });

        $$('.seg-btn[data-checkmode]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                const mode = event.currentTarget.dataset.checkmode;
                if (mode !== 'latest' && mode !== 'all') return;
                this.mode = mode;
                $$('.seg-btn[data-checkmode]').forEach((item) => item.classList.remove('active'));
                event.currentTarget.classList.add('active');
                this.resetResult();
            });
        });

        $$('.seg-btn[data-ticket-filter]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                const filter = event.currentTarget.dataset.ticketFilter || 'all';
                this.ticketStatusFilter = filter;
                this.selectedItemKey = '';
                this.renderList();
                this.resetResult();
            });
        });

        $('#checkSearch')?.addEventListener('input', (event) => {
            this.searchQuery = String(event.currentTarget.value || '').trim().toLowerCase();
            this.selectedItemKey = '';
            this.renderList();
            this.resetResult();
        });

        $('#checkTargetCards')?.addEventListener('click', (event) => {
            const card = event.target.closest('[data-item-key]');
            if (!card) return;
            this.selectedItemKey = card.dataset.itemKey || '';
            this.renderList();
            this.focusSelectedCard();
            this.resetResult();
        });

        $('#checkTargetCards')?.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                this.moveSelection(1);
                return;
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                this.moveSelection(-1);
                return;
            }
            if (event.key === 'Home') {
                event.preventDefault();
                this.moveSelection('start');
                return;
            }
            if (event.key === 'End') {
                event.preventDefault();
                this.moveSelection('end');
            }
        });

        $('#doCheckBtn')?.addEventListener('click', () => this.run());
        $('#openQrScannerBtn')?.addEventListener('click', () => this.app.qr.start());

        $('#checkResultArea')?.addEventListener('click', (event) => {
            const btn = event.target.closest('button[data-action]');
            if (!btn || !this.currentTicket) return;
            const action = btn.dataset.action;
            if (action === 'copy') UIManager.copyNumbers(this.currentTicket);
            if (action === 'qr') UIManager.showQR(this.currentTicket);
            if (action === 'save') {
                const resultEl = $('#checkResultArea .check-result');
                UIManager.saveAsImage(resultEl, `로또_확인_${this.currentDrawNo || '최신'}.png`);
            }
        });
    }

    setSource(src) {
        this.source = src;
        this.selectedItemKey = '';
        this.syncSourceTabs();
        this.renderList();
        this.resetResult();
    }

    setScannedNumbers(games) {
        const now = new Date().toISOString();
        this.scanned = (Array.isArray(games) ? games : [])
            .map((entry) => {
                const rawNumbers = Array.isArray(entry) ? entry : entry?.numbers;
                const numbers = [...new Set((rawNumbers || []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 45))]
                    .sort((a, b) => a - b);
                if (numbers.length !== 6) return null;

                const drawNo = Array.isArray(entry) ? null : Number(entry?.targetDrawNo);
                return {
                    numbers,
                    targetDrawNo: Number.isFinite(drawNo) && drawNo > 0 ? Math.floor(drawNo) : null,
                    date: now
                };
            })
            .filter(Boolean);

        this.source = 'scanned';
        this.selectedItemKey = '';
        this.syncSourceTabs();
        this.renderList();
        this.resetResult();
        if (this.scanned.length) {
            UIManager.toast(UI_STRINGS.check.scannedAdded(this.scanned.length), 'success');
            return;
        }
        UIManager.toast(UI_STRINGS.check.scannedEmpty, 'warning');
    }

    onEnter() {
        this.syncSourceTabs();
        $$('.seg-btn[data-checkmode]').forEach((item) => {
            item.classList.toggle('active', item.dataset.checkmode === this.mode);
        });
        $('#checkSearch') && ($('#checkSearch').value = this.searchQuery);
        this.renderList();
        if (!this.currentTicket) this.resetResult();
    }

    syncSourceTabs() {
        $$('.seg-btn[data-source]').forEach((item) => {
            item.classList.toggle('active', item.dataset.source === this.source);
        });
    }

    getList() {
        if (this.source === 'scanned') return this.scanned;
        if (this.source === 'tickets') return this.data.state.ticketBook || [];
        return this.source === 'history' ? this.data.state.history : this.data.state.favorites;
    }

    getTicketStatusLabel(item) {
        if (!item?.checked) return UI_STRINGS.check.ticketStatus.pending;
        if (Number(item.checked.rank) > 0) return `${item.checked.rank}등`;
        return UI_STRINGS.check.ticketStatus.lose;
    }

    getTicketStatusCode(item) {
        if (!item?.checked) return 'pending';
        if (Number(item.checked.rank) > 0) return 'win';
        return 'lose';
    }

    formatDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return this.dateFormatter.format(date);
    }

    buildItemKey(item, index) {
        if (this.source === 'tickets') return String(item.id || `ticket-${index}`);
        const date = item?.date || item?.createdAt || '';
        return `${this.source}:${index}:${(item?.numbers || []).join(',')}:${date}:${item?.targetDrawNo || ''}`;
    }

    matchesQuery(item, metaText = '') {
        if (!this.searchQuery) return true;
        const haystack = [
            (item?.numbers || []).join(', '),
            item?.targetDrawNo,
            item?.date,
            this.formatDate(item?.date),
            metaText
        ].join(' ').toLowerCase();
        return haystack.includes(this.searchQuery);
    }

    getVisibleItems() {
        const items = this.getList();
        return items.reduce((acc, item, index) => {
            const key = this.buildItemKey(item, index);
            const sourceLabel = UI_STRINGS.check.sourceLabels[this.source] || this.source;
            const ticketStatus = this.source === 'tickets' ? this.getTicketStatusCode(item) : 'all';
            const ticketStatusLabel = this.source === 'tickets' ? this.getTicketStatusLabel(item) : '';

            if (this.source === 'tickets' && this.ticketStatusFilter !== 'all' && ticketStatus !== this.ticketStatusFilter) {
                return acc;
            }

            const metaText = this.source === 'tickets'
                ? `${item.targetDrawNo}회차 ${ticketStatusLabel}`
                : this.source === 'scanned'
                    ? (item.targetDrawNo ? `${item.targetDrawNo}회차 큐알 스캔` : '큐알 스캔 결과')
                    : `${sourceLabel} ${this.formatDate(item.date)}`;

            if (!this.matchesQuery(item, metaText)) return acc;

            acc.push({
                key,
                item,
                index,
                sourceLabel,
                metaText,
                ticketStatus,
                ticketStatusLabel
            });
            return acc;
        }, []);
    }

    ensureSelection(items) {
        if (!items.length) {
            this.selectedItemKey = '';
            return;
        }
        if (items.some((entry) => entry.key === this.selectedItemKey)) return;
        this.selectedItemKey = items[0].key;
    }

    focusSelectedCard() {
        const listEl = $('#checkTargetCards');
        if (!listEl || !this.selectedItemKey) return;
        const cards = Array.from(listEl.querySelectorAll('[data-item-key]'));
        const activeCard = cards.find((card) => card.dataset.itemKey === this.selectedItemKey);
        activeCard?.focus();
    }

    moveSelection(direction) {
        const items = this.getVisibleItems();
        if (!items.length) return;
        this.ensureSelection(items);

        const currentIndex = Math.max(0, items.findIndex((entry) => entry.key === this.selectedItemKey));
        const nextIndex = direction === 'start'
            ? 0
            : direction === 'end'
                ? items.length - 1
                : Math.min(items.length - 1, Math.max(0, currentIndex + Number(direction || 0)));

        if (items[nextIndex]?.key === this.selectedItemKey) return;
        this.selectedItemKey = items[nextIndex].key;
        this.renderList();
        this.focusSelectedCard();
        this.resetResult();
    }

    renderList() {
        const listEl = $('#checkTargetCards');
        const metaEl = $('#checkSelectionMeta');
        const ticketFilterRow = $('#checkTicketStatusRow');
        if (!listEl) return;

        if (ticketFilterRow) ticketFilterRow.hidden = this.source !== 'tickets';
        $$('.seg-btn[data-ticket-filter]').forEach((item) => {
            item.classList.toggle('active', item.dataset.ticketFilter === this.ticketStatusFilter);
        });

        const visibleItems = this.getVisibleItems();
        this.ensureSelection(visibleItems);

        const sourceLabel = UI_STRINGS.check.sourceLabels[this.source] || this.source;
        if (metaEl) {
            metaEl.textContent = visibleItems.length
                ? `${sourceLabel} ${visibleItems.length}개`
                : `${sourceLabel} 항목이 없습니다.`;
        }

        if (!visibleItems.length) {
            listEl.innerHTML = `
                <div class="empty-state check-target-empty">
                    <i class="ph ph-list-magnifying-glass"></i>
                    <h4>${sourceLabel} 항목이 없습니다.</h4>
                    <p>${this.searchQuery ? '검색 조건을 바꾸거나 다른 소스를 선택해보세요.' : '저장된 항목이 생기면 여기에서 바로 확인할 수 있습니다.'}</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = visibleItems.map(({ key, item, index, metaText, sourceLabel: label, ticketStatusLabel }) => {
            const isActive = key === this.selectedItemKey;
            const topBadge = this.source === 'tickets'
                ? `<span class="badge status-badge ${ticketStatusLabel === UI_STRINGS.check.ticketStatus.pending ? 'is-warn' : ticketStatusLabel === UI_STRINGS.check.ticketStatus.lose ? 'is-bad' : 'is-good'}">${ticketStatusLabel}</span>`
                : `<span class="badge status-badge">${label}</span>`;
            const optionId = `check-option-${this.source}-${index}`;

            return `
                <button class="check-target-card ${isActive ? 'active' : ''}" type="button" role="option"
                    id="${optionId}" tabindex="${isActive ? '0' : '-1'}"
                    aria-selected="${String(isActive)}" data-item-key="${key}">
                    <div class="check-target-card-head">
                        ${topBadge}
                        <span class="check-target-card-meta">${metaText}</span>
                    </div>
                    <div class="ball-container sm check-target-card-balls">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                </button>
            `;
        }).join('');
    }

    getSelectedEntry() {
        return this.getVisibleItems().find((entry) => entry.key === this.selectedItemKey) || null;
    }

    resetResult() {
        const area = $('#checkResultArea');
        if (!area) return;
        this.currentTicket = null;
        this.currentDrawNo = null;
        area.classList.add('check-result-placeholder');
        area.innerHTML = `
      <i class="ph ph-magnifying-glass" style="font-size: 48px; color: var(--muted);"></i>
      <p>${UI_STRINGS.check.selectionHint}</p>
    `;
    }

    renderTicketBalls(nums, winSet) {
        return nums.map((n) => {
            const hit = winSet.has(n) ? 'hit' : '';
            return `<span class="ball ${UIManager.getBallColor(n)} sm ${hit}" role="img" aria-label="${n}번 번호">${n}</span>`;
        }).join('');
    }

    run() {
        if (!this.data.state.winningStats.length) {
            return UIManager.toast('당첨 데이터가 없습니다. 데이터 파일을 확인해주세요.', 'error', 3000);
        }

        this.data.warnIfDataStale?.('번호 확인');

        const selected = this.getSelectedEntry();
        if (!selected) return UIManager.toast(UI_STRINGS.check.emptySelection, 'warning');

        const ticket = selected.item;
        if (!ticket) return UIManager.toast('선택 항목을 찾을 수 없습니다.', 'error');

        if (this.mode === 'all') return this.runAll(ticket);
        return this.runLatest(ticket);
    }

    _rank(matchCount, bonusHit) {
        if (matchCount === 6) return 1;
        if (matchCount === 5 && bonusHit) return 2;
        if (matchCount === 5) return 3;
        if (matchCount === 4) return 4;
        if (matchCount === 3) return 5;
        return 0;
    }

    renderMissingTargetDraw(ticket, targetDrawNo) {
        this.currentTicket = ticket.numbers;
        this.currentDrawNo = targetDrawNo;

        const area = $('#checkResultArea');
        if (!area) return;
        area.classList.remove('check-result-placeholder');
        area.innerHTML = `
      <div class="check-result">
        <div class="check-head">
          <div class="title">${targetDrawNo}회 결과 확인 불가</div>
          <div class="badge no">미추첨/데이터 없음</div>
        </div>
        <div class="check-actions">
          <button class="btn ghost sm" data-action="copy"><i class="ph ph-copy"></i> 복사</button>
          <button class="btn ghost sm" data-action="qr"><i class="ph ph-qr-code"></i> 큐알</button>
        </div>
        <div class="check-section">
          <div class="label">내 번호</div>
          <div class="ball-container sm">${UIManager.renderBalls(ticket.numbers, 'sm')}</div>
          <div class="meta">${targetDrawNo}회 결과 데이터가 없습니다. 아직 추첨 전이거나 동기화되지 않았습니다.</div>
        </div>
      </div>
    `;
    }

    runLatest(ticket) {
        const preferredDrawNo = Number(ticket?.targetDrawNo || 0);
        const latest = preferredDrawNo > 0
            ? this.data.state.winningStats.find((item) => Number(item.draw_no) === preferredDrawNo)
            : this.data.state.winningStats[0];
        if (!latest) {
            if (preferredDrawNo > 0) {
                this.renderMissingTargetDraw(ticket, preferredDrawNo);
            } else {
                UIManager.toast('비교 가능한 회차 데이터가 없습니다.', 'warning');
            }
            return;
        }
        this.currentTicket = ticket.numbers;
        this.currentDrawNo = latest.draw_no;
        const winSet = new Set(latest.numbers);
        const matchCount = ticket.numbers.filter((n) => winSet.has(n)).length;
        const bonusHit = ticket.numbers.includes(latest.bonus);
        const rank = this._rank(matchCount, bonusHit);

        const area = $('#checkResultArea');
        if (!area) return;
        area.classList.remove('check-result-placeholder');

        const rankText = rank ? `${rank}등` : '낙첨';
        const hitText = rank === 2 ? '5+보너스' : `${matchCount}`;

        area.innerHTML = `
      <div class="check-result">
        <div class="check-head">
          <div class="title">${latest.draw_no}회 (${latest.date})</div>
          <div class="badge ${rank ? 'ok' : 'no'}">${rankText}</div>
        </div>
        <div class="check-actions">
          <button class="btn ghost sm" data-action="copy"><i class="ph ph-copy"></i> 복사</button>
          <button class="btn ghost sm" data-action="qr"><i class="ph ph-qr-code"></i> 큐알</button>
          <button class="btn ghost sm" data-action="save"><i class="ph ph-download-simple"></i> 저장</button>
        </div>
        <div class="check-section">
          <div class="label">당첨 번호</div>
          <div class="ball-container sm">
            ${UIManager.renderBalls(latest.numbers, 'sm')}
            <span class="ball ${UIManager.getBallColor(latest.bonus)} sm" style="margin-left:8px; opacity:0.85" role="img" aria-label="보너스 ${latest.bonus}번">+${latest.bonus}</span>
          </div>
        </div>
        <div class="check-section">
          <div class="label">내 번호</div>
          <div class="ball-container sm">${this.renderTicketBalls(ticket.numbers, winSet)}</div>
          <div class="meta">적중: <b>${hitText}</b> / 보너스: <b>${bonusHit ? '있음' : '없음'}</b></div>
        </div>
      </div>
    `;
    }

    runAll(ticket) {
        this.currentTicket = ticket.numbers;
        this.currentDrawNo = null;
        const results = [];
        for (const win of this.data.state.winningStats) {
            const winSet = new Set(win.numbers);
            const matchCount = ticket.numbers.filter((n) => winSet.has(n)).length;
            if (matchCount < 3) continue;
            const bonusHit = ticket.numbers.includes(win.bonus);
            const rank = this._rank(matchCount, bonusHit);
            results.push({
                draw_no: win.draw_no,
                date: win.date,
                numbers: win.numbers,
                bonus: win.bonus,
                matchCount,
                bonusHit,
                rank,
                winSet
            });
        }

        results.sort((a, b) => (a.rank - b.rank) || (b.draw_no - a.draw_no));
        const limited = results.slice(0, 50);

        const area = $('#checkResultArea');
        if (!area) return;
        area.classList.remove('check-result-placeholder');

        if (!limited.length) {
            area.innerHTML = `
        <div class="check-result">
          <div class="check-head">
            <div class="title">전체 회차 검사</div>
            <div class="badge no">결과 없음</div>
          </div>
          <div class="check-actions">
            <button class="btn ghost sm" data-action="copy"><i class="ph ph-copy"></i> 복사</button>
            <button class="btn ghost sm" data-action="qr"><i class="ph ph-qr-code"></i> 큐알</button>
          </div>
          <div class="check-section">
            <div class="label">내 번호</div>
            <div class="ball-container sm">${UIManager.renderBalls(ticket.numbers, 'sm')}</div>
            <div class="meta">3개 이상 적중한 회차가 없습니다.</div>
          </div>
        </div>
      `;
            return;
        }

        const note = results.length > 50
            ? `<div class="meta">표시 제한: 상위 50개만 보여줍니다. (총 ${results.length}개)</div>`
            : `<div class="meta">총 ${results.length}개 회차에서 3개 이상 적중했습니다.</div>`;

        const cards = limited.map((result) => {
            const rankText = `${result.rank}등`;
            const badgeCls = result.rank ? 'ok' : 'no';
            const hitText = result.rank === 2 ? '5+보너스' : String(result.matchCount);
            return `
        <div class="check-card">
          <div class="check-head">
            <div class="title">${result.draw_no}회 (${result.date})</div>
            <div class="badge ${badgeCls}">${rankText}</div>
          </div>
          <div class="check-section">
            <div class="label">당첨 번호</div>
            <div class="ball-container sm">
              ${UIManager.renderBalls(result.numbers, 'sm')}
              <span class="ball ${UIManager.getBallColor(result.bonus)} sm" style="margin-left:8px; opacity:0.85" role="img" aria-label="보너스 ${result.bonus}번">+${result.bonus}</span>
            </div>
          </div>
          <div class="check-section">
            <div class="label">내 번호</div>
            <div class="ball-container sm">${this.renderTicketBalls(ticket.numbers, result.winSet)}</div>
            <div class="meta">적중: <b>${hitText}</b> / 보너스: <b>${result.bonusHit ? '있음' : '없음'}</b></div>
          </div>
        </div>
      `;
        }).join('');

        area.innerHTML = `
      <div class="check-result">
        <div class="check-head">
          <div class="title">전체 회차 검사</div>
          <div class="badge ok">${limited.length}개 표시</div>
        </div>
        <div class="check-actions">
          <button class="btn ghost sm" data-action="copy"><i class="ph ph-copy"></i> 복사</button>
          <button class="btn ghost sm" data-action="qr"><i class="ph ph-qr-code"></i> 큐알</button>
        </div>
        <div class="check-section">
          <div class="label">내 번호</div>
          <div class="ball-container sm">${UIManager.renderBalls(ticket.numbers, 'sm')}</div>
          ${note}
        </div>
        <div class="check-cards">${cards}</div>
      </div>
    `;
    }
}
