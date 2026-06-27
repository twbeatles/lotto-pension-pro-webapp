import { generatorActionHelperMethods } from './actions/helpers.js';
import { generatorActionRenderMethods } from './actions/render.js';
import { generatorActionGenerateMethods } from './actions/generate.js';
import { generatorActionCampaignMethods } from './actions/campaign.js';

export const generatorActionMethods = {
    ...generatorActionHelperMethods,
    ...generatorActionRenderMethods,
    ...generatorActionGenerateMethods,
    ...generatorActionCampaignMethods
};