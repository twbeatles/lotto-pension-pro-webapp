import { backtestEventMethods } from './events.js';
import { backtestRenderingMethods } from './rendering.js';
import { backtestStrategyFormMethods } from './strategyForm.js';

export const backtestUiMethods = {
    ...backtestEventMethods,
    ...backtestRenderingMethods,
    ...backtestStrategyFormMethods
};
