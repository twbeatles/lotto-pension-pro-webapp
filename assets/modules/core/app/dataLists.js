import { appDataListEventMethods } from './dataLists/events.js';
import { appDataListRenderMethods } from './dataLists/render.js';
import { appDataListPaginationMethods } from './dataLists/pagination.js';
import { appDataListStateMethods } from './dataLists/state.js';

export const appDataListMethods = {
    ...appDataListEventMethods,
    ...appDataListRenderMethods,
    ...appDataListPaginationMethods,
    ...appDataListStateMethods
};
