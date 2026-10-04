import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { celebrateWin } from '../../utils/celebrate.js';
import { appendDigitBalls, clearElement, formatDate, getTargetAwareCheckSortValue, makeEl } from './dom.js';

export const pension720CheckMethods = {
    renderCheckPlaceholder(force = false) {
        const output = $('#pension720CheckOutput');
        if (force) clearElement(output);
        if (!output || output.childElementCount) return;
        output.appendChild(makeEl('p', 'empty-state', '번호를 저장한 뒤 「확인하기」를 누르세요.'));
    },

    async runLatestCheck() {
        if (!this.data.state.pension720Stats.length) {
            await this.data.fetchPension720Stats({ remote: true, silent: true });
        }
        const latest = this.data.state.pension720Stats?.[0];
        const tickets = this.data.state.pension720Tickets || [];
        if (!latest) {
            UIManager.toast('연금복권 당첨 데이터가 없어요. 「최신 회차 확인」을 먼저 눌러 주세요.', 'error');
            return;
        }
        if (!tickets.length) {
            UIManager.toast('확인할 저장 번호가 없어요. 추천 결과에서 「이 번호 저장」을 눌러 주세요.', 'warning');
            return;
        }
        const results = tickets
            .map((ticket) => this.data.resolvePension720TicketCheck(ticket, { latest }))
            .filter(Boolean)
            .sort((a, b) => getTargetAwareCheckSortValue(a) - getTargetAwareCheckSortValue(b));
        this.renderCheckResults(latest, results);
    },

    renderCheckResults(latest, results = []) {
        const output = $('#pension720CheckOutput');
        clearElement(output);
        if (!output) return;

        const summary = makeEl('div', 'p720-check-summary');
        summary.appendChild(makeEl('strong', '', `최신 ${latest.draw_no}회 · ${formatDate(latest.date)} 추첨`));
        summary.appendChild(
            makeEl('span', '', `1등 ${latest.group}조 ${latest.number} · 보너스 ${latest.bonus_number}`)
        );
        output.appendChild(summary);

        results.forEach(({ ticket, result, status, statusLabel, drawNo }) => {
            const row = makeEl('div', 'p720-check-row');
            const main = makeEl('div', 'p720-saved-main');
            appendDigitBalls(main, ticket.number, { group: ticket.group });
            const basis =
                status === 'target'
                    ? `${drawNo}회 결과`
                    : status === 'pending'
                      ? `${drawNo}회 추첨 대기`
                      : status === 'missing'
                        ? `${drawNo}회 결과 없음`
                        : `최신 ${drawNo}회와 참고 비교`;
            main.appendChild(
                makeEl(
                    'span',
                    'result-meta',
                    result
                        ? `${basis} · ${
                              result.matchType === 'bonus'
                                  ? '보너스 번호 일치'
                                  : `끝자리 ${result.trailingMatches}개 일치`
                          }`
                        : basis
                )
            );
            row.appendChild(main);
            const badgeClass =
                status === 'pending'
                    ? 'badge status-badge is-warn'
                    : result?.rank
                      ? 'badge status-badge is-good'
                      : 'badge status-badge is-bad';
            const badge = makeEl('span', badgeClass, result?.label || statusLabel);
            row.appendChild(badge);
            row.appendChild(makeEl('span', 'p720-check-prize', result?.prizeLabel || '-'));
            output.appendChild(row);
        });

        const bestWin = results
            .filter(({ status, result }) => status === 'target' && Number(result?.rank) > 0)
            .reduce((best, { result }) => Math.min(best, Number(result.rank)), Infinity);
        if (Number.isFinite(bestWin)) void celebrateWin({ rank: bestWin });
    }
};
