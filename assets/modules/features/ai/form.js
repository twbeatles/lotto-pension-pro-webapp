import { aiFormStrategyMethods } from './form/strategy.js';
import { aiFormReaderMethods } from './form/readers.js';
import { aiFormDelegationMethods } from './form/delegation.js';

export const aiFormMethods = {
    ...aiFormStrategyMethods,
    ...aiFormReaderMethods,
    ...aiFormDelegationMethods
};