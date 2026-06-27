import { backtestStrategyFormSelectMethods } from './strategyForm/select.js';
import { backtestStrategyFormReaderMethods } from './strategyForm/readers.js';
import { backtestStrategyFormRequestMethods } from './strategyForm/request.js';
import { backtestStrategyFormExportMethods } from './strategyForm/export.js';

export const backtestStrategyFormMethods = {
    ...backtestStrategyFormSelectMethods,
    ...backtestStrategyFormReaderMethods,
    ...backtestStrategyFormRequestMethods,
    ...backtestStrategyFormExportMethods
};