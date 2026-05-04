import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { UI_STRINGS } from '../../utils/strings.js';
import { escapeHtml } from '../../utils/dom.js';

export const checkResultMethods = {
    resetResult() {
        const area = $('#checkResultArea');
        if (!area) return;
        this.currentTicket = null;
        this.currentDrawNo = null;
        area.setAttribute('aria-busy', 'false');
        area.classList.add('check-result-placeholder');
        area.innerHTML = `
      <i class="ph ph-magnifying-glass" style="font-size: 48px; color: var(--muted);"></i>
      <p>${UI_STRINGS.check.selectionHint}</p>
    `;
    },

    renderTicketBalls(nums, winSet) {
        return nums
            .map((n) => {
                const hit = winSet.has(n) ? 'hit' : '';
                return `<span class="ball ${UIManager.getBallColor(n)} sm ${hit}" role="img" aria-label="${n}번 번호">${n}</span>`;
            })
            .join('');
    },

    run() {
        if (!this.data.state.winningStats.length) {
            return UIManager.toast('당첨 데이터가 없습니다. 데이터 파일을 확인해주세요.', 'error', 3000);
        }

        this.data.warnIfDataStale?.('번호 확인');

        const selected = this.getSelectedEntry();
        if (!selected) return UIManager.toast(UI_STRINGS.check.emptySelection, 'warning');

        const ticket = selected.item;
        if (!ticket) return UIManager.toast('선택 항목을 찾을 수 없습니다.', 'error');

        const area = $('#checkResultArea');
        area?.setAttribute('aria-busy', 'true');
        try {
            if (this.mode === 'all') return this.runAll(ticket);
            return this.runLatest(ticket);
        } finally {
            area?.setAttribute('aria-busy', 'false');
        }
    },

    _rank(matchCount, bonusHit) {
        if (matchCount === 6) return 1;
        if (matchCount === 5 && bonusHit) return 2;
        if (matchCount === 5) return 3;
        if (matchCount === 4) return 4;
        if (matchCount === 3) return 5;
        return 0;
    },

    renderMissingTargetDraw(ticket, targetDrawNo) {
        this.currentTicket = ticket.numbers;
        this.currentDrawNo = targetDrawNo;
        const quantity = this.data.getTicketQuantity(ticket);

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
          <div class="meta">${targetDrawNo}회 결과 데이터가 없습니다. 아직 추첨 전이거나 동기화되지 않았습니다.${quantity > 1 ? ` / 보유 수량: <b>x${quantity}</b>` : ''}</div>
        </div>
      </div>
    `;
    },

    runLatest(ticket) {
        const preferredDrawNo = Number(ticket?.targetDrawNo || 0);
        const latest =
            preferredDrawNo > 0
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
        const quantity = this.data.getTicketQuantity(ticket);

        area.innerHTML = `
      <div class="check-result">
        <div class="check-head">
          <div class="title">${latest.draw_no}회 (${escapeHtml(latest.date)})</div>
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
          <div class="meta">적중: <b>${hitText}</b> / 보너스: <b>${bonusHit ? '있음' : '없음'}</b>${quantity > 1 ? ` / 보유 수량: <b>x${quantity}</b>` : ''}</div>
        </div>
      </div>
    `;
    },

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

        results.sort((a, b) => a.rank - b.rank || b.draw_no - a.draw_no);
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

        const note =
            results.length > 50
                ? `<div class="meta">표시 제한: 상위 50개만 보여줍니다. (총 ${results.length}개)</div>`
                : `<div class="meta">총 ${results.length}개 회차에서 3개 이상 적중했습니다.</div>`;
        const quantity = this.data.getTicketQuantity(ticket);

        const cards = limited
            .map((result) => {
                const rankText = `${result.rank}등`;
                const badgeCls = result.rank ? 'ok' : 'no';
                const hitText = result.rank === 2 ? '5+보너스' : String(result.matchCount);
                return `
        <div class="check-card">
          <div class="check-head">
            <div class="title">${result.draw_no}회 (${escapeHtml(result.date)})</div>
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
            })
            .join('');

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
          ${quantity > 1 ? `<div class="meta">보유 수량: <b>x${quantity}</b></div>` : ''}
        </div>
        <div class="check-cards">${cards}</div>
      </div>
    `;
    }
};
