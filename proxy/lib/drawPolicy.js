import { estimateLatestDrawKST } from '../../assets/modules/utils/utils.js';

const TTL_NEAR_LATEST_SECONDS = 60;
const TTL_HISTORICAL_SECONDS = 6 * 60 * 60;
const TTL_HISTORICAL_RANGE_SECONDS = 12 * 60 * 60;
const MAX_FUTURE_DRAW_SLACK = 1;

export {
    TTL_NEAR_LATEST_SECONDS,
    TTL_HISTORICAL_SECONDS,
    TTL_HISTORICAL_RANGE_SECONDS,
    MAX_FUTURE_DRAW_SLACK
};

export const getMaxAllowedDrawNo = (nowKstUtc = undefined) =>
    estimateLatestDrawKST(nowKstUtc) + MAX_FUTURE_DRAW_SLACK;

export const isAllowedProxyDrawNo = (drawNo, nowKstUtc = undefined) =>
    Number.isInteger(drawNo) && drawNo >= 1 && drawNo <= getMaxAllowedDrawNo(nowKstUtc);

const isNearLatestDraw = (drawNo) => {
    const latestEstimate = estimateLatestDrawKST();
    return Number(drawNo) >= Math.max(latestEstimate - 1, 1);
};

export { isNearLatestDraw };

const resolveLatestTtl = (drawNo) => (isNearLatestDraw(drawNo) ? TTL_NEAR_LATEST_SECONDS : TTL_HISTORICAL_SECONDS);
const resolveRangeTtl = (to) => (isNearLatestDraw(to) ? TTL_NEAR_LATEST_SECONDS : TTL_HISTORICAL_RANGE_SECONDS);

export { resolveLatestTtl, resolveRangeTtl };
