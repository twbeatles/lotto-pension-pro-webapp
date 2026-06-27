import { UIManager } from '../../UIManager.js';

export const dataAnalyticsTicketSettlementMethods = {
    rankTicket(myNums, winNums, bonus) {
        let hit = 0;
        let hasBonus = false;
        myNums.forEach((n) => {
            if (winNums.includes(n)) hit++;
            if (n === bonus) hasBonus = true;
        });

        if (hit === 6) return 1;
        if (hit === 5 && hasBonus) return 2;
        if (hit === 5) return 3;
        if (hit === 4) return 4;
        if (hit === 3) return 5;
        return 0;
    },

    async notifyTicketSettlement(summary = {}, options = {}) {
        const prefs = this.state.alertPrefs || this.getDefaultAlertPrefs();
        if (!prefs.notifyOnNewResult || !summary.settled) return;
        const requestSystemNotification = options.requestSystemNotification !== false;

        const alertKey = `${summary.latestDrawNo || 0}:${summary.settled}:${summary.wins}`;
        if (alertKey === this.lastTicketAlertKey) return;
        this.lastTicketAlertKey = alertKey;

        const message =
            summary.wins > 0
                ? `티켓 정산 완료: ${summary.settled}개 중 당첨 ${summary.wins}개`
                : `티켓 정산 완료: ${summary.settled}개`;

        if (prefs.enableInApp) {
            UIManager.toast(message, summary.wins > 0 ? 'success' : 'info', 3500);
        }

        if (requestSystemNotification && prefs.enableSystemNotification) {
            this.sendSystemNotification('로또·연금복권 프로 티켓 정산', message);
        }
    },

    async reconcileTicketChecks({ silent = true, requestSystemNotification = true } = {}) {
        if (!this.state.ticketBook.length || !this.state.winningStats.length) {
            return {
                rechecked: 0,
                resetToPending: 0,
                wins: 0,
                losses: 0,
                latestDrawNo: this.state.winningStats?.[0]?.draw_no || 0,
                newlySettled: 0,
                newlySettledWins: 0,
                changed: 0
            };
        }

        const drawMap = new Map(this.state.winningStats.map((d) => [Number(d.draw_no), d]));
        const latestDrawNo = Number(this.state.winningStats[0]?.draw_no || 0);

        let rechecked = 0;
        let resetToPending = 0;
        let wins = 0;
        let losses = 0;
        let newlySettled = 0;
        let newlySettledWins = 0;
        let changed = 0;
        const checkedAt = new Date().toISOString();

        for (const ticket of this.state.ticketBook) {
            if (!ticket) continue;

            const hadChecked = Boolean(ticket.checked);
            const quantity = this.getTicketQuantity(ticket);
            const targetDrawNo = Number(ticket.targetDrawNo);
            if (!Number.isFinite(targetDrawNo) || targetDrawNo > latestDrawNo) {
                if (hadChecked) {
                    ticket.checked = null;
                    resetToPending += quantity;
                    changed++;
                }
                continue;
            }

            const draw = drawMap.get(Number(targetDrawNo));
            if (!draw) {
                if (hadChecked) {
                    ticket.checked = null;
                    resetToPending += quantity;
                    changed++;
                }
                continue;
            }

            const rank = this.rankTicket(ticket.numbers, draw.numbers, draw.bonus);
            const nextChecked = {
                drawNo: Number(draw.draw_no),
                rank,
                checkedAt:
                    hadChecked &&
                    Number(ticket.checked?.drawNo) === Number(draw.draw_no) &&
                    Number(ticket.checked?.rank) === rank
                        ? ticket.checked?.checkedAt || checkedAt
                        : checkedAt
            };
            const prevDrawNo = Number(ticket.checked?.drawNo);
            const prevRank = Number(ticket.checked?.rank);

            ticket.checked = nextChecked;
            rechecked += quantity;
            if (rank > 0) wins += quantity;
            else losses += quantity;

            const resultChanged = !hadChecked || prevDrawNo !== nextChecked.drawNo || prevRank !== nextChecked.rank;
            if (resultChanged) changed++;
            if (!hadChecked) {
                newlySettled += quantity;
                if (rank > 0) newlySettledWins += quantity;
            }
        }

        if (changed > 0) {
            this.markDirty('ticketBook');
            this.save(true);
            if (!silent && newlySettled > 0) {
                await this.notifyTicketSettlement(
                    { settled: newlySettled, wins: newlySettledWins, latestDrawNo },
                    { requestSystemNotification }
                );
            }
        }

        return {
            rechecked,
            resetToPending,
            wins,
            losses,
            latestDrawNo,
            newlySettled,
            newlySettledWins,
            changed
        };
    },

    async settlePendingTickets({ silent = true, requestSystemNotification = true } = {}) {
        const summary = await this.reconcileTicketChecks({ silent, requestSystemNotification });
        return {
            settled: summary.newlySettled,
            wins: summary.newlySettledWins,
            latestDrawNo: summary.latestDrawNo,
            rechecked: summary.rechecked,
            resetToPending: summary.resetToPending,
            losses: summary.losses
        };
    }
};