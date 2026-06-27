import { checkResultCoreMethods } from './results/core.js';
import { checkResultSingleDrawMethods } from './results/singleDraw.js';
import { checkResultAllDrawsMethods } from './results/allDraws.js';

export const checkResultMethods = {
    ...checkResultCoreMethods,
    ...checkResultSingleDrawMethods,
    ...checkResultAllDrawsMethods
};