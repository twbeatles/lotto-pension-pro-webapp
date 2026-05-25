import { estimateLatestDrawKST } from '../../utils/utils.js';
import { UIManager } from '../UIManager.js';
export const dataAnalyticsMethods = {
    getDataFreshness() {
        const dataHealth = this.mergeDataHealth(this.dataHealth || this.getDefaultDataHealth());
        const latestDrawNo = Math.max(
            0,
            Math.floor(Number(dataHealth.latestDrawNo || this.state.winningStats?.[0]?.draw_no || 0))
        );
        const staticLatestDrawNo = Math.max(0, Math.floor(Number(this.state.staticLatestDrawNo || 0)));
        const estimatedLatestDrawNo = Math.max(0, Math.floor(Number(estimateLatestDrawKST() || 0)));
        const behindBy =
            latestDrawNo > 0 && estimatedLatestDrawNo > 0 ? Math.max(0, estimatedLatestDrawNo - latestDrawNo) : 0;
        const staticBehindBy =
            staticLatestDrawNo > 0 && estimatedLatestDrawNo > 0
                ? Math.max(0, estimatedLatestDrawNo - staticLatestDrawNo)
                : 0;
        const proxyConfig = this.resolveProxyConfig();
        const hasCustomProxy = Boolean(proxyConfig?.url);
        const syncMeta = this.mergeSyncMeta?.(this.state.syncMeta || this.getDefaultSyncMeta?.()) || {};
        const lastFailureMs = Date.parse(syncMeta.lastFailureAt || '');
        const lastSuccessMs = Date.parse(syncMeta.lastSuccessAt || '');
        const failureAfterSuccess =
            Number.isFinite(lastFailureMs) && (!Number.isFinite(lastSuccessMs) || lastFailureMs > lastSuccessMs);
        const recentFailure =
            failureAfterSuccess && Date.now() - lastFailureMs < 10 * 60 * 1000 && Boolean(syncMeta.lastFailureMessage);
        const canAutoSync = !recentFailure || hasCustomProxy;
        return {
            availability: dataHealth.availability,
            source: dataHealth.source,
            dataHealthMessage: dataHealth.message,
            latestDrawNo,
            staticLatestDrawNo,
            estimatedLatestDrawNo,
            behindBy,
            staticBehindBy,
            hasProxy: hasCustomProxy,
            hasCustomProxy,
            canAutoSync,
            autoSyncBlockedReason: canAutoSync ? '' : syncMeta.lastFailureMessage || 'recent sync failure',
            isPartial: dataHealth.availability === 'partial',
            isUnavailable: dataHealth.availability === 'none' || latestDrawNo <= 0,
            isStale: dataHealth.availability === 'full' && behindBy > 0
        };
    },

    getDataFreshnessSummary(freshness = this.getDataFreshness()) {
        const latest = Math.max(0, Math.floor(Number(freshness.latestDrawNo || 0)));
        const estimated = Math.max(0, Math.floor(Number(freshness.estimatedLatestDrawNo || 0)));
        const behindBy =
            latest > 0 && estimated > 0 ? Math.max(0, Math.floor(Number(freshness.behindBy ?? estimated - latest))) : 0;
        const latestLabel = latest > 0 ? `${latest}회` : '없음';
        const estimatedLabel = estimated > 0 ? `${estimated}회` : '계산 중';
        const gapLabel = latest > 0 && estimated > 0 ? `${behindBy}회` : '-';
        return `내 데이터: ${latestLabel} / 예상 최신: ${estimatedLabel} / 차이 ${gapLabel}`;
    },

    getStaleDataMessage(featureLabel = '기능') {
        const freshness = this.getDataFreshness();
        if (freshness.isPartial) {
            return `${featureLabel}은 사용할 수 있지만 현재 데이터는 일부만 사용 중입니다. 최신 회차 일부만 반영되어 결과가 제한될 수 있습니다.`;
        }
        if (freshness.isUnavailable) {
            return `${featureLabel}에 필요한 당첨 데이터가 없습니다. 먼저 동기화를 시도해주세요.`;
        }
        if (!freshness.isStale) return '';
        return `${featureLabel}을 계속 진행할 수 있지만 최신 데이터가 ${freshness.behindBy}회차 뒤처져 있을 수 있습니다.`;
    },

    warnIfDataStale(featureLabel = '기능') {
        const message = this.getStaleDataMessage(featureLabel);
        if (message) {
            UIManager.toast(message, 'warning', 4200);
        }
        return this.getDataFreshness();
    },

    getNotificationPermissionState() {
        if (typeof Notification === 'undefined') {
            return { code: 'unsupported', label: '지원 안 함' };
        }
        if (Notification.permission === 'granted') {
            return { code: 'granted', label: '허용됨' };
        }
        if (Notification.permission === 'denied') {
            return { code: 'denied', label: '차단됨' };
        }
        return { code: 'prompt', label: '권한 필요' };
    },

    async requestNotificationPermission() {
        if (typeof Notification === 'undefined') {
            return this.getNotificationPermissionState();
        }
        let permission = Notification.permission;
        if (permission === 'default') {
            try {
                permission = await Notification.requestPermission();
            } catch (e) {
                permission = Notification.permission || 'default';
            }
        }
        if (permission === 'granted') return { code: 'granted', label: '허용됨' };
        if (permission === 'denied') return { code: 'denied', label: '차단됨' };
        return { code: 'prompt', label: '권한 필요' };
    },

    sendSystemNotification(title, body) {
        const permission = this.getNotificationPermissionState();
        if (permission.code !== 'granted') return false;
        try {
            new Notification(title, { body });
            return true;
        } catch (e) {
            console.warn('시스템 알림 전송 실패', e);
            return false;
        }
    },

    sendTestSystemNotification() {
        return this.sendSystemNotification(
            '로또·연금복권 프로 테스트 알림',
            '시스템 알림 권한과 연결 상태가 정상입니다.'
        );
    },

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
    },

    buildAnalyticsCache() {
        const source = this.state.winningStats || [];
        if (!source.length) {
            this.state.analytics = {
                id: 'empty',
                freq: Array(46).fill(0),
                rangeCounts: [0, 0, 0, 0, 0],
                oddEven: [0, 0],
                topPairs: [],
                hot: [],
                cold: []
            };
            return this.state.analytics;
        }

        const freq = Array(46).fill(0);
        const rangeCounts = [0, 0, 0, 0, 0];
        const oddEven = [0, 0];
        const pairCounts = new Map();

        source.forEach((d) => {
            const nums = d.numbers || [];
            nums.forEach((n) => {
                if (n < 1 || n > 45) return;
                freq[n]++;
                if (n <= 10) rangeCounts[0]++;
                else if (n <= 20) rangeCounts[1]++;
                else if (n <= 30) rangeCounts[2]++;
                else if (n <= 40) rangeCounts[3]++;
                else rangeCounts[4]++;
                if (n % 2 === 0) oddEven[0]++;
                else oddEven[1]++;
            });

            for (let i = 0; i < nums.length; i++) {
                for (let j = i + 1; j < nums.length; j++) {
                    const pair = `${nums[i]}-${nums[j]}`;
                    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
                }
            }
        });

        const indexed = freq
            .map((c, i) => ({ n: i, c }))
            .slice(1)
            .sort((a, b) => b.c - a.c);

        const hot = indexed.slice(0, 5);
        const cold = indexed.slice(-5).reverse();

        const topPairs = Array.from(pairCounts.entries())
            .map(([k, count]) => ({ pair: k.split('-').map(Number), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const latestNo = source[0]?.draw_no || 0;
        this.state.analytics = {
            id: `${latestNo}:${source.length}`,
            freq,
            rangeCounts,
            oddEven,
            topPairs,
            hot,
            cold
        };
        return this.state.analytics;
    },

    getAnalytics() {
        return this.state.analytics || this.buildAnalyticsCache();
    }
};
