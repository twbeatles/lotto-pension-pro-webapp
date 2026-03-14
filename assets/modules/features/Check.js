import { $, $$ } from '../utils/utils.js';
import { UIManager } from '../core/UIManager.js';

export class CheckModule {
  constructor(app) {
    this.app = app;
    this.data = app.data;
    this.source = 'favorites'; // 'favorites' | 'history' | 'scanned' | 'tickets'
    this.mode = 'latest'; // 'latest' | 'all'
    this.scanned = [];
    this.currentTicket = null;
    this.currentDrawNo = null;
    this.bindEvents();
  }

  bindEvents() {
    $$('.seg-btn[data-source]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const src = e.currentTarget.dataset.source;
        if (['favorites', 'history', 'scanned', 'tickets'].includes(src)) {
          this.setSource(src);
        }
      });
    });

    $$('.seg-btn[data-checkmode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.checkmode;
        if (mode !== 'latest' && mode !== 'all') return;
        this.mode = mode;
        $$('.seg-btn[data-checkmode]').forEach(x => x.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.resetResult();
      });
    });

    $('#doCheckBtn')?.addEventListener('click', () => this.run());
    $('#openQrScannerBtn')?.addEventListener('click', () => this.app.qr.start());

    $('#checkResultArea')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
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
    $$('.seg-btn[data-source]').forEach(x => {
      x.classList.toggle('active', x.dataset.source === src);
      if (src === 'scanned' && x.dataset.source === 'scanned') {
        x.style.display = 'inline-block'; // Ensure it's visible if hidden
      }
    });
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

    // Show/Enable Scanned tab
    const scanBtn = $(`.seg-btn[data-source="scanned"]`);
    if (scanBtn) {
      scanBtn.style.display = 'inline-block';
      scanBtn.click(); // Switch to it
    } else {
      // Fallback if button doesn't exist in HTML yet (we should add it)
      this.setSource('scanned');
    }

    UIManager.toast(`${games.length}개 게임을 스캔했습니다.`, 'success');
  }

  onEnter() {
    // Sync UI active state
    $$('.seg-btn[data-source]').forEach(x => {
      x.classList.toggle('active', x.dataset.source === this.source);
    });
    $$('.seg-btn[data-checkmode]').forEach(x => {
      x.classList.toggle('active', x.dataset.checkmode === this.mode);
    });
    this.renderList();
    this.resetResult();
  }

  getList() {
    if (this.source === 'scanned') return this.scanned;
    if (this.source === 'tickets') return this.data.state.ticketBook || [];
    return this.source === 'history' ? this.data.state.history : this.data.state.favorites;
  }

  getTicketStatusLabel(item) {
    if (!item?.checked) return '미정산';
    if (Number(item.checked.rank) > 0) return `${item.checked.rank}등`;
    return '미당첨';
  }

  renderList() {
    const listEl = $('#checkTargetList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const items = this.getList();
    items.forEach((item, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      let label = '즐겨찾기';
      if (this.source === 'history') label = '히스토리';
      if (this.source === 'scanned') {
        label = Number(item?.targetDrawNo) > 0
          ? `스캔결과 ${item.targetDrawNo}회`
          : '스캔결과';
      }
      if (this.source === 'tickets') {
        label = `티켓 ${item.targetDrawNo}회`;
        opt.textContent = `[${label}][${this.getTicketStatusLabel(item)}] ${item.numbers.join(', ')}`;
      } else {
        opt.textContent = `[${label}] ${item.numbers.join(', ')}`;
      }
      listEl.appendChild(opt);
    });
  }

  resetResult() {
    const area = $('#checkResultArea');
    if (!area) return;
    area.classList.add('check-result-placeholder');
    area.innerHTML = `
      <i class="ph ph-magnifying-glass" style="font-size: 48px; color: var(--muted);"></i>
      <p>좌측에서 번호를 선택하고 확인 버튼을 누르세요.</p>
    `;
  }

  renderTicketBalls(nums, winSet) {
    return nums.map(n => {
      const hit = winSet.has(n) ? 'hit' : '';
      return `<span class="ball ${UIManager.getBallColor(n)} sm ${hit}">${n}</span>`;
    }).join('');
  }

  run() {
    if (!this.data.state.winningStats.length) {
      return UIManager.toast('당첨 데이터가 없습니다. 데이터 파일을 확인해주세요.', 'error', 3000);
    }

    const listEl = $('#checkTargetList');
    this.data.warnIfDataStale?.('번호 확인');

    const idx = listEl?.selectedIndex ?? -1;
    if (idx < 0) return UIManager.toast('비교할 번호를 선택하세요.', 'warning');

    const items = this.getList();
    const ticket = items[idx];
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
      ? this.data.state.winningStats.find((x) => Number(x.draw_no) === preferredDrawNo)
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
    const matchCount = ticket.numbers.filter(n => winSet.has(n)).length;
    const bonusHit = ticket.numbers.includes(latest.bonus);
    const rank = this._rank(matchCount, bonusHit);

    const area = $('#checkResultArea');
    if (!area) return;
    area.classList.remove('check-result-placeholder');

    const rankText = rank ? `${rank}등` : '낙첨';
    const hitText = (rank === 2) ? '5+보너스' : `${matchCount}`;

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
            <span class="ball ${UIManager.getBallColor(latest.bonus)} sm" style="margin-left:8px; opacity:0.85">+${latest.bonus}</span>
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
      const matchCount = ticket.numbers.filter(n => winSet.has(n)).length;
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

    const note = results.length > 50 ? `<div class="meta">표시 제한: 상위 50개만 보여줍니다. (총 ${results.length}개)</div>` : `<div class="meta">총 ${results.length}개 회차에서 3개 이상 적중했습니다.</div>`;

    const cards = limited.map(r => {
      const rankText = `${r.rank}등`;
      const badgeCls = r.rank ? 'ok' : 'no';
      const hitText = (r.rank === 2) ? '5+보너스' : String(r.matchCount);
      return `
        <div class="check-card">
          <div class="check-head">
            <div class="title">${r.draw_no}회 (${r.date})</div>
            <div class="badge ${badgeCls}">${rankText}</div>
          </div>
          <div class="check-section">
            <div class="label">당첨 번호</div>
            <div class="ball-container sm">
              ${UIManager.renderBalls(r.numbers, 'sm')}
              <span class="ball ${UIManager.getBallColor(r.bonus)} sm" style="margin-left:8px; opacity:0.85">+${r.bonus}</span>
            </div>
          </div>
          <div class="check-section">
            <div class="label">내 번호</div>
            <div class="ball-container sm">${this.renderTicketBalls(ticket.numbers, r.winSet)}</div>
            <div class="meta">적중: <b>${hitText}</b> / 보너스: <b>${r.bonusHit ? '있음' : '없음'}</b></div>
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
