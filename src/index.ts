import './polyfills.ts';

import type { API } from 'homebridge';

import { KonnectedStandalonePlatform } from './platform.ts';
import { PLATFORM_NAME } from './settings.ts';

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, KonnectedStandalonePlatform);
};
