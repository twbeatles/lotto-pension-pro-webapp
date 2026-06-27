import { generatorFormEventMethods } from './form/events.js';
import { generatorFormOptionMethods } from './form/options.js';
import { generatorFormStrategyMethods } from './form/strategy.js';

export const generatorFormMethods = {
    ...generatorFormEventMethods,
    ...generatorFormOptionMethods,
    ...generatorFormStrategyMethods
};