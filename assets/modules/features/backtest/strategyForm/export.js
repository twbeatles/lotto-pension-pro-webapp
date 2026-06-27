import { UIManager } from '../../../core/UIManager.js';
import { UI_STRINGS } from '../../../utils/strings.js';
import { buildCsvLine } from '../../../utils/csv.js';

export const backtestStrategyFormExportMethods = {
    exportComparisonCsv() {
        if (!this.lastComparisons.length) {
            UIManager.toast(UI_STRINGS.backtest.emptyExport, 'warning');
            return;
        }

        const header = [
            'strategy_id',
            'strategy_label',
            'roi',
            'hit_rate',
            'draws',
            'tickets',
            'total_cost',
            'total_prize',
            'win_count'
        ];
        const lines = [buildCsvLine(header, { protectFormula: false })];
        this.lastComparisons.forEach((x) => {
            lines.push(
                buildCsvLine([
                    x.strategyId || '',
                    this.getStrategyLabel(x.strategyId),
                    Number(x.roi || 0).toFixed(4),
                    Number(x.hitRate || 0).toFixed(4),
                    Number(x.draws || 0),
                    Number(x.tickets || 0),
                    Number(x.cost || 0),
                    Number(x.totalPrize || 0),
                    Number(x.winCount || 0)
                ])
            );
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `시뮬레이션_전략비교_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        UIManager.toast(UI_STRINGS.backtest.exported, 'success');
    }
};