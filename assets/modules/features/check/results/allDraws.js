import { $ } from '../../../utils/utils.js';
import { UIManager } from '../../../core/UIManager.js';
import { escapeHtml } from '../../../utils/dom.js';

export const checkResultAllDrawsMethods = {
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