import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';
import { buildCsvLine } from '../../utils/csv.js';
import { appendDigitBalls, clearElement, formatDate, formatTicket, makeEl } from './dom.js';

export const pension720TicketMethods = {
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
    },

    findSavedTicket(id = '') {
        const targetId = String(id || '').trim();
        return (this.data.state.pension720Tickets || []).find((ticket) => ticket.id === targetId) || null;
    },

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
    },

    copySavedTickets() {
        const tickets = this.data.state.pension720Tickets || [];
        if (!tickets.length) {
            UIManager.toast('복사할 연금복권 번호가 없습니다.', 'warning');
            return;
        }
        UIManager.copyText(tickets.map(formatTicket).join('\n'));
    },

    exportSavedTicketsCsv() {
        const tickets = this.data.state.pension720Tickets || [];
        if (!tickets.length) {
            UIManager.toast('내보낼 연금복권 번호가 없습니다.', 'warning');
            return;
        }
        const header = ['group', 'number', 'targetDrawNo', 'campaignId', 'source', 'score', 'memo', 'createdAt'];
        const rows = tickets.map((ticket) =>
            buildCsvLine([
                ticket.group,
                ticket.number,
                ticket.targetDrawNo || '',
                ticket.campaignId || '',
                ticket.source,
                ticket.score || 0,
                ticket.memo || '',
                ticket.createdAt
            ])
        );
        const csv = `${buildCsvLine(header, { protectFormula: false })}\n${rows.join('\n')}\n`;
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
};
