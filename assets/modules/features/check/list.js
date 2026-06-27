import { checkListAccessorMethods } from './list/accessors.js';
import { checkListVisibilityMethods } from './list/visibility.js';
import { checkListSelectionMethods } from './list/selection.js';
import { checkListRenderMethods } from './list/render.js';

export const checkListMethods = {
    ...checkListAccessorMethods,
    ...checkListVisibilityMethods,
    ...checkListSelectionMethods,
    ...checkListRenderMethods
};