import { pension720CampaignGenerationMethods } from './campaigns/generation.js';
import { pension720CampaignRenderMethods } from './campaigns/render.js';

export const pension720CampaignMethods = {
    ...pension720CampaignGenerationMethods,
    ...pension720CampaignRenderMethods
};