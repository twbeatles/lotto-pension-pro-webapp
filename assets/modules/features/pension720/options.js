import { pension720OptionBusyButtonMethods } from './options/busyButtons.js';
import { pension720OptionParserMethods } from './options/parsers.js';
import { pension720OptionStrategySelectMethods } from './options/strategySelect.js';
import { pension720OptionStrategyRequestMethods } from './options/strategyRequest.js';
import { pension720OptionResetMethods } from './options/resets.js';

export const pension720OptionMethods = {
    ...pension720OptionBusyButtonMethods,
    ...pension720OptionParserMethods,
    ...pension720OptionStrategySelectMethods,
    ...pension720OptionStrategyRequestMethods,
    ...pension720OptionResetMethods
};