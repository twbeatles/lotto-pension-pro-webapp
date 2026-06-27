import { dataSyncRangeConcurrencyMethods } from './range/concurrency.js';
import { dataSyncRangeFetchMethods } from './range/fetchRange.js';
import { dataSyncRangeSingleFetchMethods } from './range/fetchSingle.js';
import { dataSyncRangeChunkedMethods } from './range/chunked.js';

export const dataSyncRangeMethods = {
    ...dataSyncRangeConcurrencyMethods,
    ...dataSyncRangeFetchMethods,
    ...dataSyncRangeSingleFetchMethods,
    ...dataSyncRangeChunkedMethods
};