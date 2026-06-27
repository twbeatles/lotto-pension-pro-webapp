import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { escapeHtml } from '../../../utils/dom.js';

export const checkResultSingleDrawMethods = {
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
    }
};