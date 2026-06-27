import { backtestRenderingLabelMethods } from './rendering/labels.js';
import { backtestRenderingChartMethods } from './rendering/charts.js';
import { backtestRenderingSummaryMethods } from './rendering/summary.js';
import { backtestRenderingWinRowMethods } from './rendering/winRows.js';

export const backtestRenderingMethods = {
    ...backtestRenderingLabelMethods,
    ...backtestRenderingChartMethods,
    ...backtestRenderingSummaryMethods,
    ...backtestRenderingWinRowMethods
};