import { $ } from '../../utils/utils.js';
import { UIManager } from '../../core/UIManager.js';

export const dataIoStatusMethods = {
    renderDataStatusSummary() {
        const container = $('#dataStatusSummary');
        if (!container) return;
        container.replaceChildren();

        const freshness = this.data.getDataFreshness?.() || {};
        const pensionHealth = this.data.mergePension720DataHealth?.(
            this.data.pension720DataHealth || this.data.getDefaultPension720DataHealth?.()
        );
        const pensionLatest = this.data.state.pension720Stats?.[0] || null;
        const syncMeta = this.data.state.syncMeta || this.data.getDefaultSyncMeta?.() || {};
        const localUpdates = this.data.getLocalUpdates?.() || [];
        const storageSummary = this.data.getStorageSummary?.() || { counts: {} };

        const makeCard = (title, rows = [], status = '') => {
            const card = document.createElement('div');
            card.className = 'data-status-card';
            const head = document.createElement('div');
            head.className = 'data-status-head';
            const titleEl = document.createElement('strong');
            titleEl.textContent = title;
            head.appendChild(titleEl);
            if (status) {
                const badge = document.createElement('span');
                badge.className = 'badge status-badge';
                badge.textContent = status;
                head.appendChild(badge);
            }
            card.appendChild(head);
            rows.forEach(([label, value]) => {
                const row = document.createElement('div');
                row.className = 'data-status-row';
                const labelEl = document.createElement('span');
                labelEl.textContent = label;
                const valueEl = document.createElement('b');
                valueEl.textContent = value || '-';
                row.append(labelEl, valueEl);
                card.appendChild(row);
            });
            return card;
        };

        const lottoCard = makeCard(
            '로또 6/45',
            [
                ['source', this.data.getDataHealthSourceLabel?.(freshness.source) || freshness.source || '-'],
                ['최신 회차', freshness.latestDrawNo ? `${freshness.latestDrawNo}회` : '-'],
                ['예상 최신', freshness.estimatedLatestDrawNo ? `${freshness.estimatedLatestDrawNo}회` : '-'],
                ['local update', `${localUpdates.length}건`],
                ['마지막 성공', syncMeta.lastSuccessAt ? this.app.formatDateTime(syncMeta.lastSuccessAt) : '-'],
                ['메시지', freshness.dataHealthMessage || syncMeta.lastFailureMessage || '-'],
                [
                    '동기화 경로',
                    this.data.resolveProxyConfig?.()?.url
                        ? '고급 연결 주소 우선'
                        : '기본 자동 동기화(필요 시 서드파티 CORS 프록시 경유)'
                ]
            ],
            freshness.availability === 'full' ? '정상' : '확인 필요'
        );
        const pensionCard = makeCard(
            '연금복권720+',
            [
                [
                    'source',
                    this.data.getPension720DataHealthSourceLabel?.(pensionHealth?.source) ||
                        pensionHealth?.source ||
                        '-'
                ],
                ['최신 회차', pensionLatest ? `${pensionLatest.draw_no}회` : '-'],
                ['최신 번호', pensionLatest ? `${pensionLatest.group}조 ${pensionLatest.number}` : '-'],
                ['저장 번호', `${storageSummary.counts?.pension720Tickets || 0}개`],
                ['캠페인', `${storageSummary.counts?.pension720Campaigns || 0}개`],
                ['마지막 확인', pensionHealth?.updatedAt ? this.app.formatDateTime(pensionHealth.updatedAt) : '-'],
                ['메시지', pensionHealth?.message || '-']
            ],
            pensionHealth?.availability === 'full' ? '정상' : '확인 필요'
        );

        if (pensionHealth?.source === 'official_cache') {
            const actions = document.createElement('div');
            actions.className = 'data-status-actions';
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'btn ghost sm';
            clearBtn.textContent = '캐시 삭제';
            clearBtn.addEventListener('click', async () => {
                const cleared = this.data.clearPension720StatsCache?.();
                if (!cleared) {
                    UIManager.toast('삭제할 연금복권 공식 캐시가 없습니다.', 'info', 2500);
                    return;
                }
                await this.data.fetchPension720Stats?.({ remote: false, preserveExistingOnFailure: true });
                UIManager.toast('연금복권 공식 캐시를 삭제했습니다.', 'success', 2500);
                this.renderDataStatusSummary();
            });
            actions.appendChild(clearBtn);
            pensionCard.appendChild(actions);
        }

        container.append(lottoCard, pensionCard);
    }
};
